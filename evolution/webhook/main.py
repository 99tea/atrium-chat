from fastapi import FastAPI, Request
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo
import httpx
import os
import json
import asyncio
import yaml
import glob


app = FastAPI()

EVO_URL = os.environ["EVO_URL"]
EVO_KEY = os.environ["EVO_KEY"]

WHATSAPP_TEST_MODE = os.environ.get("WHATSAPP_TEST_MODE", "false").lower() == "true"
WHATSAPP_TEST_WHITELIST = set(
    n.strip() for n in os.environ.get("WHATSAPP_TEST_WHITELIST", "").split(",") if n.strip()
)

STATE_PATH = "/app/data/conversation_state.json"
STATE_TTL_HOURS = 24
state_lock = asyncio.Lock()

ABERTO_LABEL = "aberto"
TENANTS_CONFIG_DIR = "/app/config/tenants"
DEFAULT_TIMEZONE = "America/Sao_Paulo"


@dataclass
class TenantConfig:
    tenant_id: str
    chatwoot_url: str
    chatwoot_account_id: str
    chatwoot_token: str
    blacklist_path: str

    @property
    def headers(self) -> dict:
        return {"api_access_token": self.chatwoot_token, "Content-Type": "application/json"}


@dataclass
class InboxConfig:
    inbox_id: int
    channel: str
    tenant_id: str
    flow: str
    evo_instance: Optional[str] = None
    closing_message: Optional[str] = None
    routing_rules: list = field(default_factory=list)
    menu: Optional[dict] = None
    direct: Optional[dict] = None


def _resolve_env(var_name: str, tenant_id: str, field_label: str) -> str:
    value = os.environ.get(var_name)
    if not value:
        raise RuntimeError(
            f"[tenant_config] tenant={tenant_id} campo={field_label} "
            f"env_var={var_name} nao definida ou vazia"
        )
    return value


def load_tenant_yaml(path: str) -> tuple[TenantConfig, list[InboxConfig]]:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    tenant_id = os.path.splitext(os.path.basename(path))[0]
    chatwoot = raw["chatwoot"]

    tenant = TenantConfig(
        tenant_id=tenant_id,
        chatwoot_url=_resolve_env(chatwoot["url_env"], tenant_id, "chatwoot.url"),
        chatwoot_account_id=str(chatwoot["account_id"]),
        chatwoot_token=_resolve_env(chatwoot["token_env"], tenant_id, "chatwoot.token"),
        blacklist_path=raw.get("blacklist_path", "/app/blacklist.txt"),
    )

    inboxes = []
    for inbox_raw in raw.get("inboxes", []):
        inboxes.append(InboxConfig(
            inbox_id=int(inbox_raw["inbox_id"]),
            channel=inbox_raw["channel"],
            tenant_id=tenant_id,
            flow=inbox_raw["flow"],
            evo_instance=inbox_raw.get("evo_instance"),
            closing_message=inbox_raw.get("closing_message"),
            routing_rules=inbox_raw.get("routing_rules", []),
            menu=inbox_raw.get("menu"),
            direct=inbox_raw.get("direct"),
        ))

    return tenant, inboxes


def load_all_config(config_dir: str) -> tuple[dict, dict, dict]:
    tenants = {}
    inboxes_by_id = {}
    inboxes_by_evo_instance = {}

    yaml_files = sorted(glob.glob(os.path.join(config_dir, "*.yaml")))
    if not yaml_files:
        print(f"[tenant_config] WARNING nenhum arquivo .yaml encontrado em {config_dir}")

    for path in yaml_files:
        try:
            tenant, inboxes = load_tenant_yaml(path)
        except (KeyError, RuntimeError, yaml.YAMLError) as e:
            print(f"[tenant_config] ERRO ao carregar {path}: {e}")
            continue

        tenants[tenant.tenant_id] = tenant
        for inbox in inboxes:
            inboxes_by_id[inbox.inbox_id] = inbox
            if inbox.evo_instance:
                inboxes_by_evo_instance[inbox.evo_instance] = inbox

        print(f"[tenant_config] tenant={tenant.tenant_id} carregado de {path} "
              f"inboxes={[i.inbox_id for i in inboxes]}")

    return tenants, inboxes_by_id, inboxes_by_evo_instance


