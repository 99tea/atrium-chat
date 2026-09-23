from fastapi import APIRouter, Request, Depends
from typing import Optional
from auth import require_admin, get_account_id
from monitor_core import resolve_date_range, get_channels, resolve_channel, get_team_names

router = APIRouter()

# Centraliza a normalização da chave de empresa.
# NULLIF(cs.company_override, '') garante que string vazia caia no fallback company_name,
# em vez de travar o COALESCE (bug corrigido em 2026-08-25).
NORMALIZE_SQL = "lower(trim(COALESCE(NULLIF(cs.company_override, ''), cs.company_name)))"
NAME_VARIANT_SQL = "COALESCE(NULLIF(cs.company_override, ''), cs.company_name, cs.contact_name, 'Cliente não identificado')"


def _client_key_case():
    return f"""COALESCE(
        NULLIF({NORMALIZE_SQL}, ''),
        'sem-empresa-' || cs.contact_id::text
    )"""


def _pick_name_by_frequency(rows, name_field="client_name_variant", date_field="created_at"):
    """Recebe rows com variantes de nome + data, retorna o nome mais frequente
    (empate resolvido pela variante vista mais recentemente)."""
    counts = {}
    for r in rows:
        name = r[name_field]
        entry = counts.setdefault(name, {"count": 0, "last_seen": r[date_field]})
        entry["count"] += 1
        if r[date_field] and (entry["last_seen"] is None or r[date_field] > entry["last_seen"]):
            entry["last_seen"] = r[date_field]
    if not counts:
        return None
    return max(counts.items(), key=lambda kv: (kv[1]["count"], kv[1]["last_seen"]))[0]


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
async def clients_summary(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            f"""
            SELECT {_client_key_case()} AS client_key,
                {NAME_VARIANT_SQL} AS client_name_variant,
                cs.contact_id, cs.contact_name,
                cs.regime_tributario, cs.status_contrato, cs.inbox_id,
                e.occurred_at AS created_at,
                v.resolution_minutes, v.target_resolution_minutes, v.last_resolved_at
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            WHERE cs.account_id = $1 AND cs.contact_id IS NOT NULL
            """,
            account_id, start, end,
        )

    channel_keys = [c["channel_key"] for c in channels] + ["other"]
    clients = {}
    for r in rows:
        c = clients.setdefault(r["client_key"], {
            "client_key": r["client_key"],
            "name_rows": [],
            "regime_tributario_set": set(), "status_contrato_set": set(),
            "total": 0, "resolved_total": 0, "resolution_sum": 0, "breach_count": 0,
            "channels": {k: 0 for k in channel_keys},
        })
        c["total"] += 1
        c["name_rows"].append({"client_name_variant": r["client_name_variant"], "created_at": r["created_at"]})
        if r["regime_tributario"]:
            c["regime_tributario_set"].add((r["contact_id"], r["contact_name"], r["regime_tributario"]))
        if r["status_contrato"]:
            c["status_contrato_set"].add((r["contact_id"], r["contact_name"], r["status_contrato"]))
        channel = resolve_channel(r["inbox_id"], channels)
        c["channels"][channel] += 1
        if r["resolution_minutes"] is not None:
            c["resolved_total"] += 1
            c["resolution_sum"] += r["resolution_minutes"]
            if r["target_resolution_minutes"] is not None and r["resolution_minutes"] > r["target_resolution_minutes"]:
                c["breach_count"] += 1

    result = []
    for c in clients.values():
        c["client_name"] = _pick_name_by_frequency(c["name_rows"])
        c["avg_resolution"] = c["resolution_sum"] / c["resolved_total"] if c["resolved_total"] else None
        c["breach_rate"] = c["breach_count"] / c["resolved_total"] if c["resolved_total"] else None

        regime_values = {v for _, _, v in c["regime_tributario_set"]}
        status_values = {v for _, _, v in c["status_contrato_set"]}
        regime_inconsistent = len(regime_values) > 1
        status_inconsistent = len(status_values) > 1
        c["cadastro_inconsistente"] = regime_inconsistent or status_inconsistent
        c["inconsistencias"] = {}
        if regime_inconsistent:
            c["inconsistencias"]["regime_tributario"] = [
                {"contact_id": cid, "contact_name": cname, "valor": val}
                for cid, cname, val in sorted(c["regime_tributario_set"], key=lambda x: x[1] or "")
            ]
        if status_inconsistent:
            c["inconsistencias"]["status_contrato"] = [
                {"contact_id": cid, "contact_name": cname, "valor": val}
                for cid, cname, val in sorted(c["status_contrato_set"], key=lambda x: x[1] or "")
            ]

        # regime_tributario/status_contrato "principais" exibidos no card = mais frequentes
        c["regime_tributario"] = max(regime_values, key=lambda v: sum(1 for _, _, vv in c["regime_tributario_set"] if vv == v)) if regime_values else None
        c["status_contrato"] = max(status_values, key=lambda v: sum(1 for _, _, vv in c["status_contrato_set"] if vv == v)) if status_values else None

        del c["resolution_sum"], c["regime_tributario_set"], c["status_contrato_set"], c["name_rows"]
        result.append(c)

    return result


