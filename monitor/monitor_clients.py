from fastapi import APIRouter, Request, Depends
from auth import require_admin, get_account_id
from monitor_core import _validate_days_extended, get_inbox_channel_map, resolve_channel, get_team_names

router = APIRouter()


@router.get("/monitor/api/labels")
async def labels_stats(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM monitor.v_label_stats WHERE account_id = $1", account_id)
    return [dict(r) for r in rows]


@router.get("/monitor/api/companies")
async def companies(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM monitor.v_company_metrics WHERE account_id = $1 ORDER BY total_conversations DESC LIMIT 50",
            account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/summary")
async def clients_summary(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.cd_cliente, 'sem-codigo-' || cs.contact_id) AS client_key,
                COALESCE(cs.razao_social, cs.company_name, cs.contact_name, 'Cliente não identificado') AS client_name,
                cs.regime_tributario, cs.status_contrato, cs.inbox_id,
                v.resolution_minutes, v.target_resolution_minutes, v.last_resolved_at
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            WHERE cs.account_id = $2 AND cs.contact_id IS NOT NULL
            """,
            days, account_id,
        )

    clients = {}
    for r in rows:
        c = clients.setdefault(r["client_key"], {
            "client_key": r["client_key"], "client_name": r["client_name"],
            "regime_tributario": r["regime_tributario"], "status_contrato": r["status_contrato"],
            "total": 0, "resolved_total": 0, "resolution_sum": 0, "breach_count": 0,
            "channels": {"whatsapp": 0, "email": 0, "other": 0},
        })
        c["total"] += 1
        channel = resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)
        c["channels"][channel] += 1
        if r["resolution_minutes"] is not None:
            c["resolved_total"] += 1
            c["resolution_sum"] += r["resolution_minutes"]
            if r["target_resolution_minutes"] is not None and r["resolution_minutes"] > r["target_resolution_minutes"]:
                c["breach_count"] += 1

    result = []
    for c in clients.values():
        c["avg_resolution"] = c["resolution_sum"] / c["resolved_total"] if c["resolved_total"] else None
        c["breach_rate"] = c["breach_count"] / c["resolved_total"] if c["resolved_total"] else None
        del c["resolution_sum"]
        result.append(c)

    return result


@router.get("/monitor/api/subjects/summary")
async def subjects_summary(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.subject, 'Não categorizado') AS subject,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2
            GROUP BY subject
            ORDER BY total DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/new-vs-returning")
async def clients_new_vs_returning(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH first_contact AS (
                SELECT cs.contact_id, min(e.occurred_at) AS first_seen
                FROM monitor.conversation_snapshot cs
                JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                WHERE e.event_type = 'created' AND cs.account_id = $2 AND e.account_id = $2 AND cs.contact_id IS NOT NULL
                GROUP BY cs.contact_id
            )
            SELECT
                count(*) FILTER (WHERE first_seen >= now() - make_interval(days => $1)) AS new_clients,
                count(*) FILTER (WHERE first_seen < now() - make_interval(days => $1)) AS returning_clients
            FROM first_contact
            """,
            days, account_id,
        )
    return dict(row) if row else {"new_clients": 0, "returning_clients": 0}


@router.get("/monitor/api/clients/{client_key}/detail")
async def client_detail(client_key: str, request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        team_names = await get_team_names(conn, account_id)

        if client_key.startswith("sem-codigo-"):
            contact_id = client_key.replace("sem-codigo-", "", 1)
            client_filter = "cs.contact_id::text = $2 AND cs.cd_cliente IS NULL"
        else:
            client_filter = "cs.cd_cliente = $2"
            contact_id = client_key

        rows = await conn.fetch(
            f"""
            SELECT cs.conversation_id, cs.subject, cs.status, cs.priority, cs.inbox_id,
                cs.razao_social, cs.company_name, cs.contact_name, cs.regime_tributario, cs.status_contrato,
                e.occurred_at AS created_at,
                v.resolution_minutes, v.target_resolution_minutes
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $3
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $3 AND {client_filter} AND e.occurred_at >= now() - make_interval(days => $1)
            ORDER BY e.occurred_at DESC
            """,
            days, contact_id, account_id,
        )

        by_team_rows = await conn.fetch(
                    f"""
                    SELECT cs.team_id, count(*) AS total, avg(v.resolution_minutes) AS avg_resolution, sum(v.resolution_minutes) AS total_minutes
                    FROM monitor.conversation_snapshot cs
                    JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                        AND e.event_type = 'created' AND e.account_id = $3
                    LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
                    WHERE cs.account_id = $3 AND {client_filter} AND e.occurred_at >= now() - make_interval(days => $1)
                    GROUP BY cs.team_id
                    """,
                    days, contact_id, account_id,
                )

    if not rows:
        return {"client_name": "Cliente não identificado", "total": 0, "conversations": [], "by_subject": [], "by_channel": {}}

    client_name = rows[0]["razao_social"] or rows[0]["company_name"] or rows[0]["contact_name"] or "Cliente não identificado"

    by_subject = {}
    by_channel = {"whatsapp": 0, "email": 0, "other": 0}
    conversations = []
    for r in rows:
        subj = r["subject"] or "Não categorizado"
        by_subject[subj] = by_subject.get(subj, 0) + 1
        by_channel[resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)] += 1
        conversations.append({
            "conversation_id": r["conversation_id"], "subject": r["subject"], "status": r["status"],
            "priority": r["priority"], "created_at": r["created_at"],
            "resolution_minutes": r["resolution_minutes"], "target_resolution_minutes": r["target_resolution_minutes"],
        })

    return {
        "client_name": client_name,
        "regime_tributario": rows[0]["regime_tributario"],
        "status_contrato": rows[0]["status_contrato"],
        "total": len(rows),
        "conversations": conversations,
        "by_subject": [{"subject": k, "total": v} for k, v in sorted(by_subject.items(), key=lambda x: -x[1])],
        "by_channel": by_channel,
        "by_team": [
            {
                "team_id": r["team_id"],
                "team_name": team_names.get(r["team_id"], f"Time {r['team_id']}" if r["team_id"] else "Sem time"),
                "total": r["total"],
                "avg_resolution": r["avg_resolution"],
                "total_minutes": r["total_minutes"],
            }
            for r in by_team_rows
        ],
    }


@router.get("/monitor/api/departments/client-time")
async def departments_client_time(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        team_names = await get_team_names(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT cs.team_id,
                COALESCE(cs.cd_cliente, 'sem-codigo-' || cs.contact_id) AS client_key,
                COALESCE(cs.razao_social, cs.company_name, cs.contact_name, 'Cliente não identificado') AS client_name,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution,
                sum(v.resolution_minutes) AS total_minutes
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2 AND cs.team_id IS NOT NULL AND cs.contact_id IS NOT NULL AND v.resolution_minutes IS NOT NULL
            GROUP BY cs.team_id, client_key, client_name
            """,
            days, account_id,
        )

    by_team = {}
    for r in rows:
        t = by_team.setdefault(r["team_id"], {"team_id": r["team_id"], "team_name": team_names.get(r["team_id"], f"Time {r['team_id']}"), "total_minutes": 0, "total_conversations": 0, "clients": 0})
        t["total_minutes"] += r["total_minutes"] or 0
        t["total_conversations"] += r["total"]
        t["clients"] += 1

    return sorted(by_team.values(), key=lambda x: -x["total_minutes"])


@router.get("/monitor/api/clients/demanda-avulsa")
async def clients_demanda_avulsa(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.cd_cliente, 'sem-codigo-' || cs.contact_id) AS client_key,
                COALESCE(cs.razao_social, cs.company_name, cs.contact_name, 'Cliente não identificado') AS client_name,
                count(*) AS total
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            WHERE cs.account_id = $2 AND cs.demanda_avulsa = true AND cs.contact_id IS NOT NULL
            GROUP BY client_key, client_name
            ORDER BY total DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/by-regime")
async def clients_by_regime(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.regime_tributario, 'Não informado') AS regime,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2 AND cs.contact_id IS NOT NULL
            GROUP BY regime
            ORDER BY total DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/by-status-contrato")
async def clients_by_status_contrato(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.status_contrato, 'Não informado') AS status_contrato,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2 AND cs.contact_id IS NOT NULL
            GROUP BY status_contrato
            ORDER BY total DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]