TENANTS, INBOXES_BY_ID, INBOXES_BY_EVO_INSTANCE = load_all_config(TENANTS_CONFIG_DIR)


def resolve_tenant(tenant_id: str) -> Optional[TenantConfig]:
    tenant = TENANTS.get(tenant_id)
    if not tenant:
        print(f"[resolve_tenant] WARNING unknown tenant_id={tenant_id}")
    return tenant


def resolve_instance_by_name(evo_instance: str) -> Optional[InboxConfig]:
    return INBOXES_BY_EVO_INSTANCE.get(evo_instance)


def resolve_instance_by_inbox(inbox_id: int) -> Optional[InboxConfig]:
    return INBOXES_BY_ID.get(inbox_id)


# ---------------------------------------------------------------------------
# Routing rules
# ---------------------------------------------------------------------------

def _check_business_hours(rule: dict, now_utc: datetime) -> bool:
    tz = ZoneInfo(rule.get("timezone", DEFAULT_TIMEZONE))
    local_now = now_utc.astimezone(tz)
    weekday = local_now.weekday()
    day_key = {0: "mon_fri", 1: "mon_fri", 2: "mon_fri", 3: "mon_fri", 4: "mon_fri", 5: "sat", 6: "sun"}[weekday]
    range_str = rule.get("hours", {}).get(day_key)
    if not range_str:
        return False
    start_str, end_str = range_str.split("-")
    start = datetime.strptime(start_str.strip(), "%H:%M").time()
    end = datetime.strptime(end_str.strip(), "%H:%M").time()
    return start <= local_now.time() <= end


def evaluate_routing_rules(rules: list, phone: str) -> Optional[dict]:
    now_utc = datetime.now(tz=timezone.utc)
    for rule in rules:
        rule_type = rule.get("type")

        if rule_type == "business_hours":
            if not _check_business_hours(rule, now_utc):
                print(f"[routing_rules] business_hours matched (fora do horario) phone={phone}")
                return {"team_id": rule["outside_hours_team_id"], "message": rule["outside_hours_message"]}

        elif rule_type == "priority_contact":
            if phone in set(rule.get("contacts", [])):
                print(f"[routing_rules] priority_contact matched phone={phone}")
                return {"team_id": rule["team_id"], "message": rule.get("message", "")}

        else:
            print(f"[routing_rules] WARNING tipo desconhecido={rule_type}")

    return None


def classify_message(text: str, departments: dict) -> Optional[str]:
    text = text.strip()
    if text in departments:
        return text
    text_lower = text.lower()
    for dept_key, dept in departments.items():
        if any(kw in text_lower for kw in dept.get("keywords", [])):
            return dept_key
    return None


def load_blacklist(path: str) -> tuple[set, set]:
    emails, domains = set(), set()
    if not os.path.exists(path):
        return emails, domains
    with open(path) as f:
        for line in f:
            line = line.strip().lower()
            if not line or line.startswith("#"):
                continue
            if line.startswith("@"):
                domains.add(line)
            else:
                emails.add(line)
    return emails, domains


def is_blacklisted(email: str, path: str) -> bool:
    if not email:
        return False
    email = email.lower()
    blocked_emails, blocked_domains = load_blacklist(path)
    if email in blocked_emails:
        return True
    domain = f"@{email.split('@')[-1]}" if "@" in email else ""
    return domain in blocked_domains


def is_state_expired(conv_state: dict) -> bool:
    created_at = conv_state.get("created_at")
    if not created_at:
        return False
    try:
        created = datetime.fromisoformat(created_at)
        return (datetime.now(tz=timezone.utc) - created).total_seconds() > STATE_TTL_HOURS * 3600
    except (ValueError, TypeError):
        return False


async def load_state() -> dict:
    async with state_lock:
        if not os.path.exists(STATE_PATH):
            return {}
        try:
            with open(STATE_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"[state] failed to load err={e}")
            return {}


async def save_state(state: dict):
    async with state_lock:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        with open(STATE_PATH, "w") as f:
            json.dump(state, f)


