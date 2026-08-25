from fastapi import APIRouter, Request, Depends
from datetime import datetime, timezone
from auth import get_current_user, get_account_id
from monitor_core import _validate_days_extended, get_channels, resolve_channel

router = APIRouter()


@router.get("/monitor/api/status")
async def my_status(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        channels = await get_channels(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.status, cs.priority, cs.subject,
                cs.contact_name, cs.company_name, cs.updated_at,
                l.created_at,
                CASE
                    WHEN pt.resolution_minutes IS NULL THEN NULL
                    ELSE l.created_at + (pt.resolution_minutes || ' minutes')::interval
                END AS sla_deadline
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_conversation_lifecycle l ON l.conversation_id = cs.conversation_id
            LEFT JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(cs.priority, 'none') AND pt.account_id = cs.account_id
            WHERE cs.account_id = $2 AND cs.assignee_id = $1 AND cs.status IN ('open', 'pending')
            ORDER BY sla_deadline ASC NULLS LAST
            """,
            user["id"], account_id,
        )
    items = []
    for r in rows:
        d = dict(r)
        d["channel"] = resolve_channel(d["inbox_id"], channels)
        d["minutes_remaining"] = (
            None if d["sla_deadline"] is None
            else (d["sla_deadline"] - datetime.now(timezone.utc)).total_seconds() / 60
        )
        items.append(d)
    return items


@router.get("/monitor/api/me/awaiting")
async def me_awaiting(request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.priority, cs.status,
                EXTRACT(EPOCH FROM (now() - lm.occurred_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT to_value, occurred_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id
                  AND event_type = 'message' AND is_private = false AND account_id = $2
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.account_id = $2 AND cs.assignee_id = $1 AND cs.status IN ('open', 'pending') AND lm.to_value = 'incoming'
            ORDER BY lm.occurred_at ASC
            """,
            user["id"], account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/me/reopened")
async def me_reopened(request: Request, days: int = 30, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS reopened
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'status_changed'
              AND e.from_value = 'resolved'
              AND e.to_value IN ('open', 'pending')
              AND e.account_id = $3
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.assignee_id = $2
            """,
            days, user["id"], account_id,
        )
    return dict(row) if row else {"reopened": 0}
