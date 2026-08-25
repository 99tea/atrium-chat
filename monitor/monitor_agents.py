from fastapi import APIRouter, Request, Depends, HTTPException
from datetime import datetime, timezone
from auth import get_current_user, require_admin, get_account_id
from monitor_core import _validate_days, _validate_days_extended, get_channels, resolve_channel
import httpx
import os

router = APIRouter()

CHATWOOT_URL = os.environ["CHATWOOT_URL"]


@router.get("/monitor/api/agents")
async def agents(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        resolved = await conn.fetch(
            """
            SELECT assignee_id, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent
            WHERE account_id = $1 AND resolved_at >= now() - interval '30 days'
            GROUP BY assignee_id
            """,
            account_id,
        )
        current = await conn.fetch(
            """
            SELECT assignee_id, status, count(*) AS total
            FROM monitor.conversation_snapshot
            WHERE account_id = $1 AND status IN ('open', 'pending')
            GROUP BY assignee_id, status
            """,
            account_id,
        )
    return {"resolved_last_30d": [dict(r) for r in resolved], "current_load": [dict(r) for r in current]}


@router.get("/monitor/api/agents/status")
async def agents_status(request: Request, user=Depends(get_current_user)):
    account_id = user["account_id"]
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{CHATWOOT_URL}/api/v1/accounts/{account_id}/agents",
            headers={"api_access_token": user["access_token"]},
        )
    if r.status_code != 200:
        raise HTTPException(502, "falha ao consultar status dos agentes no Chatwoot")
    data = r.json()
    return [{"agent_id": a["id"], "name": a["name"], "availability_status": a.get("availability_status")} for a in data]