async def send_whatsapp_message(phone: str, text: str, evo_instance: str, client: httpx.AsyncClient):
    try:
        r = await client.post(
            f"{EVO_URL}/message/sendText/{evo_instance}",
            headers={"apikey": EVO_KEY, "Content-Type": "application/json"},
            json={"number": phone, "text": text},
        )
        print(f"[send_whatsapp_message] phone={phone} instance={evo_instance} status={r.status_code}")
    except httpx.HTTPError as e:
        print(f"[send_whatsapp_message] error phone={phone} instance={evo_instance} err={e}")


async def assign_team(conversation_id: str, team_id: int, tenant: TenantConfig, client: httpx.AsyncClient):
    try:
        r = await client.post(
            f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/assignments",
            json={"team_id": team_id},
            headers=tenant.headers,
        )
        print(f"[assign_team] conv={conversation_id} team_id={team_id} status={r.status_code}")
    except httpx.HTTPError as e:
        print(f"[assign_team] error conv={conversation_id} err={e}")


async def add_label(conversation_id: int, label: str, tenant: TenantConfig):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/labels",
                headers=tenant.headers,
                json={"labels": [label]},
            )
            print(f"[add_label] conv={conversation_id} label={label} status={r.status_code}")
        except httpx.HTTPError as e:
            print(f"[add_label] error conv={conversation_id} err={e}")


async def delete_conversation(conversation_id: int, tenant: TenantConfig):
    if not conversation_id:
        return
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/toggle_status",
                headers=tenant.headers,
                json={"status": "resolved"},
            )
            print(f"[resolve_conversation] conv={conversation_id} status={r.status_code}")
        except httpx.HTTPError as e:
            print(f"[resolve_conversation] error conv={conversation_id} err={e}")


async def set_label(conversation_id: str, label: str, tenant: TenantConfig):
    if not conversation_id:
        return
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/labels",
                headers=tenant.headers,
            )
            existing = r.json().get("payload", []) if r.status_code == 200 else []
            r2 = await client.post(
                f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/labels",
                json={"labels": list(set(existing + [label]))},
                headers=tenant.headers,
            )
            print(f"[set_label] conv={conversation_id} label={label} status={r2.status_code}")
        except httpx.HTTPError as e:
            print(f"[set_label] error conv={conversation_id} err={e}")


async def get_or_create_contact(phone: str, name: str, inbox_id: int, tenant: TenantConfig, client: httpx.AsyncClient) -> tuple[dict, bool]:
    r = await client.get(
        f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/contacts/search",
        params={"q": phone},
        headers=tenant.headers,
    )
    if r.status_code != 200:
        print(f"[get_or_create_contact] search failed status={r.status_code}")
        return {}, False

    data = r.json().get("payload", [])
    if data:
        return data[0], False

    payload = {
        "inbox_id": inbox_id,
        "name": name or phone,
        "phone_number": f"+{phone}",
        "identifier": phone,
    }
    r = await client.post(
        f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/contacts",
        json=payload,
        headers=tenant.headers,
    )
    if r.status_code not in (200, 201):
        print(f"[get_or_create_contact] create failed status={r.status_code}")
        return {}, False

    return r.json().get("payload", {}).get("contact", {}), True


async def get_or_create_conversation(contact_id: int, source_id: str, inbox_id: int, tenant: TenantConfig, client: httpx.AsyncClient) -> Optional[tuple[int, bool]]:
    r = await client.get(
        f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/contacts/{contact_id}/conversations",
        headers=tenant.headers,
    )
    if r.status_code != 200:
        print(f"[get_or_create_conversation] list failed status={r.status_code}")
        return None

    for conv in r.json().get("payload", []):
        if conv.get("status") != "resolved" and conv.get("inbox_id") == inbox_id:
            return conv["id"], False

    r = await client.post(
        f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations",
        json={"source_id": source_id, "inbox_id": inbox_id, "contact_id": contact_id},
        headers=tenant.headers,
    )
    if r.status_code not in (200, 201):
        print(f"[get_or_create_conversation] create failed status={r.status_code}")
        return None

    return r.json()["id"], True


