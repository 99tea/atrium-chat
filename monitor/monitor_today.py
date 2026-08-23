from fastapi import APIRouter, Request, Depends, HTTPException
from auth import require_admin, get_account_id
from monitor_core import get_inbox_channel_map, resolve_channel

router = APIRouter()


@router.get("/monitor/api/today/hourly")
async def today_hourly(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT date_trunc('hour', occurred_at AT TIME ZONE 'America/Sao_Paulo') AS hour,
                inbox_id,
                count(*) FILTER (WHERE event_type = 'created') AS created,
                count(*) FILTER (WHERE event_type = 'status_changed' AND to_value = 'resolved') AS resolved
            FROM monitor.conversation_events
            WHERE account_id = $1
              AND occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            GROUP BY hour, inbox_id ORDER BY hour
            """,
            account_id,
        )

    hourly = {}
    for r in rows:
        bucket = hourly.setdefault(r["hour"], {
            "hour": r["hour"], "created_whatsapp": 0, "created_email": 0, "created_other": 0, "resolved": 0
        })
        channel = resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)
        bucket[f"created_{channel}"] += r["created"]
        bucket["resolved"] += r["resolved"]

    return sorted(hourly.values(), key=lambda x: x["hour"])


@router.get("/monitor/api/today/conversations/priority/{priority}")
async def today_conv_priority(priority: str, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created' AND account_id = $2
            ) ce ON true
            WHERE cs.account_id = $2 AND cs.status IN ('open', 'pending') AND COALESCE(cs.priority, 'none') = $1
            ORDER BY ce.created_at ASC
            """,
            priority, account_id,
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]


