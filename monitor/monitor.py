from fastapi import APIRouter, Request, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException
from auth import get_current_user, require_admin
import httpx
import os

router = APIRouter()

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS monitor;

CREATE TABLE IF NOT EXISTS monitor.conversation_snapshot (
    conversation_id BIGINT PRIMARY KEY,
    inbox_id INT,
    status TEXT,
    assignee_id INT,
    team_id INT,
    company_name TEXT,
    contact_id INT,
    contact_name TEXT,
    labels TEXT[],
    updated_at TIMESTAMPTZ
);

ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS assignee_name TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS assignee_name TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE monitor.conversation_events ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS cd_cliente TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS regime_tributario TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS status_contrato TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS demanda_avulsa BOOLEAN;

CREATE TABLE IF NOT EXISTS monitor.conversation_events (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT,
    inbox_id INT,
    event_type TEXT,
    from_value TEXT,
    to_value TEXT,
    agent_id INT,
    occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitor.sla_targets (
    team_id INT PRIMARY KEY,
    first_response_minutes INT NOT NULL,
    resolution_minutes INT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor.sla_priority_targets (
    priority TEXT PRIMARY KEY,
    first_response_minutes INT NOT NULL,
    resolution_minutes INT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def to_ts(value) -> datetime:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError):
        return datetime.now(tz=timezone.utc)

async def get_inbox_channel_map(conn):
    rows = await conn.fetch(
        "SELECT key, value FROM monitor.settings WHERE key IN ('whatsapp_inbox_ids', 'email_inbox_ids')"
    )
    settings_map = {r["key"]: r["value"] for r in rows}

    def parse_ids(raw):
        return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()} if raw else set()

    return parse_ids(settings_map.get("whatsapp_inbox_ids")), parse_ids(settings_map.get("email_inbox_ids"))


def resolve_channel(inbox_id, whatsapp_ids, email_ids):
    if inbox_id in whatsapp_ids:
        return "whatsapp"
    if inbox_id in email_ids:
        return "email"
    return "other"

async def handle_conversation_event(data: dict, pool):
    conversation_id = data.get("id")
    if not conversation_id:
        return
    inbox_id = data.get("inbox_id")
    status = data.get("status")
    meta = data.get("meta") or {}
    assignee = meta.get("assignee") or {}
    assignee_id = (meta.get("assignee") or {}).get("id")
    assignee_name = assignee.get("name")
    team_id = (meta.get("team") or {}).get("id")
    priority = data.get("priority")
    custom_attrs = data.get("custom_attributes") or {}
    subject = custom_attrs.get("assunto_motivo")
    demanda_avulsa = custom_attrs.get("demanda_avulsa_cobrana_extra")
    occurred_at = to_ts(data.get("timestamp") or data.get("updated_at") or data.get("created_at"))
    contact = meta.get("sender") or {}
    contact_id = contact.get("id")
    contact_name = contact.get("name")
    contact_attrs = contact.get("additional_attributes") or {}
    contact_custom_attrs = contact.get("custom_attributes") or {}
    company_name = contact_attrs.get("company_name")
    cd_cliente = contact_custom_attrs.get("cd_cliente")
    razao_social = contact_custom_attrs.get("razo_social")
    regime_tributario = contact_custom_attrs.get("regime_tributrio")
    status_contrato = contact_custom_attrs.get("status_do_contrato")
    labels = data.get("labels") or []

    async with pool.acquire() as conn:
        snap = await conn.fetchrow(
            "SELECT status, assignee_id, team_id FROM monitor.conversation_snapshot WHERE conversation_id=$1",
            conversation_id,
        )

        if snap is None:
            await conn.execute(
                "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, event_type, to_value, occurred_at) "
                "VALUES ($1,$2,'created',$3,$4)",
                conversation_id, inbox_id, status, occurred_at,
            )
        else:
            if snap["status"] != status:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, event_type, from_value, to_value, occurred_at) "
                    "VALUES ($1,$2,'status_changed',$3,$4,$5)",
                    conversation_id, inbox_id, snap["status"], status, occurred_at,
                )
            if snap["assignee_id"] != assignee_id:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, event_type, from_value, to_value, agent_id, occurred_at) "
                    "VALUES ($1,$2,'assignee_changed',$3,$4,$5,$6)",
                    conversation_id, inbox_id, str(snap["assignee_id"]), str(assignee_id), assignee_id, occurred_at,
                )
            if snap["team_id"] != team_id:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, event_type, from_value, to_value, occurred_at) "
                    "VALUES ($1,$2,'team_changed',$3,$4,$5)",
                    conversation_id, inbox_id, str(snap["team_id"]), str(team_id), occurred_at,
                )

        await conn.execute(
                """
                INSERT INTO monitor.conversation_snapshot
                    (conversation_id, inbox_id, status, assignee_id, assignee_name, team_id,
                     company_name, contact_id, contact_name, priority, subject, labels, updated_at,
                     cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
                ON CONFLICT (conversation_id) DO UPDATE SET
                    inbox_id = $2, status = $3, assignee_id = $4, assignee_name = $5, team_id = $6,
                    company_name = $7, contact_id = $8, contact_name = $9, priority = $10,
                    subject = $11, labels = $12, updated_at = $13,
                    cd_cliente = $14, razao_social = $15, regime_tributario = $16, status_contrato = $17,
                    demanda_avulsa = $18
                """,
                conversation_id, inbox_id, status, assignee_id, assignee_name, team_id,
                company_name, contact_id, contact_name, priority, subject, labels, occurred_at,
                cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa,
           )