async def create_message(conversation_id: int, content: str, tenant: TenantConfig, client: httpx.AsyncClient):
    r = await client.post(
        f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}/messages",
        json={"content": content, "message_type": "incoming"},
        headers=tenant.headers,
    )
    print(f"[create_message] conv={conversation_id} status={r.status_code}")


async def sync_state_with_chatwoot(conv_key: str, state: dict, tenant: TenantConfig, client: httpx.AsyncClient) -> dict:
    if conv_key not in state:
        return state
    conversation_id = conv_key.split(":")[-1]
    try:
        r = await client.get(
            f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/conversations/{conversation_id}",
            headers=tenant.headers,
        )
        if r.status_code == 200 and r.json().get("status") == "resolved":
            print(f"[state] conv={conv_key} resolved in chatwoot, clearing state")
            del state[conv_key]
            await save_state(state)
    except httpx.HTTPError as e:
        print(f"[state] sync failed conv={conv_key} err={e}")
    return state


# ---------------------------------------------------------------------------
# Flow handlers - cada um cuida do "primeiro contato" de uma conversa nova
# ---------------------------------------------------------------------------

async def handle_menu_flow_first_message(inbox: InboxConfig, phone: str, evo_instance: str, client: httpx.AsyncClient) -> dict:
    await send_whatsapp_message(phone, inbox.menu["greeting"], evo_instance, client)
    return {"status": "awaiting_department"}


async def handle_menu_flow_classification(inbox: InboxConfig, message: str, conversation_id: int, phone: str, tenant: TenantConfig, evo_instance: str, client: httpx.AsyncClient) -> dict:
    dept_key = classify_message(message, inbox.menu["departments"])
    if dept_key:
        dept = inbox.menu["departments"][dept_key]
        await assign_team(str(conversation_id), dept["team_id"], tenant, client)
        transfer_msg = (
            f"Sua solicitacao foi direcionada para o time de *{dept['name']}*. "
            f"Em breve um de nossos especialistas entrara em contato."
        )
    else:
        await assign_team(str(conversation_id), inbox.menu["fallback_team_id"], tenant, client)
        transfer_msg = inbox.menu["fallback_message"]

    await send_whatsapp_message(phone, transfer_msg, evo_instance, client)
    return {"status": "classified"}


async def handle_keyword_only_flow_first_message(inbox: InboxConfig, message: str, conversation_id: int, phone: str, tenant: TenantConfig, evo_instance: str, client: httpx.AsyncClient) -> dict:
    dept_key = classify_message(message, inbox.menu["departments"])
    if dept_key:
        dept = inbox.menu["departments"][dept_key]
        await assign_team(str(conversation_id), dept["team_id"], tenant, client)
        reply = (
            f"Sua solicitacao foi direcionada para o time de *{dept['name']}*. "
            f"Em breve um de nossos especialistas entrara em contato."
        )
    else:
        await assign_team(str(conversation_id), inbox.menu["fallback_team_id"], tenant, client)
        reply = inbox.menu["fallback_message"]

    await send_whatsapp_message(phone, reply, evo_instance, client)
    return {"status": "handled"}


async def handle_direct_flow_first_message(inbox: InboxConfig, conversation_id: int, phone: str, tenant: TenantConfig, evo_instance: str, client: httpx.AsyncClient) -> dict:
    await send_whatsapp_message(phone, inbox.direct["greeting"], evo_instance, client)
    await assign_team(str(conversation_id), inbox.direct["team_id"], tenant, client)
    return {"status": "handled"}