@router.get("/monitor/api/today/conversations/label/{label}")
async def today_conv_label(label: str, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created' AND account_id = $2
            ) ce ON true
            WHERE cs.account_id = $2 AND cs.status IN ('open', 'pending') AND $1 = ANY(cs.labels)
            ORDER BY ce.created_at ASC
            """,
            label, account_id,
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]


@router.get("/monitor/api/today/kpi/{kpi}")
async def today_kpi(kpi: str, request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    queries = {
        "created-today": """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.status, s.priority, e.occurred_at AS created_at,
                   EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 60 AS age_minutes
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.account_id = $1
              AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            ORDER BY e.occurred_at DESC
        """,
        "open": """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.priority, s.assignee_name, s.updated_at,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot s
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = s.conversation_id AND event_type = 'created' AND account_id = $1
            ) ce ON true
            WHERE s.account_id = $1 AND s.status = 'open'
            ORDER BY s.updated_at DESC
        """,
        "unassigned": """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.priority, s.status, s.updated_at,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot s
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = s.conversation_id AND event_type = 'created' AND account_id = $1
            ) ce ON true
            WHERE s.account_id = $1 AND s.assignee_id IS NULL AND s.status IN ('open', 'pending')
            ORDER BY s.updated_at DESC
        """,
        "open-total": """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created' AND account_id = $1
            ) ce ON true
            WHERE cs.account_id = $1 AND cs.status IN ('open', 'pending')
            ORDER BY ce.created_at ASC
        """,
        "awaiting-agent": """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                EXTRACT(EPOCH FROM (now() - lm.occurred_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT to_value, occurred_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id
                  AND event_type = 'message' AND is_private = false AND account_id = $1
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.account_id = $1 AND cs.status IN ('open', 'pending') AND lm.to_value = 'incoming'
            ORDER BY lm.occurred_at ASC
        """
    }
    if kpi not in queries:
        raise HTTPException(404, "kpi desconhecido")
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(queries[kpi], account_id)
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]


@router.get("/monitor/api/today/first-response")
async def today_first_response(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH created_evt AS (
                SELECT conversation_id, min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE event_type = 'created' AND account_id = $1
                GROUP BY conversation_id
            ),
            first_response_evt AS (
                SELECT conversation_id, min(occurred_at) AS responded_at
                FROM monitor.conversation_events
                WHERE event_type = 'message' AND to_value = 'outgoing' AND is_private = false AND account_id = $1
                GROUP BY conversation_id
            )
            SELECT avg(EXTRACT(EPOCH FROM (fr.responded_at - ce.created_at)) / 60) AS avg_first_response,
                count(*) AS total
            FROM first_response_evt fr
            JOIN created_evt ce ON ce.conversation_id = fr.conversation_id
            JOIN monitor.conversation_snapshot s ON s.conversation_id = fr.conversation_id
            WHERE fr.responded_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND s.account_id = $1
              AND NOT s.excluded_from_metrics
            """,
            account_id,
        )
    return dict(row) if row else {"avg_first_response": None, "total": 0}


@router.get("/monitor/api/today/comparison")
async def today_comparison(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH target AS (
                SELECT now() - interval '7 days' AS t
            ),
            status_at_t AS (
                SELECT DISTINCT ON (e.conversation_id) e.conversation_id, e.to_value AS status_at_t
                FROM monitor.conversation_events e, target
                WHERE e.event_type IN ('created', 'status_changed') AND e.occurred_at <= target.t AND e.account_id = $1
                ORDER BY e.conversation_id, e.occurred_at DESC
            ),
            assignee_last_before AS (
                SELECT DISTINCT ON (e.conversation_id) e.conversation_id, e.to_value AS assignee_at_t
                FROM monitor.conversation_events e, target
                WHERE e.event_type = 'assignee_changed' AND e.occurred_at <= target.t AND e.account_id = $1
                ORDER BY e.conversation_id, e.occurred_at DESC
            ),
            assignee_first_ever AS (
                SELECT DISTINCT ON (conversation_id) conversation_id, from_value AS assignee_before_history
                FROM monitor.conversation_events
                WHERE event_type = 'assignee_changed' AND account_id = $1
                ORDER BY conversation_id, occurred_at ASC
            )
            SELECT
                count(*) FILTER (WHERE st.status_at_t = 'open') AS open_last_week,
                count(*) FILTER (
                    WHERE st.status_at_t IN ('open', 'pending')
                    AND (
                        COALESCE(al.assignee_at_t, af.assignee_before_history, s.assignee_id::text) IS NULL
                        OR COALESCE(al.assignee_at_t, af.assignee_before_history, s.assignee_id::text) = 'None'
                    )
                ) AS unassigned_last_week
            FROM monitor.conversation_snapshot s
            JOIN status_at_t st ON st.conversation_id = s.conversation_id
            LEFT JOIN assignee_last_before al ON al.conversation_id = s.conversation_id
            LEFT JOIN assignee_first_ever af ON af.conversation_id = s.conversation_id
            WHERE s.account_id = $1
            """,
            account_id,
        )
    return dict(row) if row else {"open_last_week": 0, "unassigned_last_week": 0}


@router.get("/monitor/api/today/attention")
async def today_attention(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn, account_id)
        rows = await conn.fetch(
            """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.subject, s.priority, s.assignee_name,
                l.created_at,
                (l.created_at + (pt.resolution_minutes || ' minutes')::interval) AS sla_deadline,
                EXTRACT(epoch FROM ((l.created_at + (pt.resolution_minutes || ' minutes')::interval) - now())) / 60 AS minutes_remaining
            FROM monitor.conversation_snapshot s
            JOIN monitor.v_conversation_lifecycle l ON l.conversation_id = s.conversation_id
            JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(s.priority, 'none') AND pt.account_id = $1
            WHERE s.account_id = $1 AND s.status <> 'resolved' AND l.last_resolved_at IS NULL
            ORDER BY minutes_remaining ASC
            LIMIT 50
            """,
            account_id,
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]


@router.get("/monitor/api/today/assignees")
async def today_assignees(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_name, count(*) AS total
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.account_id = $1
              AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND s.assignee_name IS NOT NULL
            GROUP BY s.assignee_name
            ORDER BY total DESC
            """,
            account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/today/top-solvers")
async def today_top_solvers(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_name, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.resolved_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND v.account_id = $1
              AND s.assignee_name IS NOT NULL
            GROUP BY s.assignee_name
            ORDER BY resolved_count DESC
            LIMIT 10
            """,
            account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/today/kpis")
async def today_kpis(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS total,
                avg(first_response_minutes) AS avg_first_response,
                avg(resolution_minutes) AS avg_resolution,
                sum((resolution_minutes > target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla
            WHERE account_id = $1
              AND last_resolved_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            """,
            account_id,
        )
    return dict(row) if row else {}