@router.get("/monitor/api/agents/summary")
async def agents_summary(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        open_rows = await conn.fetch(
            """
            SELECT assignee_id, assignee_name, count(*) AS open_count
            FROM monitor.conversation_snapshot
            WHERE account_id = $1 AND status IN ('open', 'pending') AND assignee_id IS NOT NULL
            GROUP BY assignee_id, assignee_name
            """,
            account_id,
        )
        resolved_rows = await conn.fetch(
            """
            SELECT s.assignee_id, s.assignee_name, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $2
              AND v.resolved_at >= now() - make_interval(days => $1)
              AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            """,
            days, account_id,
        )

    summary = {}
    for r in open_rows:
        summary.setdefault(r["assignee_id"], {"assignee_id": r["assignee_id"], "assignee_name": r["assignee_name"], "open_count": 0, "resolved_count": 0})
        summary[r["assignee_id"]]["open_count"] = r["open_count"]
    for r in resolved_rows:
        summary.setdefault(r["assignee_id"], {"assignee_id": r["assignee_id"], "assignee_name": r["assignee_name"], "open_count": 0, "resolved_count": 0})
        summary[r["assignee_id"]]["resolved_count"] = r["resolved_count"]

    return sorted(summary.values(), key=lambda x: x["assignee_name"] or "")


@router.get("/monitor/api/teams/distribution")
async def teams_distribution(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        created_rows = await conn.fetch(
            """
            SELECT s.team_id, count(*) AS created_count
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.account_id = $2
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.team_id IS NOT NULL
            GROUP BY s.team_id
            """,
            days, account_id,
        )
        resolved_rows = await conn.fetch(
            """
            SELECT s.team_id, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.resolved_at >= now() - make_interval(days => $1) AND s.team_id IS NOT NULL
            GROUP BY s.team_id
            """,
            days, account_id,
        )
    result = {}
    for r in created_rows:
        result.setdefault(r["team_id"], {"team_id": r["team_id"], "created_count": 0, "resolved_count": 0})
        result[r["team_id"]]["created_count"] = r["created_count"]
    for r in resolved_rows:
        result.setdefault(r["team_id"], {"team_id": r["team_id"], "created_count": 0, "resolved_count": 0})
        result[r["team_id"]]["resolved_count"] = r["resolved_count"]
    return sorted(result.values(), key=lambda x: x["team_id"])


@router.get("/monitor/api/agents/{agent_id}/detail")
async def agent_detail_full(agent_id: int, request: Request, days: int = 30, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    if user["role"] != "administrator" and user["id"] != agent_id:
        raise HTTPException(403, "forbidden")
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        summary = await conn.fetchrow(
            """
            SELECT count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                avg(v.resolution_minutes) AS avg_resolution,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $3 AND s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            """,
            agent_id, days, account_id,
        )

        response_time_row = await conn.fetchrow(
            """
            WITH ordered AS (
                SELECT conversation_id, to_value, occurred_at,
                    LAG(to_value) OVER (PARTITION BY conversation_id ORDER BY occurred_at) AS prev_value,
                    LAG(occurred_at) OVER (PARTITION BY conversation_id ORDER BY occurred_at) AS prev_time
                FROM monitor.conversation_events
                WHERE event_type = 'message' AND is_private = false AND account_id = $3
                    AND occurred_at >= now() - make_interval(days => $2)
            )
            SELECT avg(EXTRACT(EPOCH FROM (o.occurred_at - o.prev_time)) / 60) AS avg_response_time
            FROM ordered o
            JOIN monitor.conversation_snapshot s ON s.conversation_id = o.conversation_id
            WHERE o.to_value = 'outgoing' AND o.prev_value = 'incoming' AND s.assignee_id = $1
            """,
            agent_id, days, account_id,
        )

        primary_team = await conn.fetchval(
            """
            SELECT s.team_id
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $3 AND s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
                AND s.team_id IS NOT NULL
            GROUP BY s.team_id
            ORDER BY count(*) DESC
            LIMIT 1
            """,
            agent_id, days, account_id,
        )

        team_avg = None
        if primary_team is not None:
            team_row = await conn.fetchrow(
                """
                SELECT avg(v.first_response_minutes) AS avg_first_response,
                    avg(v.resolution_minutes) AS avg_resolution,
                    count(*) AS resolved_count
                FROM monitor.v_sla v
                JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
                WHERE v.account_id = $3 AND s.team_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
                """,
                primary_team, days, account_id,
            )
            team_response_time_row = await conn.fetchrow(
                """
                WITH ordered AS (
                    SELECT conversation_id, to_value, occurred_at,
                        LAG(to_value) OVER (PARTITION BY conversation_id ORDER BY occurred_at) AS prev_value,
                        LAG(occurred_at) OVER (PARTITION BY conversation_id ORDER BY occurred_at) AS prev_time
                    FROM monitor.conversation_events
                    WHERE event_type = 'message' AND is_private = false AND account_id = $3
                        AND occurred_at >= now() - make_interval(days => $2)
                )
                SELECT avg(EXTRACT(EPOCH FROM (o.occurred_at - o.prev_time)) / 60) AS avg_response_time
                FROM ordered o
                JOIN monitor.conversation_snapshot s ON s.conversation_id = o.conversation_id
                WHERE o.to_value = 'outgoing' AND o.prev_value = 'incoming' AND s.team_id = $1
                """,
                primary_team, days, account_id,
            )
            team_avg = {
                "team_id": primary_team,
                "avg_first_response": team_row["avg_first_response"],
                "avg_resolution": team_row["avg_resolution"],
                "avg_response_time": team_response_time_row["avg_response_time"],
                "resolved_count": team_row["resolved_count"],
            }

        by_priority = await conn.fetch(
            """
            SELECT COALESCE(s.priority, 'none') AS priority,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $3 AND s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY s.priority
            """,
            agent_id, days, account_id,
        )
        by_subject_raw = await conn.fetch(
            """
            SELECT COALESCE(s.subject, 'Não categorizado') AS subject,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $3 AND s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY subject
            ORDER BY total DESC
            """,
            agent_id, days, account_id,
        )
        open_labels = await conn.fetch(
            """
            SELECT label, count(*) AS total
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE cs.account_id = $2 AND cs.assignee_id = $1 AND cs.status IN ('open', 'pending') AND label IS NOT NULL
            GROUP BY label ORDER BY total DESC
            """,
            agent_id, account_id,
        )
        by_channel_raw = await conn.fetch(
            """
            SELECT s.inbox_id,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $3 AND s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY s.inbox_id
            """,
            agent_id, days, account_id,
        )
        channels = await get_channels(conn, account_id)

    by_channel = {}
    for r in by_channel_raw:
        channel = resolve_channel(r["inbox_id"], channels)
        bucket = by_channel.setdefault(channel, {"channel": channel, "total": 0, "avg_resolution_sum": 0, "avg_first_response_sum": 0})
        bucket["total"] += r["total"]
        bucket["avg_resolution_sum"] += (r["avg_resolution"] or 0) * r["total"]
        bucket["avg_first_response_sum"] += (r["avg_first_response"] or 0) * r["total"]

    by_channel_result = [
        {
            "channel": b["channel"],
            "total": b["total"],
            "avg_resolution": b["avg_resolution_sum"] / b["total"] if b["total"] else None,
            "avg_first_response": b["avg_first_response_sum"] / b["total"] if b["total"] else None,
        }
        for b in by_channel.values()
    ]

    return {
        "summary": {**dict(summary), "avg_response_time": response_time_row["avg_response_time"]} if summary else {},
        "team_avg": team_avg,
        "by_priority": [dict(r) for r in by_priority],
        "open_labels": [dict(r) for r in open_labels],
        "by_channel": by_channel_result,
        "by_subject": [dict(r) for r in by_subject_raw],
    }


@router.get("/monitor/api/agents/reopen-rate")
async def agents_reopen_rate(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_id, s.assignee_name, count(*) AS reopened
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'status_changed'
              AND e.from_value = 'resolved'
              AND e.to_value IN ('open', 'pending')
              AND e.account_id = $2
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            ORDER BY reopened DESC
            """,
            days, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/agents/sla-ranking")
async def agents_sla_ranking(request: Request, days: int = 30, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_id, s.assignee_name,
                count(*) AS total,
                avg(v.first_response_minutes) AS avg_first_response,
                sum((v.resolution_minutes > v.target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.account_id = $2 AND v.last_resolved_at >= now() - make_interval(days => $1) AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            """,
            days, account_id,
        )
    return [
        {
            "assignee_id": r["assignee_id"],
            "assignee_name": r["assignee_name"],
            "total": r["total"],
            "avg_first_response": r["avg_first_response"],
            "sla_percent": round((1 - r["resolution_breach_rate"]) * 100, 0) if r["resolution_breach_rate"] is not None else None,
        }
        for r in rows
    ]


@router.get("/monitor/api/agents/awaiting-count")
async def agents_awaiting_count(request: Request, user=Depends(require_admin), account_id: int = Depends(get_account_id)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT cs.assignee_id, count(*) AS awaiting_count
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT to_value, occurred_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id
                  AND event_type = 'message' AND is_private = false AND account_id = $1
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.account_id = $1 AND cs.status IN ('open', 'pending') AND lm.to_value = 'incoming' AND cs.assignee_id IS NOT NULL
            GROUP BY cs.assignee_id
            """,
            account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/agents/{agent_id}/open-conversations")
async def agent_open_conversations(agent_id: int, request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    if user["role"] != "administrator" and user["id"] != agent_id:
        raise HTTPException(403, "forbidden")
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
            agent_id, account_id,
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


@router.get("/monitor/api/agents/{agent_id}/awaiting")
async def agent_awaiting(agent_id: int, request: Request, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    if user["role"] != "administrator" and user["id"] != agent_id:
        raise HTTPException(403, "forbidden")
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
            agent_id, account_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/agents/{agent_id}/reopened")
async def agent_reopened(agent_id: int, request: Request, days: int = 30, user=Depends(get_current_user), account_id: int = Depends(get_account_id)):
    if user["role"] != "administrator" and user["id"] != agent_id:
        raise HTTPException(403, "forbidden")
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
            days, agent_id, account_id,
        )
    return dict(row) if row else {"reopened": 0}