@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()
    if data.get("event") != "messages.upsert":
        return {"status": "ignored"}

    instance_name = data.get("instance", "")
    inbox = resolve_instance_by_name(instance_name)
    if not inbox:
        print(f"[whatsapp_webhook] unknown instance={instance_name}")
        return {"status": "ignored", "reason": "unknown_instance"}

    tenant = resolve_tenant(inbox.tenant_id)
    if not tenant:
        return {"status": "error", "reason": "unknown_tenant"}

    msg_data = data.get("data", {})
    key = msg_data.get("key", {})
    if key.get("fromMe"):
        return {"status": "ignored"}
    remote_jid = key.get("remoteJid", "")
    if "@g.us" in remote_jid:
        return {"status": "ignored"}

    phone = remote_jid.replace("@s.whatsapp.net", "")

    if WHATSAPP_TEST_MODE and phone not in WHATSAPP_TEST_WHITELIST:
        print(f"[whatsapp_webhook] ignored - phone {phone} not in whitelist")
        return {"status": "ignored", "reason": "not_in_whitelist"}

    message = msg_data.get("message", {}).get("conversation") or \
        msg_data.get("message", {}).get("extendedTextMessage", {}).get("text", "")
    push_name = msg_data.get("pushName", phone)
    if not message:
        return {"status": "ignored"}

    async with httpx.AsyncClient() as client:
        contact, _ = await get_or_create_contact(phone, push_name, inbox.inbox_id, tenant, client)
        contact_id = contact.get("id")
        if not contact_id:
            print(f"[whatsapp_webhook] failed to get/create contact phone={phone}")
            return {"status": "error", "reason": "contact_failed"}

        source_id = contact.get("contact_inboxes", [{}])[0].get("source_id", phone)
        result = await get_or_create_conversation(contact_id, source_id, inbox.inbox_id, tenant, client)
        if not result:
            print(f"[whatsapp_webhook] failed to get/create conversation contact_id={contact_id}")
            return {"status": "error", "reason": "conversation_failed"}
        conversation_id, conv_is_new = result

        await create_message(conversation_id, message, tenant, client)

        if conv_is_new:
            await set_label(str(conversation_id), ABERTO_LABEL, tenant)

        conv_key = f"{inbox.inbox_id}:{conversation_id}"
        state = await load_state()
        state = await sync_state_with_chatwoot(conv_key, state, tenant, client)
        conv_state = state.get(conv_key)

        if conv_state and is_state_expired(conv_state):
            print(f"[whatsapp_webhook] conv={conv_key} state expired, resetting")
            del state[conv_key]
            await save_state(state)
            conv_state = None

        if conv_state is None:
            routing_match = evaluate_routing_rules(inbox.routing_rules, phone)
            if routing_match:
                await send_whatsapp_message(phone, routing_match["message"], inbox.evo_instance, client)
                await assign_team(str(conversation_id), routing_match["team_id"], tenant, client)
                new_state = {"status": "handled"}

            elif inbox.flow == "menu":
                new_state = await handle_menu_flow_first_message(inbox, phone, inbox.evo_instance, client)

            elif inbox.flow == "keyword_only":
                new_state = await handle_keyword_only_flow_first_message(
                    inbox, message, conversation_id, phone, tenant, inbox.evo_instance, client
                )

            elif inbox.flow == "direct":
                new_state = await handle_direct_flow_first_message(
                    inbox, conversation_id, phone, tenant, inbox.evo_instance, client
                )

            else:  # flow == "none"
                new_state = {"status": "handled"}

            new_state["phone"] = phone
            new_state["created_at"] = datetime.now(tz=timezone.utc).isoformat()
            state[conv_key] = new_state
            await save_state(state)

        elif conv_state.get("status") == "awaiting_department" and inbox.flow == "menu":
            result_state = await handle_menu_flow_classification(
                inbox, message, conversation_id, phone, tenant, inbox.evo_instance, client
            )
            state[conv_key]["status"] = result_state["status"]
            await save_state(state)

    return {"status": "ok", "conversation_id": conversation_id}


@app.post("/webhook/chatwoot")
async def chatwoot_webhook(request: Request):
    data = await request.json()
    if data.get("event") != "message_created":
        return {"status": "ignored"}
    if data.get("message_type") != "outgoing":
        return {"status": "ignored"}
    if data.get("private"):
        return {"status": "ignored"}

    conversation = data.get("conversation", {})
    contact = conversation.get("meta", {}).get("sender", {})
    phone = contact.get("identifier") or (contact.get("phone_number") or "").replace("+", "")
    content = data.get("content", "")
    if not phone or not content:
        return {"status": "ignored"}

    inbox_id = conversation.get("inbox_id")
    inbox = resolve_instance_by_inbox(inbox_id)
    if not inbox or not inbox.evo_instance:
        print(f"[chatwoot-webhook] unknown or non-whatsapp inbox_id={inbox_id}")
        return {"status": "ignored", "reason": "unknown_inbox"}

    agent_name = data.get("sender", {}).get("name", "")
    if agent_name:
        content = f"*{agent_name}:*\n{content}"

    async with httpx.AsyncClient() as client:
        await send_whatsapp_message(phone, content, inbox.evo_instance, client)

    return {"status": "sent"}


