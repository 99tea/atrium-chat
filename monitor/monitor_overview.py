from fastapi import APIRouter, Request, Depends
from auth import require_admin
from monitor_core import _validate_days, get_inbox_channel_map, resolve_channel

router = APIRouter()


@router.get("/monitor/api/overview")
async def overview(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH sla_stats AS (
                SELECT count(*) AS total_resolved,
                    avg(first_response_minutes) AS avg_first_response,
                    avg(resolution_minutes) AS avg_resolution,
                    sum((resolution_minutes > target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
                FROM monitor.v_sla
                WHERE last_resolved_at >= now() - make_interval(days => $1)
            ),
            created_stats AS (
                SELECT count(DISTINCT conversation_id) AS total_open
                FROM monitor.conversation_events
                WHERE event_type = 'created'
                  AND occurred_at >= now() - make_interval(days => $1)
            )
            SELECT
                COALESCE(s.total_resolved, 0) AS total,
                s.avg_first_response,
                s.avg_resolution,
                s.resolution_breach_rate,
                COALESCE(c.total_open, 0) AS total_open
            FROM sla_stats s CROSS JOIN created_stats c
            """,
            days,
        )
    return dict(row) if row else {}


@router.get("/monitor/api/overview/daily")
async def overview_daily(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', occurred_at AT TIME ZONE 'America/Sao_Paulo') AS day,
                inbox_id,
                count(*) FILTER (WHERE event_type = 'created') AS created,
                count(*) FILTER (WHERE event_type = 'status_changed' AND to_value = 'resolved') AS resolved
            FROM monitor.conversation_events
            WHERE occurred_at >= now() - make_interval(days => $1)
            GROUP BY day, inbox_id ORDER BY day
            """,
            days,
        )

    daily = {}
    for r in rows:
        bucket = daily.setdefault(r["day"], {
            "day": r["day"], "created_whatsapp": 0, "created_email": 0, "created_other": 0, "resolved": 0
        })
        channel = resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)
        bucket[f"created_{channel}"] += r["created"]
        bucket["resolved"] += r["resolved"]

    return sorted(daily.values(), key=lambda x: x["day"])


@router.get("/monitor/api/overview/hourly")
async def overview_hourly(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT EXTRACT(hour FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
                count(*) AS total
            FROM monitor.conversation_events
            WHERE event_type = 'created' AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY hour ORDER BY hour
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/weekday")
async def overview_weekday(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT EXTRACT(dow FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS weekday,
                count(*) AS total
            FROM monitor.conversation_events
            WHERE event_type = 'created' AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY weekday ORDER BY weekday
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/resolution-by-priority")
async def overview_resolution_by_priority(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.priority, 'none') AS priority,
                avg(v.resolution_minutes) AS avg_resolution,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = v.conversation_id
            WHERE v.last_resolved_at >= now() - make_interval(days => $1)
            GROUP BY priority
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/reopen-rate")
async def overview_reopen_rate(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS reopened
            FROM monitor.conversation_events
            WHERE event_type = 'status_changed'
              AND from_value = 'resolved'
              AND to_value IN ('open', 'pending')
              AND occurred_at >= now() - make_interval(days => $1)
            """,
            days,
        )
    return dict(row) if row else {"reopened": 0}


@router.get("/monitor/api/overview/status-breakdown")
async def overview_status_breakdown(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        priority_rows = await conn.fetch(
            """
            SELECT COALESCE(priority, 'none') AS priority, count(*) AS total
            FROM monitor.conversation_snapshot
            WHERE status IN ('open', 'pending')
            GROUP BY priority
            """
        )
        label_rows = await conn.fetch(
            """
            SELECT label, count(*) AS total
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE cs.status IN ('open', 'pending') AND label IS NOT NULL
            GROUP BY label ORDER BY total DESC
            """
        )
    return {"priority": [dict(r) for r in priority_rows], "labels": [dict(r) for r in label_rows]}