@router.get("/monitor/api/subjects/summary")
async def subjects_summary(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.subject, 'Não categorizado') AS subject,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $1
            GROUP BY subject
            ORDER BY total DESC
            """,
            account_id, start, end,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/new-vs-returning")
async def clients_new_vs_returning(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            WITH first_company AS (
                SELECT {_client_key_case()} AS client_key,
                    min(e.occurred_at) AS first_seen
                FROM monitor.conversation_snapshot cs
                JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                WHERE e.event_type = 'created' AND cs.account_id = $1 AND e.account_id = $1 AND cs.contact_id IS NOT NULL
                GROUP BY client_key
            )
            SELECT
                count(*) FILTER (WHERE first_seen >= $2) AS new_clients,
                count(*) FILTER (WHERE first_seen < $2) AS returning_clients
            FROM first_company
            """,
            account_id, start,
        )
    return dict(row) if row else {"new_clients": 0, "returning_clients": 0}


@router.get("/monitor/api/clients/{client_key}/detail")
async def client_detail(client_key: str, request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        team_names = await get_team_names(conn, account_id)

        if client_key.startswith("sem-empresa-"):
            contact_id = client_key.replace("sem-empresa-", "", 1)
            client_filter = "cs.contact_id::text = $1 AND COALESCE(NULLIF(cs.company_override, ''), cs.company_name) IS NULL"
        else:
            client_filter = f"{NORMALIZE_SQL} = $1"
            contact_id = client_key

        rows = await conn.fetch(
            f"""
            SELECT cs.conversation_id, cs.subject, cs.status, cs.priority, cs.inbox_id,
                cs.contact_id, cs.company_override, cs.company_name, cs.contact_name,
                cs.regime_tributario, cs.status_contrato,
                e.occurred_at AS created_at,
                v.resolution_minutes, v.target_resolution_minutes
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2 AND {client_filter} AND e.occurred_at >= $3 AND e.occurred_at <= $4
            ORDER BY e.occurred_at DESC
            """,
            contact_id, account_id, start, end,
        )

        by_team_rows = await conn.fetch(
            f"""
            SELECT cs.team_id, count(*) AS total, avg(v.resolution_minutes) AS avg_resolution, sum(v.resolution_minutes) AS total_minutes
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $2
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $2 AND {client_filter} AND e.occurred_at >= $3 AND e.occurred_at <= $4
            GROUP BY cs.team_id
            """,
            contact_id, account_id, start, end,
        )

    if not rows:
        return {"client_name": "Cliente não identificado", "total": 0, "conversations": [], "by_subject": [], "by_channel": {}, "cadastro_inconsistente": False, "inconsistencias": {}}

    name_rows = [
        {"client_name_variant": (r["company_override"] or None) or r["company_name"] or r["contact_name"] or "Cliente não identificado", "created_at": r["created_at"]}
        for r in rows
    ]
    client_name = _pick_name_by_frequency(name_rows)

    regime_tuples = {(r["contact_id"], r["contact_name"], r["regime_tributario"]) for r in rows if r["regime_tributario"]}
    status_tuples = {(r["contact_id"], r["contact_name"], r["status_contrato"]) for r in rows if r["status_contrato"]}
    regime_values = {v for _, _, v in regime_tuples}
    status_values = {v for _, _, v in status_tuples}
    regime_inconsistent = len(regime_values) > 1
    status_inconsistent = len(status_values) > 1
    cadastro_inconsistente = regime_inconsistent or status_inconsistent

    inconsistencias = {}
    if regime_inconsistent:
        inconsistencias["regime_tributario"] = [
            {"contact_id": cid, "contact_name": cname, "valor": val}
            for cid, cname, val in sorted(regime_tuples, key=lambda x: x[1] or "")
        ]
    if status_inconsistent:
        inconsistencias["status_contrato"] = [
            {"contact_id": cid, "contact_name": cname, "valor": val}
            for cid, cname, val in sorted(status_tuples, key=lambda x: x[1] or "")
        ]

    channel_keys = [c["channel_key"] for c in channels] + ["other"]
    by_subject = {}
    by_channel = {k: 0 for k in channel_keys}
    conversations = []
    for r in rows:
        subj = r["subject"] or "Não categorizado"
        by_subject[subj] = by_subject.get(subj, 0) + 1
        by_channel[resolve_channel(r["inbox_id"], channels)] += 1
        conversations.append({
            "conversation_id": r["conversation_id"], "subject": r["subject"], "status": r["status"],
            "priority": r["priority"], "created_at": r["created_at"],
            "resolution_minutes": r["resolution_minutes"], "target_resolution_minutes": r["target_resolution_minutes"],
        })

    return {
        "client_name": client_name,
        "regime_tributario": rows[0]["regime_tributario"],
        "status_contrato": rows[0]["status_contrato"],
        "cadastro_inconsistente": cadastro_inconsistente,
        "inconsistencias": inconsistencias,
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
async def departments_client_time(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        team_names = await get_team_names(conn, account_id)
        rows = await conn.fetch(
            f"""
            SELECT cs.team_id,
                {_client_key_case()} AS client_key,
                {NAME_VARIANT_SQL} AS client_name_variant,
                e.occurred_at AS created_at,
                v.resolution_minutes
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $1 AND cs.team_id IS NOT NULL AND cs.contact_id IS NOT NULL AND v.resolution_minutes IS NOT NULL
            """,
            account_id, start, end,
        )

    grouped = {}
    for r in rows:
        key = (r["team_id"], r["client_key"])
        g = grouped.setdefault(key, {"team_id": r["team_id"], "client_key": r["client_key"], "name_rows": [], "total": 0, "total_minutes": 0})
        g["name_rows"].append({"client_name_variant": r["client_name_variant"], "created_at": r["created_at"]})
        g["total"] += 1
        g["total_minutes"] += r["resolution_minutes"] or 0

    by_team = {}
    for g in grouped.values():
        t = by_team.setdefault(g["team_id"], {"team_id": g["team_id"], "team_name": team_names.get(g["team_id"], f"Time {g['team_id']}"), "total_minutes": 0, "total_conversations": 0, "clients": 0})
        t["total_minutes"] += g["total_minutes"]
        t["total_conversations"] += g["total"]
        t["clients"] += 1

    return sorted(by_team.values(), key=lambda x: -x["total_minutes"])


@router.get("/monitor/api/clients/demanda-avulsa")
async def clients_demanda_avulsa(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {_client_key_case()} AS client_key,
                {NAME_VARIANT_SQL} AS client_name_variant,
                e.occurred_at AS created_at
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            WHERE cs.account_id = $1 AND cs.demanda_avulsa = true AND cs.contact_id IS NOT NULL
            """,
            account_id, start, end,
        )

    grouped = {}
    for r in rows:
        g = grouped.setdefault(r["client_key"], {"client_key": r["client_key"], "name_rows": [], "total": 0})
        g["name_rows"].append({"client_name_variant": r["client_name_variant"], "created_at": r["created_at"]})
        g["total"] += 1

    result = [
        {"client_key": g["client_key"], "client_name": _pick_name_by_frequency(g["name_rows"]), "total": g["total"]}
        for g in grouped.values()
    ]
    return sorted(result, key=lambda x: -x["total"])


@router.get("/monitor/api/clients/by-regime")
async def clients_by_regime(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.regime_tributario, 'Não informado') AS regime,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $1 AND cs.contact_id IS NOT NULL
            GROUP BY regime
            ORDER BY total DESC
            """,
            account_id, start, end,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/by-status-contrato")
async def clients_by_status_contrato(request: Request, days: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    start, end = resolve_date_range(days, start_date, end_date)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.status_contrato, 'Não informado') AS status_contrato,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution
            FROM monitor.conversation_snapshot cs
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.account_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.account_id = $1 AND cs.contact_id IS NOT NULL
            GROUP BY status_contrato
            ORDER BY total DESC
            """,
            account_id, start, end,
        )
    return [dict(r) for r in rows]