@app.post("/webhook/chatwoot-resolved")
async def chatwoot_resolved_webhook(request: Request):
    data = await request.json()
    status = data.get("status") or data.get("conversation", {}).get("status")

    if data.get("event") != "conversation_status_changed":
        return {"status": "ignored"}
    if status != "resolved":
        return {"status": "ignored"}
    if data.get("channel") != "Channel::Api":
        return {"status": "ignored"}

    conversation_id = str(data.get("id"))
    inbox_id = data.get("inbox_id")
    contact = data.get("meta", {}).get("sender", {})
    phone = contact.get("identifier") or contact.get("phone_number", "").replace("+", "")

    inbox = resolve_instance_by_inbox(inbox_id)
    if not inbox:
        print(f"[resolved-webhook] unknown inbox_id={inbox_id}")
        return {"status": "ignored", "reason": "unknown_inbox"}

    conv_key = f"{inbox_id}:{conversation_id}"
    state = await load_state()
    if conv_key in state:
        del state[conv_key]
        await save_state(state)
        print(f"[resolved-webhook] removed conv={conv_key} from state")

    if phone and inbox.evo_instance and inbox.closing_message:
        async with httpx.AsyncClient() as client:
            await send_whatsapp_message(phone, inbox.closing_message, inbox.evo_instance, client)

    return {"status": "ok"}


@app.post("/webhook/chatwoot-email")
async def chatwoot_email_webhook(request: Request):
    data = await request.json()
    if data.get("event") != "conversation_created":
        return {"status": "ignored"}

    conversation_id = data.get("id")
    inbox_id = data.get("inbox_id")
    contact = data.get("meta", {}).get("sender", {})
    email = contact.get("email", "")

    print(f"[email-webhook] conversation_id={conversation_id} email={email} inbox_id={inbox_id}")

    if not email:
        print("[email-webhook] no email found in contact")
        return {"status": "ignored"}

    inbox = resolve_instance_by_inbox(inbox_id)
    if not inbox:
        print(f"[email-webhook] inbox_id={inbox_id} nao mapeado em nenhum tenant - ignorando")
        return {"status": "ignored", "reason": "unmapped_inbox"}

    tenant = resolve_tenant(inbox.tenant_id)
    if not tenant:
        return {"status": "error", "reason": "unknown_tenant"}

    if is_blacklisted(email, tenant.blacklist_path):
        await add_label(conversation_id, "cancelado", tenant)
        await delete_conversation(conversation_id, tenant)
        return {"status": "deleted", "reason": "blacklisted"}

    contact_id = contact.get("id")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{tenant.chatwoot_url}/api/v1/accounts/{tenant.chatwoot_account_id}/contacts/{contact_id}",
            headers=tenant.headers,
        )
        if r.status_code != 200:
            print(f"[email-webhook] failed to fetch contact status={r.status_code}")
            return {"status": "error", "reason": "contact_fetch_failed"}
        raw = r.json()

    contact_data = raw.get("payload", {})
    if "contact" in contact_data:
        contact_data = contact_data["contact"]

    custom_attrs = contact_data.get("custom_attributes", {})
    is_registered = bool(custom_attrs.get("conversa_por_email"))
    print(f"[email-webhook] email={email} is_registered={is_registered}")

    if not is_registered:
        await add_label(conversation_id, "cancelado", tenant)
        await delete_conversation(conversation_id, tenant)
        return {"status": "deleted", "reason": "not_registered"}

    await add_label(conversation_id, ABERTO_LABEL, tenant)
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}
