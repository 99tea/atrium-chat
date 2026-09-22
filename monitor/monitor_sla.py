from fastapi import APIRouter, Request, Depends
from auth import require_admin, get_account_id
from monitor_core import _validate_days_extended, get_channels, resolve_channel, get_team_names
from monitor_clients import _client_key_case, NAME_VARIANT_SQL, _pick_name_by_frequency

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
            f"""
            SELECT {_client_key_case()} AS client_key,
                {NAME_VARIANT_SQL} AS client_name_variant,
                v.last_resolved_at AS created_at,
                v.resolution_minutes, v.target_resolution_minutes
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1) AND cs.contact_id IS NOT NULL
            """,
            days, account_id,
        )

    grouped = {}
    for r in rows:
        g = grouped.setdefault(r["client_key"], {"client_key": r["client_key"], "name_rows": [], "total": 0, "breach": 0, "res_sum": 0})
        g["name_rows"].append({"client_name_variant": r["client_name_variant"], "created_at": r["created_at"]})
        g["total"] += 1
        if r["resolution_minutes"] is not None:
            g["res_sum"] += r["resolution_minutes"]
            if r["target_resolution_minutes"] is not None and r["resolution_minutes"] > r["target_resolution_minutes"]:
                g["breach"] += 1

    clients = []
    for g in grouped.values():
        if g["total"] < 3:
            continue
        clients.append({
            "client_key": g["client_key"],
            "client_name": _pick_name_by_frequency(g["name_rows"]),
            "total": g["total"],
            "avg_resolution": g["res_sum"] / g["total"] if g["total"] else None,
            "resolution_breach_rate": g["breach"] / g["total"] if g["total"] else None,
        })

    best = sorted(clients, key=lambda c: (c["resolution_breach_rate"] is None, c["resolution_breach_rate"]))[:10]
    worst = sorted(clients, key=lambda c: (c["resolution_breach_rate"] is None, -(c["resolution_breach_rate"] or 0)))[:10]
    return {"best": best, "worst": worst}
