from fastapi import APIRouter, Request
from datetime import datetime, timezone, timedelta

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
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS cd_cliente TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS regime_tributario TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS status_contrato TEXT;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS demanda_avulsa BOOLEAN;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS excluded_from_metrics BOOLEAN DEFAULT false;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS account_id BIGINT;

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

ALTER TABLE monitor.conversation_events ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE monitor.conversation_events ADD COLUMN IF NOT EXISTS account_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_snapshot_account ON monitor.conversation_snapshot(account_id);
CREATE INDEX IF NOT EXISTS idx_events_account ON monitor.conversation_events(account_id);
CREATE INDEX IF NOT EXISTS idx_events_conv_account ON monitor.conversation_events(conversation_id, account_id);

CREATE TABLE IF NOT EXISTS monitor.sla_targets (
    account_id BIGINT NOT NULL,
    team_id INT NOT NULL,
    first_response_minutes INT NOT NULL,
    resolution_minutes INT NOT NULL,
    PRIMARY KEY (account_id, team_id)
);

CREATE TABLE IF NOT EXISTS monitor.sla_priority_targets (
    account_id BIGINT NOT NULL,
    priority TEXT NOT NULL,
    first_response_minutes INT NOT NULL,
    resolution_minutes INT NOT NULL,
    PRIMARY KEY (account_id, priority)
);

CREATE TABLE IF NOT EXISTS monitor.settings (
    account_id BIGINT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (account_id, key)
);

CREATE TABLE IF NOT EXISTS monitor.teams (
    account_id BIGINT NOT NULL,
    team_id INT NOT NULL,
    team_name TEXT NOT NULL,
    PRIMARY KEY (account_id, team_id)
);

CREATE TABLE IF NOT EXISTS monitor.label_colors (
    account_id BIGINT NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    PRIMARY KEY (account_id, label)
);

