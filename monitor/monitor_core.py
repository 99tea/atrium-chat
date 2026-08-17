from fastapi import APIRouter, Request
from datetime import datetime, timezone

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
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS excluded_from_metrics BOOLEAN DEFAULT false;

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

CREATE TABLE IF NOT EXISTS monitor.teams (
    team_id INT PRIMARY KEY,
    team_name TEXT NOT NULL
);

INSERT INTO monitor.teams (team_id, team_name) VALUES
    (1, 'Dev'), (2, 'Fiscal'), (3, 'Departamento Pessoal'), (4, 'Financeiro'),
    (5, 'Contábil'), (7, 'Comercial'), (8, 'Outros'), (9, 'Triagem')
ON CONFLICT (team_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS monitor.label_colors (
    label TEXT PRIMARY KEY,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor.user_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitor.bug_reports (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    user_name TEXT NOT NULL,
    description TEXT NOT NULL,
    screenshot TEXT,
    route TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    created_at TIMESTAMPTZ DEFAULT now()
);
"""

DEFAULT_LABEL_COLOR = "#9296b8"

async def get_cancellation_label(conn) -> str:
    row = await conn.fetchrow("SELECT value FROM monitor.settings WHERE key = 'cancellation_label'")
    return row["value"] if row else "cancelado"


async def get_team_names(conn) -> dict:
    rows = await conn.fetch("SELECT team_id, team_name FROM monitor.teams")
    return {r["team_id"]: r["team_name"] for r in rows}


ALLOWED_DAYS = {7, 30, 90}
ALLOWED_DAYS_EXTENDED = {7, 14, 30, 90, 180}


def _validate_days(days: int) -> int:
    return days if days in ALLOWED_DAYS else 30


def _validate_days_extended(days: int) -> int:
    return days if days in ALLOWED_DAYS_EXTENDED else 30


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
        cancellation_label = await get_cancellation_label(conn)
        excluded_from_metrics = status == "resolved" and cancellation_label in labels

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
                     cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa,
                     excluded_from_metrics)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                ON CONFLICT (conversation_id) DO UPDATE SET
                    inbox_id = $2, status = $3, assignee_id = $4, assignee_name = $5, team_id = $6,
                    company_name = $7, contact_id = $8, contact_name = $9, priority = $10,
                    subject = $11, labels = $12, updated_at = $13,
                    cd_cliente = $14, razao_social = $15, regime_tributario = $16, status_contrato = $17,
                    demanda_avulsa = $18, excluded_from_metrics = $19
                """,
                conversation_id, inbox_id, status, assignee_id, assignee_name, team_id,
                company_name, contact_id, contact_name, priority, subject, labels, occurred_at,
                cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa,
                excluded_from_metrics,
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
