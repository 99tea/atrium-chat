from fastapi import APIRouter, Request, Depends
from auth import require_admin, get_account_id
from monitor_core import _validate_days_extended, get_channels, resolve_channel, get_team_names

router = APIRouter()


@router.get("/monitor/api/sla/summary")
async def sla_summary(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS total,
                avg(first_response_minutes) AS avg_first_response,
                avg(resolution_minutes) AS avg_resolution,
                sum((resolution_minutes > target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla
            WHERE account_id = $2 AND last_resolved_at >= now() - make_interval(days => $1)
            """,
            days, account_id,
        )
    return dict(row) if row else {}


@router.get("/monitor/api/sla/by-priority")
async def sla_by_priority(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.priority, 'none') AS priority,
                count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1)
            GROUP BY cs.priority
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/sla/by-channel")
async def sla_by_channel(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT v.inbox_id,
                count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1)
            GROUP BY v.inbox_id
            """,
            days, account_id,
        )

    by_channel = {}
    for r in rows:
        channel = resolve_channel(r["inbox_id"], channels)
        c = by_channel.setdefault(channel, {"channel": channel, "total": 0, "fr_sum": 0, "res_sum": 0, "breach_sum": 0})
        c["total"] += r["total"]
        c["fr_sum"] += (r["avg_first_response"] or 0) * r["total"]
        c["res_sum"] += (r["avg_resolution"] or 0) * r["total"]
        c["breach_sum"] += (r["resolution_breach_rate"] or 0) * r["total"]

    return [
        {
            "channel": c["channel"],
            "total": c["total"],
            "avg_first_response": c["fr_sum"] / c["total"] if c["total"] else None,
            "avg_resolution": c["res_sum"] / c["total"] if c["total"] else None,
            "resolution_breach_rate": c["breach_sum"] / c["total"] if c["total"] else None,
        }
        for c in by_channel.values()
    ]


@router.get("/monitor/api/sla/by-subject")
async def sla_by_subject(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.subject, 'Não categorizado') AS subject,
                count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1)
            GROUP BY subject
            ORDER BY total DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/sla/by-team")
async def sla_by_team(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        team_names = await get_team_names(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT v.team_id,
                count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1)
            GROUP BY v.team_id
            """,
            days, account_id,
        )
    return [
        {
            "team_id": r["team_id"],
            "team_name": team_names.get(r["team_id"], f"Time {r['team_id']}" if r["team_id"] else "Sem time"),
            "total": r["total"],
            "avg_first_response": r["avg_first_response"],
            "avg_resolution": r["avg_resolution"],
            "resolution_breach_rate": r["resolution_breach_rate"],
        }
        for r in rows
    ]


@router.get("/monitor/api/sla/by-client")
async def sla_by_client(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.cd_cliente, 'sem-codigo-' || cs.contact_id) AS client_key,
                COALESCE(cs.razao_social, cs.company_name, cs.contact_name, 'Cliente não identificado') AS client_name,
                count(*) AS total,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1) AND cs.contact_id IS NOT NULL
            GROUP BY client_key, client_name
            HAVING count(*) >= 3
            """,
            days, account_id,
        )

    clients = [dict(r) for r in rows]
    best = sorted(clients, key=lambda c: (c["resolution_breach_rate"] is None, c["resolution_breach_rate"]))[:10]
    worst = sorted(clients, key=lambda c: (c["resolution_breach_rate"] is None, -(c["resolution_breach_rate"] or 0)))[:10]
    return {"best": best, "worst": worst}