CREATE TABLE IF NOT EXISTS monitor.user_tasks (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE monitor.user_tasks ADD COLUMN IF NOT EXISTS account_id BIGINT;

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

ALTER TABLE monitor.bug_reports ADD COLUMN IF NOT EXISTS account_id BIGINT;

CREATE TABLE IF NOT EXISTS monitor.business_hours_config (
    account_id BIGINT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT false,
    business_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
    hour_start TIME NOT NULL DEFAULT '08:00',
    hour_end TIME NOT NULL DEFAULT '18:00'
);

CREATE TABLE IF NOT EXISTS monitor.channels (
    account_id BIGINT NOT NULL,
    channel_key TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    inbox_ids INT[] NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (account_id, channel_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_created_once
    ON monitor.conversation_events (conversation_id)
    WHERE event_type = 'created';

ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS sla_ignore_business_hours BOOLEAN DEFAULT false;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS sla_ignore_business_hours BOOLEAN DEFAULT false;
ALTER TABLE monitor.conversation_snapshot ADD COLUMN IF NOT EXISTS company_override TEXT;
"""

DEFAULT_LABEL_COLOR = "#9296b8"


async def get_cancellation_label(conn, account_id: int) -> str:
    row = await conn.fetchrow(
        "SELECT value FROM monitor.settings WHERE account_id = $1 AND key = 'cancellation_label'",
        account_id,
    )
    return row["value"] if row else "cancelado"


async def get_team_names(conn, account_id: int) -> dict:
    rows = await conn.fetch(
        "SELECT team_id, team_name FROM monitor.teams WHERE account_id = $1",
        account_id,
    )
    return {r["team_id"]: r["team_name"] for r in rows}


ALLOWED_DAYS = {7, 30, 90}
ALLOWED_DAYS_EXTENDED = {7, 14, 30, 90, 180}


def _validate_days(days: int) -> int:
    return days if days in ALLOWED_DAYS else 30


def _validate_days_extended(days: int) -> int:
    return days if days in ALLOWED_DAYS_EXTENDED else 30


def resolve_date_range(days: int | None, start_date: str | None, end_date: str | None):
    if start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            return start, end
        except ValueError:
            pass
    d = _validate_days_extended(days if days is not None else 30)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=d)
    return start, end


def to_ts(value) -> datetime:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError):
        return datetime.now(tz=timezone.utc)


async def get_channels(conn, account_id: int) -> list:
    rows = await conn.fetch(
        "SELECT channel_key, channel_name, inbox_ids, is_default FROM monitor.channels WHERE account_id = $1 ORDER BY is_default DESC, channel_name",
        account_id,
    )
    if not rows:
        await conn.execute(
            """
            INSERT INTO monitor.channels (account_id, channel_key, channel_name, inbox_ids, is_default)
            VALUES ($1,'whatsapp','WhatsApp','{}',true), ($1,'email','E-mail','{}',true)
            ON CONFLICT DO NOTHING
            """,
            account_id,
        )
        rows = await conn.fetch(
            "SELECT channel_key, channel_name, inbox_ids, is_default FROM monitor.channels WHERE account_id = $1 ORDER BY is_default DESC, channel_name",
            account_id,
        )
    return [dict(r) for r in rows]


def resolve_channel(inbox_id, channels: list) -> str:
    for c in channels:
        if inbox_id in c["inbox_ids"]:
            return c["channel_key"]
    return "other"


def extract_account_id(data: dict) -> int | None:
    account = data.get("account") or {}
    account_id = account.get("id")
    if account_id is None:
        print(f"[monitor_webhook] WARNING payload sem account.id - event={data.get('event')}")
    return account_id


async def handle_conversation_event(data: dict, pool):
    conversation_id = data.get("id")
    if not conversation_id:
        return
    account_id = extract_account_id(data)
    if account_id is None:
        print(f"[monitor_webhook] ignorando conversation_id={conversation_id} - account_id ausente no payload")
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
    demanda_avulsa = custom_attrs.get("demanda_avulsa_cobrana_extra")
    sla_ignore_business_hours = bool(custom_attrs.get("horas_extras"))
    raw_override = custom_attrs.get("empresa_atendimento")
    company_override = raw_override.strip() if isinstance(raw_override, str) and raw_override.strip() else None
    

    async with pool.acquire() as conn:
        cancellation_label = await get_cancellation_label(conn, account_id)
        excluded_from_metrics = status == "resolved" and cancellation_label in labels

        snap = await conn.fetchrow(
            "SELECT status, assignee_id, team_id FROM monitor.conversation_snapshot WHERE conversation_id=$1",
            conversation_id,
        )

        if snap is None:
            await conn.execute(
                "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, account_id, event_type, to_value, occurred_at) "
                "VALUES ($1,$2,$3,'created',$4,$5) "
                "ON CONFLICT (conversation_id) WHERE event_type = 'created' DO NOTHING",
                conversation_id, inbox_id, account_id, status, occurred_at,
            )
        else:
            if snap["status"] != status:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, account_id, event_type, from_value, to_value, occurred_at) "
                    "VALUES ($1,$2,$3,'status_changed',$4,$5,$6)",
                    conversation_id, inbox_id, account_id, snap["status"], status, occurred_at,
                )
            if snap["assignee_id"] != assignee_id:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, account_id, event_type, from_value, to_value, agent_id, occurred_at) "
                    "VALUES ($1,$2,$3,'assignee_changed',$4,$5,$6,$7)",
                    conversation_id, inbox_id, account_id, str(snap["assignee_id"]), str(assignee_id), assignee_id, occurred_at,
                )
            if snap["team_id"] != team_id:
                await conn.execute(
                    "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, account_id, event_type, from_value, to_value, occurred_at) "
                    "VALUES ($1,$2,$3,'team_changed',$4,$5,$6)",
                    conversation_id, inbox_id, account_id, str(snap["team_id"]), str(team_id), occurred_at,
                )

        # upsert do snapshot roda SEMPRE, criado ou não
        await conn.execute(
            """
            INSERT INTO monitor.conversation_snapshot
                (conversation_id, inbox_id, account_id, status, assignee_id, assignee_name, team_id,
                 company_name, contact_id, contact_name, priority, subject, labels, updated_at,
                 cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa,
                 excluded_from_metrics, sla_ignore_business_hours, company_override)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            ON CONFLICT (conversation_id) DO UPDATE SET
                inbox_id = $2, account_id = $3, status = $4, assignee_id = $5, assignee_name = $6, team_id = $7,
                company_name = $8, contact_id = $9, contact_name = $10, priority = $11,
                subject = $12, labels = $13, updated_at = $14,
                cd_cliente = $15, razao_social = $16, regime_tributario = $17, status_contrato = $18,
                demanda_avulsa = $19, excluded_from_metrics = $20, sla_ignore_business_hours = $21,
                company_override = $22
            """,
            conversation_id, inbox_id, account_id, status, assignee_id, assignee_name, team_id,
            company_name, contact_id, contact_name, priority, subject, labels, occurred_at,
            cd_cliente, razao_social, regime_tributario, status_contrato, demanda_avulsa,
            excluded_from_metrics, sla_ignore_business_hours, company_override,
        )


async def handle_message_event(data: dict, pool):
    conv = data.get("conversation") or {}
    conversation_id = conv.get("id")
    if not conversation_id:
        return
    account_id = extract_account_id(data)
    if account_id is None:
        print(f"[monitor_webhook] ignorando message em conversation_id={conversation_id} - account_id ausente no payload")
        return

    inbox_id = conv.get("inbox_id")
    message_type = data.get("message_type")
    sender = data.get("sender") or {}
    agent_id = sender.get("id") if message_type == "outgoing" else None
    occurred_at = to_ts(data.get("created_at"))
    is_private = bool(data.get("private", False))

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO monitor.conversation_events (conversation_id, inbox_id, account_id, event_type, to_value, agent_id, occurred_at, is_private) "
            "VALUES ($1,$2,$3,'message',$4,$5,$6,$7)",
            conversation_id, inbox_id, account_id, message_type, agent_id, occurred_at, is_private,
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
