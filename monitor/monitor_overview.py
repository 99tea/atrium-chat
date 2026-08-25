from fastapi import APIRouter, Request, Depends
from auth import require_admin, get_account_id
from monitor_core import _validate_days_extended, get_channels, resolve_channel

router = APIRouter()


@router.get("/monitor/api/overview")
async def overview(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                count(DISTINCT e.conversation_id) FILTER (WHERE e.event_type = 'created') AS total_open,
                count(*) FILTER (WHERE e.event_type = 'status_changed' AND e.to_value = 'resolved') AS total_resolved,
                count(*) FILTER (
                    WHERE e.event_type = 'status_changed' AND e.to_value = 'resolved' AND cs.excluded_from_metrics
                ) AS total_cancelled
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = e.conversation_id
            WHERE e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            """,
            days, account_id,
        )
    return dict(row) if row else {}


@router.get("/monitor/api/overview/daily")
async def overview_daily(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT date_trunc('day', occurred_at AT TIME ZONE 'America/Sao_Paulo') AS day,
                inbox_id,
                count(*) FILTER (WHERE event_type = 'created') AS created,
                count(*) FILTER (WHERE event_type = 'status_changed' AND to_value = 'resolved') AS resolved
            FROM monitor.conversation_events
            WHERE account_id = $2 AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY day, inbox_id ORDER BY day
            """,
            days, account_id,
        )

    channel_keys = [c["channel_key"] for c in channels] + ["other"]
    daily = {}
    for r in rows:
        bucket = daily.setdefault(r["day"], {
            "day": r["day"], **{f"created_{k}": 0 for k in channel_keys}, "resolved": 0
        })
        channel = resolve_channel(r["inbox_id"], channels)
        bucket[f"created_{channel}"] += r["created"]
        bucket["resolved"] += r["resolved"]

    return sorted(daily.values(), key=lambda x: x["day"])


@router.get("/monitor/api/overview/hourly")
async def overview_hourly(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT EXTRACT(hour FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
                count(*) AS total
            FROM monitor.conversation_events
            WHERE event_type = 'created' AND account_id = $2 AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY hour ORDER BY hour
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/weekday")
async def overview_weekday(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT EXTRACT(dow FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::int AS weekday,
                count(*) AS total
            FROM monitor.conversation_events
            WHERE event_type = 'created' AND account_id = $2 AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY weekday ORDER BY weekday
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/priority-distribution")
async def overview_priority_distribution(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.priority, 'none') AS priority, count(*) AS total
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = e.conversation_id
            WHERE e.event_type = 'created' AND e.account_id = $2 AND e.occurred_at >= now() - make_interval(days => $1)
            GROUP BY priority
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/channel-distribution")
async def overview_channel_distribution(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT inbox_id, count(*) AS total
            FROM monitor.conversation_events
            WHERE event_type = 'created' AND account_id = $2 AND occurred_at >= now() - make_interval(days => $1)
            GROUP BY inbox_id
            """,
            days, account_id,
        )

    by_channel = {c["channel_key"]: 0 for c in channels}
    by_channel["other"] = 0
    for r in rows:
        channel = resolve_channel(r["inbox_id"], channels)
        by_channel[channel] += r["total"]
    return by_channel


@router.get("/monitor/api/overview/company-distribution")
async def overview_company_distribution(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT cs.company_name, count(*) AS total
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot cs ON cs.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.account_id = $2
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND cs.company_name IS NOT NULL AND cs.company_name <> ''
            GROUP BY cs.company_name
            ORDER BY total DESC
            LIMIT 10
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/overview/reopen-rate")
async def overview_reopen_rate(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS reopened
            FROM monitor.conversation_events
            WHERE event_type = 'status_changed'
              AND from_value = 'resolved'
              AND to_value IN ('open', 'pending')
              AND account_id = $2
              AND occurred_at >= now() - make_interval(days => $1)
            """,
            days, account_id,
        )
    return dict(row) if row else {"reopened": 0}


@router.get("/monitor/api/overview/status-breakdown")
async def overview_status_breakdown(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        priority_rows = await conn.fetch(
            """
            SELECT COALESCE(priority, 'none') AS priority, count(*) AS total
            FROM monitor.conversation_snapshot
            WHERE account_id = $1 AND status IN ('open', 'pending')
            GROUP BY priority
            """,
            account_id,
        )
        label_rows = await conn.fetch(
            """
            SELECT label, count(*) AS total
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE cs.account_id = $1 AND cs.status IN ('open', 'pending') AND label IS NOT NULL
            GROUP BY label ORDER BY total DESC
            """,
            account_id,
        )
    return {"priority": [dict(r) for r in priority_rows], "labels": [dict(r) for r in label_rows]}