async def handle_message_event(data: dict, pool):
    conv = data.get("conversation") or {}
    conversation_id = conv.get("id")
    if not conversation_id:
        return
    inbox_id = conv.get("inbox_id")
    message_type = data.get("message_type")
    sender = data.get("sender") or {}
    agent_id = sender.get("id") if message_type == "outgoing" else None
    occurred_at = to_ts(data.get("created_at"))
    is_private = bool(data.get("private", False))

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, event_type, to_value, agent_id, occurred_at, is_private) "
            "VALUES ($1,$2,'message',$3,$4,$5,$6)",
            conversation_id, inbox_id, message_type, agent_id, occurred_at, is_private,
        )


@router.post("/webhook/monitor")
async def monitor_webhook(request: Request):
    data = await request.json()
    event = data.get("event")
    pool = request.app.state.monitor_pool

    if event in ("conversation_created", "conversation_status_changed", "conversation_updated"):
        await handle_conversation_event(data, pool)
    elif event == "message_created":
        await handle_message_event(data, pool)
    else:
        return {"status": "ignored"}

    return {"status": "ok"}

ALLOWED_DAYS = {7, 30, 90}
ALLOWED_DAYS_EXTENDED = {7, 14, 30, 90, 180}

def _validate_days(days: int) -> int:
    return days if days in ALLOWED_DAYS else 30

def _validate_days_extended(days: int) -> int:
    return days if days in ALLOWED_DAYS_EXTENDED else 30
    

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

CHATWOOT_URL = os.environ["CHATWOOT_URL"]
@router.get("/monitor/api/agents")
async def agents(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        resolved = await conn.fetch(
            """
            SELECT assignee_id, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent
            WHERE resolved_at >= now() - interval '30 days'
            GROUP BY assignee_id
            """
        )
        current = await conn.fetch(
            """
            SELECT assignee_id, status, count(*) AS total
            FROM monitor.conversation_snapshot
            WHERE status IN ('open', 'pending')
            GROUP BY assignee_id, status
            """
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
async def agents_summary(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        open_rows = await conn.fetch(
            """
            SELECT assignee_id, assignee_name, count(*) AS open_count
            FROM monitor.conversation_snapshot
            WHERE status IN ('open', 'pending') AND assignee_id IS NOT NULL
            GROUP BY assignee_id, assignee_name
            """
        )
        resolved_rows = await conn.fetch(
            """
            SELECT s.assignee_id, s.assignee_name, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.resolved_at >= now() - make_interval(days => $1)
              AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            """,
            days,
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
async def teams_distribution(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        created_rows = await conn.fetch(
            """
            SELECT s.team_id, count(*) AS created_count
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.team_id IS NOT NULL
            GROUP BY s.team_id
            """,
            days,
        )
        resolved_rows = await conn.fetch(
            """
            SELECT s.team_id, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.resolved_at >= now() - make_interval(days => $1) AND s.team_id IS NOT NULL
            GROUP BY s.team_id
            """,
            days,
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
async def agent_detail_full(agent_id: int, request: Request, days: int = 30, user=Depends(get_current_user)):
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
            WHERE s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            """,
            agent_id, days,
        )
        by_priority = await conn.fetch(
            """
            SELECT COALESCE(s.priority, 'none') AS priority,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY priority
            """,
            agent_id, days,
        )
        by_subject_raw = await conn.fetch(
            """
            SELECT COALESCE(s.subject, 'Não categorizado') AS subject,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY subject
            ORDER BY total DESC
            """,
            agent_id, days,
        )
        open_labels = await conn.fetch(
            """
            SELECT label, count(*) AS total
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE cs.assignee_id = $1 AND cs.status IN ('open', 'pending') AND label IS NOT NULL
            GROUP BY label ORDER BY total DESC
            """,
            agent_id,
        )
        by_channel_raw = await conn.fetch(
            """
            SELECT s.inbox_id,
                avg(v.resolution_minutes) AS avg_resolution,
                avg(v.first_response_minutes) AS avg_first_response,
                count(*) AS total
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE s.assignee_id = $1 AND v.last_resolved_at >= now() - make_interval(days => $2)
            GROUP BY s.inbox_id
            """,
            agent_id, days,
        )
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)

    by_channel = {}
    for r in by_channel_raw:
        channel = resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)
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
        "summary": dict(summary) if summary else {},
        "by_priority": [dict(r) for r in by_priority],
        "open_labels": [dict(r) for r in open_labels],
        "by_channel": by_channel_result,
        "by_subject": [dict(r) for r in by_subject_raw],
    }  

@router.get("/monitor/api/agents/reopen-rate")
async def agents_reopen_rate(request: Request, days: int = 30, user=Depends(require_admin)):
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
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            ORDER BY reopened DESC
            """,
            days,
        )
    return [dict(r) for r in rows]

@router.get("/monitor/api/agents/sla-ranking")
async def agents_sla_ranking(request: Request, days: int = 30, user=Depends(require_admin)):
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
            WHERE v.last_resolved_at >= now() - make_interval(days => $1) AND s.assignee_id IS NOT NULL
            GROUP BY s.assignee_id, s.assignee_name
            """,
            days,
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
async def agents_awaiting_count(request: Request, user=Depends(require_admin)):
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
                  AND event_type = 'message' AND is_private = false
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.status IN ('open', 'pending') AND lm.to_value = 'incoming' AND cs.assignee_id IS NOT NULL
            GROUP BY cs.assignee_id
            """
        )
    return [dict(r) for r in rows]
    

ALLOWED_SORT = {
    "created_at": "created_at",
    "updated_at": "updated_at",
    "priority": "priority",
    "sla_deadline": "sla_deadline",
}

@router.get("/monitor/api/conversations")
async def list_conversations(
    request: Request,
    status: str = "open",
    label: Optional[str] = None,
    assignee_id: Optional[int] = None,
    search: Optional[str] = None,
    sort_by: str = "sla_deadline",
    sort_dir: str = "asc",
    page: int = 1,
    page_size: int = 50,
    user=Depends(get_current_user),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size
    sort_col = ALLOWED_SORT.get(sort_by, "sla_deadline")
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where = []
    params = []

    if status != "all":
        params.append(status)
        where.append(f"cs.status = ${len(params)}")

    if label:
        params.append(label)
        where.append(f"${len(params)} = ANY(cs.labels)")

    if assignee_id:
        params.append(assignee_id)
        where.append(f"cs.assignee_id = ${len(params)}")

    if search:
        params.append(f"%{search}%")
        idx = len(params)
        where.append(f"(cs.contact_name ILIKE ${idx} OR cs.company_name ILIKE ${idx} OR cs.subject ILIKE ${idx})")

    where_clause = "WHERE " + " AND ".join(where) if where else ""

    query = f"""
        WITH base AS (
            SELECT cs.conversation_id, cs.inbox_id, cs.status, cs.priority, cs.subject,
                cs.contact_name, cs.company_name, cs.assignee_name, cs.team_id, cs.labels,
                cs.updated_at, l.created_at,
                v.first_response_minutes, v.resolution_minutes, v.target_resolution_minutes, v.last_resolved_at,
                pt.resolution_minutes AS target_minutes,
                CASE
                    WHEN cs.status = 'resolved' THEN NULL
                    ELSE l.created_at + (pt.resolution_minutes || ' minutes')::interval
                END AS sla_deadline,
                CASE
                    WHEN cs.status = 'resolved' AND v.resolution_minutes IS NOT NULL THEN
                        CASE WHEN v.resolution_minutes > v.target_resolution_minutes THEN 'late' ELSE 'on_time' END
                    WHEN cs.status = 'resolved' THEN 'unknown'
                    WHEN l.created_at + (pt.resolution_minutes || ' minutes')::interval < now() THEN 'late'
                    ELSE 'on_time'
                END AS sla_status
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_conversation_lifecycle l ON l.conversation_id = cs.conversation_id
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            LEFT JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(cs.priority, 'none')
            {where_clause}
        )
        SELECT *, count(*) OVER() AS total_count
        FROM base
        ORDER BY {sort_col} {sort_dir} NULLS LAST
        LIMIT {page_size} OFFSET {offset}
    """

    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(query, *params)

    total = rows[0]["total_count"] if rows else 0
    items = []
    for r in rows:
        d = dict(r)
        d.pop("total_count", None)
        d["channel"] = resolve_channel(d["inbox_id"], whatsapp_ids, email_ids)
        d["minutes_remaining"] = (
            None if d["sla_deadline"] is None
            else (d["sla_deadline"] - datetime.now(timezone.utc)).total_seconds() / 60
        )
        items.append(d)

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/monitor/api/conversations/labels")
async def conversations_labels(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT label
            FROM monitor.conversation_snapshot cs
            LEFT JOIN LATERAL unnest(COALESCE(cs.labels, '{}')) AS label ON true
            WHERE label IS NOT NULL
            ORDER BY label
            """
        )
    return [r["label"] for r in rows]

@router.get("/monitor/api/labels")
async def labels_stats(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM monitor.v_label_stats")
    return [dict(r) for r in rows]

@router.get("/monitor/api/companies")
async def companies(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM monitor.v_company_metrics ORDER BY total_conversations DESC LIMIT 50")
    return [dict(r) for r in rows]

@router.get("/monitor/api/agents/{agent_id}")
async def agent_detail(agent_id: int, request: Request, user=Depends(get_current_user)):
    if user["role"] != "administrator" and user["id"] != agent_id:
        raise HTTPException(403, "forbidden")
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT v.conversation_id, v.inbox_id, v.team_id, v.first_response_minutes,
                   v.resolution_minutes, v.target_first_response_minutes, v.target_resolution_minutes,
                   v.last_resolved_at
            FROM monitor.v_sla v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE s.assignee_id = $1 AND v.last_resolved_at IS NOT NULL
            ORDER BY v.last_resolved_at DESC
            LIMIT 50
            """,
            agent_id,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/status")
async def my_status(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
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
            LEFT JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(cs.priority, 'none')
            WHERE cs.assignee_id = $1 AND cs.status IN ('open', 'pending')
            ORDER BY sla_deadline ASC NULLS LAST
            """,
            user["id"],
        )
    items = []
    for r in rows:
        d = dict(r)
        d["channel"] = resolve_channel(d["inbox_id"], whatsapp_ids, email_ids)
        d["minutes_remaining"] = (
            None if d["sla_deadline"] is None
            else (d["sla_deadline"] - datetime.now(timezone.utc)).total_seconds() / 60
        )
        items.append(d)
    return items

@router.get("/monitor/api/today/hourly")
async def today_hourly(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT date_trunc('hour', occurred_at AT TIME ZONE 'America/Sao_Paulo') AS hour,
                inbox_id,
                count(*) FILTER (WHERE event_type = 'created') AS created,
                count(*) FILTER (WHERE event_type = 'status_changed' AND to_value = 'resolved') AS resolved
            FROM monitor.conversation_events
            WHERE occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            GROUP BY hour, inbox_id ORDER BY hour
            """
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
async def today_conv_priority(priority: str, request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created'
            ) ce ON true
            WHERE cs.status IN ('open', 'pending') AND COALESCE(cs.priority, 'none') = $1
            ORDER BY ce.created_at ASC
            """,
            priority
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]

@router.get("/monitor/api/today/conversations/label/{label}")
async def today_conv_label(label: str, request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created'
            ) ce ON true
            WHERE cs.status IN ('open', 'pending') AND $1 = ANY(cs.labels)
            ORDER BY ce.created_at ASC
            """,
            label
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]

@router.get("/monitor/api/today/kpi/{kpi}")
async def today_kpi(kpi: str, request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    queries = {
        "created-today": """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.status, s.priority, e.occurred_at AS created_at,
                   EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 60 AS age_minutes
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
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
                WHERE conversation_id = s.conversation_id AND event_type = 'created'
            ) ce ON true
            WHERE s.status = 'open'
            ORDER BY s.updated_at DESC
        """,
        "unassigned": """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.priority, s.status, s.updated_at,
                   EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot s
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = s.conversation_id AND event_type = 'created'
            ) ce ON true
            WHERE s.assignee_id IS NULL AND s.status IN ('open', 'pending')
            ORDER BY s.updated_at DESC
        """,
        "open-total": """
            SELECT cs.conversation_id, cs.inbox_id, cs.contact_name, cs.assignee_name, cs.priority, cs.status,
                EXTRACT(EPOCH FROM (now() - ce.created_at)) / 60 AS age_minutes
            FROM monitor.conversation_snapshot cs
            JOIN LATERAL (
                SELECT min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE conversation_id = cs.conversation_id AND event_type = 'created'
            ) ce ON true
            WHERE cs.status IN ('open', 'pending')
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
                  AND event_type = 'message' AND is_private = false
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.status IN ('open', 'pending') AND lm.to_value = 'incoming'
            ORDER BY lm.occurred_at ASC
        """
    }
    if kpi not in queries:
        raise HTTPException(404, "kpi desconhecido")
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(queries[kpi])
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]

@router.get("/monitor/api/today/first-response")
async def today_first_response(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH created_evt AS (
                SELECT conversation_id, min(occurred_at) AS created_at
                FROM monitor.conversation_events
                WHERE event_type = 'created'
                GROUP BY conversation_id
            ),
            first_response_evt AS (
                SELECT conversation_id, min(occurred_at) AS responded_at
                FROM monitor.conversation_events
                WHERE event_type = 'message' AND to_value = 'outgoing' AND is_private = false
                GROUP BY conversation_id
            )
            SELECT avg(EXTRACT(EPOCH FROM (fr.responded_at - ce.created_at)) / 60) AS avg_first_response,
                count(*) AS total
            FROM first_response_evt fr
            JOIN created_evt ce ON ce.conversation_id = fr.conversation_id
            WHERE fr.responded_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            """
        )
    return dict(row) if row else {"avg_first_response": None, "total": 0}

@router.get("/monitor/api/today/comparison")
async def today_comparison(request: Request, user=Depends(require_admin)):
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
                WHERE e.event_type IN ('created', 'status_changed') AND e.occurred_at <= target.t
                ORDER BY e.conversation_id, e.occurred_at DESC
            ),
            assignee_last_before AS (
                SELECT DISTINCT ON (e.conversation_id) e.conversation_id, e.to_value AS assignee_at_t
                FROM monitor.conversation_events e, target
                WHERE e.event_type = 'assignee_changed' AND e.occurred_at <= target.t
                ORDER BY e.conversation_id, e.occurred_at DESC
            ),
            assignee_first_ever AS (
                SELECT DISTINCT ON (conversation_id) conversation_id, from_value AS assignee_before_history
                FROM monitor.conversation_events
                WHERE event_type = 'assignee_changed'
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
            """
        )
    return dict(row) if row else {"open_last_week": 0, "unassigned_last_week": 0}


@router.get("/monitor/api/today/attention")
async def today_attention(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT s.conversation_id, s.inbox_id, s.contact_name, s.subject, s.priority, s.assignee_name,
                l.created_at,
                (l.created_at + (pt.resolution_minutes || ' minutes')::interval) AS sla_deadline,
                EXTRACT(epoch FROM ((l.created_at + (pt.resolution_minutes || ' minutes')::interval) - now())) / 60 AS minutes_remaining
            FROM monitor.conversation_snapshot s
            JOIN monitor.v_conversation_lifecycle l ON l.conversation_id = s.conversation_id
            JOIN monitor.sla_priority_targets pt ON pt.priority = COALESCE(s.priority, 'none')
            WHERE s.status <> 'resolved' AND l.last_resolved_at IS NULL
            ORDER BY minutes_remaining ASC
            LIMIT 50
            """
        )
    return [{**dict(r), "channel": resolve_channel(r["inbox_id"], whatsapp_ids, email_ids)} for r in rows]


@router.get("/monitor/api/today/assignees")
async def today_assignees(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_name, count(*) AS total
            FROM monitor.conversation_events e
            JOIN monitor.conversation_snapshot s ON s.conversation_id = e.conversation_id
            WHERE e.event_type = 'created'
              AND e.occurred_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND s.assignee_name IS NOT NULL
            GROUP BY s.assignee_name
            ORDER BY total DESC
            """
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/today/top-solvers")
async def today_top_solvers(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.assignee_name, count(*) AS resolved_count
            FROM monitor.v_resolutions_by_agent v
            JOIN monitor.conversation_snapshot s ON s.conversation_id = v.conversation_id
            WHERE v.resolved_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND s.assignee_name IS NOT NULL
            GROUP BY s.assignee_name
            ORDER BY resolved_count DESC
            LIMIT 10
            """
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/today/kpis")
async def today_kpis(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT count(*) AS total,
                avg(first_response_minutes) AS avg_first_response,
                avg(resolution_minutes) AS avg_resolution,
                sum((resolution_minutes > target_resolution_minutes)::int)::float / NULLIF(count(*), 0) AS resolution_breach_rate
            FROM monitor.v_sla
            WHERE last_resolved_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
            """
        )
    return dict(row) if row else {}


@router.get("/monitor/api/sla-priority-targets")
async def get_sla_priority_targets(request: Request, user=Depends(require_admin)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM monitor.sla_priority_targets ORDER BY priority")
    return [dict(r) for r in rows]


@router.put("/monitor/api/sla-priority-targets")
async def update_sla_priority_targets(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for item in body:
            await conn.execute(
                """
                INSERT INTO monitor.sla_priority_targets (priority, first_response_minutes, resolution_minutes)
                VALUES ($1,$2,$3)
                ON CONFLICT (priority) DO UPDATE SET
                    first_response_minutes = $2, resolution_minutes = $3
                """,
                item["priority"], item["first_response_minutes"], item["resolution_minutes"],
            )
    return {"status": "ok"}


@router.get("/monitor/api/me/awaiting")
async def me_awaiting(request: Request, user=Depends(get_current_user)):
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
                  AND event_type = 'message' AND is_private = false
                ORDER BY occurred_at DESC
                LIMIT 1
            ) lm ON true
            WHERE cs.assignee_id = $1 AND cs.status IN ('open', 'pending') AND lm.to_value = 'incoming'
            ORDER BY lm.occurred_at ASC
            """,
            user["id"],
        )
    return [dict(r) for r in rows]

@router.get("/monitor/api/me/reopened")
async def me_reopened(request: Request, days: int = 30, user=Depends(get_current_user)):
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
              AND e.occurred_at >= now() - make_interval(days => $1)
              AND s.assignee_id = $2
            """,
            days, user["id"],
        )
    return dict(row) if row else {"reopened": 0}


@router.get("/monitor/api/settings")
async def get_settings(request: Request, user=Depends(get_current_user)):
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT key, value FROM monitor.settings")
    return {r["key"]: r["value"] for r in rows}


@router.put("/monitor/api/settings")
async def update_settings(request: Request, user=Depends(require_admin)):
    body = await request.json()
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        for key, value in body.items():
            await conn.execute(
                "INSERT INTO monitor.settings (key, value) VALUES ($1,$2) "
                "ON CONFLICT (key) DO UPDATE SET value = $2",
                key, str(value),
            )
    return {"status": "ok"}


@router.get("/monitor/api/clients/summary")
async def clients_summary(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)
        rows = await conn.fetch(
            """
            SELECT COALESCE(cs.cd_cliente, 'sem-codigo-' || cs.contact_id) AS client_key,
                COALESCE(cs.razao_social, cs.company_name, cs.contact_name, 'Cliente não identificado') AS client_name,
                cs.regime_tributario, cs.status_contrato, cs.inbox_id,
                v.resolution_minutes, v.target_resolution_minutes, v.last_resolved_at
            FROM monitor.conversation_snapshot cs
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            WHERE cs.contact_id IS NOT NULL
            """,
            days,
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
async def subjects_summary(request: Request, days: int = 30, user=Depends(require_admin)):
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
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            GROUP BY subject
            ORDER BY total DESC
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/new-vs-returning")
async def clients_new_vs_returning(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            WITH first_contact AS (
                SELECT cs.contact_id, min(e.occurred_at) AS first_seen
                FROM monitor.conversation_snapshot cs
                JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                WHERE e.event_type = 'created' AND cs.contact_id IS NOT NULL
                GROUP BY cs.contact_id
            )
            SELECT
                count(*) FILTER (WHERE first_seen >= now() - make_interval(days => $1)) AS new_clients,
                count(*) FILTER (WHERE first_seen < now() - make_interval(days => $1)) AS returning_clients
            FROM first_contact
            """,
            days,
        )
    return dict(row) if row else {"new_clients": 0, "returning_clients": 0}


@router.get("/monitor/api/clients/{client_key}/detail")
async def client_detail(client_key: str, request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
        whatsapp_ids, email_ids = await get_inbox_channel_map(conn)

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
                AND e.event_type = 'created'
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE {client_filter} AND e.occurred_at >= now() - make_interval(days => $1)
            ORDER BY e.occurred_at DESC
            """,
            days, contact_id,
        )

        by_team_rows = await conn.fetch(
                    f"""
                    SELECT cs.team_id, count(*) AS total, avg(v.resolution_minutes) AS avg_resolution, sum(v.resolution_minutes) AS total_minutes
                    FROM monitor.conversation_snapshot cs
                    JOIN monitor.conversation_events e ON e.conversation_id = cs.conversation_id
                        AND e.event_type = 'created'
                    LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
                    WHERE {client_filter} AND e.occurred_at >= now() - make_interval(days => $1)
                    GROUP BY cs.team_id
                    """,
                    days, contact_id,
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
                "team_name": TEAM_NAMES_BACKEND.get(r["team_id"], f"Time {r['team_id']}" if r["team_id"] else "Sem time"),
                "total": r["total"],
                "avg_resolution": r["avg_resolution"],
                "total_minutes": r["total_minutes"],
            }
            for r in by_team_rows
        ],
    }

TEAM_NAMES_BACKEND = {1: "Dev", 2: "Fiscal", 3: "Departamento Pessoal", 4: "Financeiro", 5: "Contábil", 7: "Comercial", 8: "Outros", 9: "Triagem"}


@router.get("/monitor/api/departments/client-time")
async def departments_client_time(request: Request, days: int = 30, user=Depends(require_admin)):
    days = _validate_days_extended(days)
    pool = request.app.state.monitor_pool
    async with pool.acquire() as conn:
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
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.team_id IS NOT NULL AND cs.contact_id IS NOT NULL AND v.resolution_minutes IS NOT NULL
            GROUP BY cs.team_id, client_key, client_name
            """,
            days,
        )

    by_team = {}
    for r in rows:
        t = by_team.setdefault(r["team_id"], {"team_id": r["team_id"], "team_name": TEAM_NAMES_BACKEND.get(r["team_id"], f"Time {r['team_id']}"), "total_minutes": 0, "total_conversations": 0, "clients": 0})
        t["total_minutes"] += r["total_minutes"] or 0
        t["total_conversations"] += r["total"]
        t["clients"] += 1

    return sorted(by_team.values(), key=lambda x: -x["total_minutes"])


@router.get("/monitor/api/clients/demanda-avulsa")
async def clients_demanda_avulsa(request: Request, days: int = 30, user=Depends(require_admin)):
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
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            WHERE cs.demanda_avulsa = true AND cs.contact_id IS NOT NULL
            GROUP BY client_key, client_name
            ORDER BY total DESC
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/by-regime")
async def clients_by_regime(request: Request, days: int = 30, user=Depends(require_admin)):
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
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.contact_id IS NOT NULL
            GROUP BY regime
            ORDER BY total DESC
            """,
            days,
        )
    return [dict(r) for r in rows]


@router.get("/monitor/api/clients/by-status-contrato")
async def clients_by_status_contrato(request: Request, days: int = 30, user=Depends(require_admin)):
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
                AND e.event_type = 'created' AND e.occurred_at >= now() - make_interval(days => $1)
            LEFT JOIN monitor.v_sla v ON v.conversation_id = cs.conversation_id
            WHERE cs.contact_id IS NOT NULL
            GROUP BY status_contrato
            ORDER BY total DESC
            """,
            days,
        )
    return [dict(r) for r in rows]
