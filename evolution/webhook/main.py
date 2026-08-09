from fastapi import FastAPI, Request
from datetime import datetime, timezone
from typing import Optional
import httpx
import os
import json
import asyncio


app = FastAPI()


CHATWOOT_URL = os.environ["CHATWOOT_URL"]
CHATWOOT_ACCOUNT_ID = os.environ["CHATWOOT_ACCOUNT_ID"]
CHATWOOT_TOKEN = os.environ["CHATWOOT_TOKEN"]
CHATWOOT_INBOX_IDENTIFIER = os.environ["CHATWOOT_INBOX_IDENTIFIER"]

EVO_URL = os.environ["EVO_URL"]
EVO_KEY = os.environ["EVO_KEY"]
    
WHATSAPP_TEST_MODE = os.environ.get("WHATSAPP_TEST_MODE", "false").lower() == "true"
WHATSAPP_TEST_WHITELIST = set(
    n.strip() for n in os.environ.get("WHATSAPP_TEST_WHITELIST", "").split(",") if n.strip()
)

CW_HEADERS = {"api_access_token": CHATWOOT_TOKEN, "Content-Type": "application/json"}
BLACKLIST_PATH = "/app/blacklist.txt"
STATE_PATH = "/app/data/conversation_state.json"
STATE_TTL_HOURS = 24
state_lock = asyncio.Lock()

GREETING_MESSAGE = (
    "Ola! Bem-vindo(a) ao atendimento da DJ Contabilidade.\n\n"
    "Para agilizar seu atendimento, escolha uma das opcoes abaixo respondendo com o numero correspondente:\n\n"
    "1 - Fiscal\n"
    "2 - Departamento Pessoal\n"
    "3 - Contabilidade\n"
    "4 - Financeiro\n"
    "5 - Outros assuntos\n\n"
    "Se preferir, descreva brevemente o que voce precisa e direcionaremos para o setor correto."
)

COMERCIAL_GREETING = (
    "Ola! Recebemos sua mensagem e em breve um de nossos consultores entrará em contato. Obrigado!"
)

CLOSING_MESSAGE = (
    "Seu atendimento foi encerrado. Caso precise de mais alguma coisa, "
    "basta nos enviar uma nova mensagem. Obrigado por contatar a DJ Contabilidade!"
)

TRIAGEM_TEAM_ID = 9
COMERCIAL_TEAM_ID = 7
ABERTO_LABEL = "aberto"

DEPARTMENTS = {
    "1": {"team_id": 2, "name": "Fiscal"},
    "2": {"team_id": 3, "name": "Departamento Pessoal"},
    "3": {"team_id": 5, "name": "Contabilidade"},
    "4": {"team_id": 4, "name": "Financeiro"},
    "5": {"team_id": 8, "name": "Outros"},
}

DEPARTMENT_KEYWORDS = {
    "1": ["nota fiscal", "nf-e", "nfe", "nf", "imposto", "icms", "iss", "sped", "apuracao", "das", "simples nacional"],
    "2": ["folha", "salario", "ponto", "ferias", "rescisao", "admissao", "demissao", "funcionario", "fgts", "esocial"],
    "3": ["balanco", "balancete", "demonstrativo", "dre", "contrato social", "alteracao contratual", "abertura de empresa"],
    "4": ["boleto", "pagamento", "cobranca", "fatura", "mensalidade", "debito", "financeiro"],
}


def load_instance_config() -> dict:
    instances = {}
    for name in os.environ.get("INSTANCES", "").split(","):
        name = name.strip()
        if not name:
            continue
        inbox_id = os.environ.get(f"INSTANCE_{name}_INBOX_ID", "")
        evo_instance = os.environ.get(f"INSTANCE_{name}_EVO_INSTANCE", "")
        flow = os.environ.get(f"INSTANCE_{name}_FLOW", "standard")
        if inbox_id and evo_instance:
            instances[name] = {
                "inbox_id": int(inbox_id),
                "evo_instance": evo_instance,
                "flow": flow,
            }
    print(f"[config] loaded instances={list(instances.keys())}")
    return instances


INSTANCES = load_instance_config()


def resolve_instance_by_name(name: str) -> Optional[dict]:
    return INSTANCES.get(name)


def resolve_instance_by_inbox(inbox_id: int) -> Optional[dict]:
    for cfg in INSTANCES.values():
        if cfg["inbox_id"] == inbox_id:
            return cfg
    return None


def load_blacklist() -> tuple[set, set]:
    emails, domains = set(), set()
    if not os.path.exists(BLACKLIST_PATH):
        return emails, domains
    with open(BLACKLIST_PATH) as f:
        for line in f:
            line = line.strip().lower()
            if not line or line.startswith("#"):
                continue
            if line.startswith("@"):
                domains.add(line)
            else:
                emails.add(line)
    return emails, domains


def is_blacklisted(email: str) -> bool:
    if not email:
        return False
    email = email.lower()
    blocked_emails, blocked_domains = load_blacklist()
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


def classify_message(text: str) -> Optional[str]:
    text = text.strip()
    if text in DEPARTMENTS:
        return text
    text_lower = text.lower()
    for dept_key, keywords in DEPARTMENT_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return dept_key
    return None


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


async def assign_team(conversation_id: str, team_id: int, client: httpx.AsyncClient):
    try:
        r = await client.post(
            f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/assignments",
            json={"team_id": team_id},
            headers=CW_HEADERS,
        )
        print(f"[assign_team] conv={conversation_id} team_id={team_id} status={r.status_code}")
    except httpx.HTTPError as e:
        print(f"[assign_team] error conv={conversation_id} err={e}")
        
async def add_label(conversation_id: int, label: str):
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/labels",
                headers=CW_HEADERS,
                json={"labels": [label]},
            )
            print(f"[add_label] conv={conversation_id} label={label} status={r.status_code}")
        except httpx.HTTPError as e:
            print(f"[add_label] error conv={conversation_id} err={e}")

async def delete_conversation(conversation_id: int):
    if not conversation_id:
        return
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/toggle_status",
                headers=CW_HEADERS,
                json={"status": "resolved"},
            )
            print(f"[resolve_conversation] conv={conversation_id} status={r.status_code}")
        except httpx.HTTPError as e:
            print(f"[resolve_conversation] error conv={conversation_id} err={e}")


async def set_label(conversation_id: str, label: str):
    if not conversation_id:
        return
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(
                f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/labels",
                headers=CW_HEADERS,
            )
            existing = r.json().get("payload", []) if r.status_code == 200 else []
            print(f"[set_label] conv={conversation_id} existing={existing} adding={label}")
            r2 = await client.post(
                f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/labels",
                json={"labels": list(set(existing + [label]))},
                headers=CW_HEADERS,
            )
            print(f"[set_label] response={r2.status_code} body={r2.text}")
        except httpx.HTTPError as e:
            print(f"[set_label] error conv={conversation_id} err={e}")


async def get_or_create_contact(phone: str, name: str, client: httpx.AsyncClient) -> tuple[dict, bool]:
    r = await client.get(
        f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/contacts/search",
        params={"q": phone},
        headers=CW_HEADERS,
    )
    if r.status_code != 200:
        print(f"[get_or_create_contact] search failed status={r.status_code}")
        return {}, False

    data = r.json().get("payload", [])
    if data:
        return data[0], False

    payload = {
        "inbox_id": 1,
        "name": name or phone,
        "phone_number": f"+{phone}",
        "identifier": phone,
    }
    r = await client.post(
        f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/contacts",
        json=payload,
        headers=CW_HEADERS,
    )
    if r.status_code not in (200, 201):
        print(f"[get_or_create_contact] create failed status={r.status_code}")
        return {}, False

    return r.json().get("payload", {}).get("contact", {}), True


async def get_or_create_conversation(contact_id: int, source_id: str, inbox_id: int, client: httpx.AsyncClient) -> Optional[tuple[int, bool]]:
    r = await client.get(
        f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/contacts/{contact_id}/conversations",
        headers=CW_HEADERS,
    )
    if r.status_code != 200:
        print(f"[get_or_create_conversation] list failed status={r.status_code}")
        return None

    for conv in r.json().get("payload", []):
        if conv.get("status") != "resolved" and conv.get("inbox_id") == inbox_id:
            return conv["id"], False

    r = await client.post(
        f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations",
        json={"source_id": source_id, "inbox_id": inbox_id, "contact_id": contact_id},
        headers=CW_HEADERS,
    )
    if r.status_code not in (200, 201):
        print(f"[get_or_create_conversation] create failed status={r.status_code}")
        return None

    return r.json()["id"], True


async def create_message(conversation_id: int, content: str, client: httpx.AsyncClient):
    r = await client.post(
        f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}/messages",
        json={"content": content, "message_type": "incoming"},
        headers=CW_HEADERS,
    )
    print(f"[create_message] conv={conversation_id} status={r.status_code}")


async def sync_state_with_chatwoot(conv_key: str, state: dict, client: httpx.AsyncClient) -> dict:
    if conv_key not in state:
        return state
    conversation_id = conv_key.split(":")[-1]
    try:
        r = await client.get(
            f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/conversations/{conversation_id}",
            headers=CW_HEADERS,
        )
        if r.status_code == 200 and r.json().get("status") == "resolved":
            print(f"[state] conv={conv_key} resolved in chatwoot, clearing state")
            del state[conv_key]
            await save_state(state)
    except httpx.HTTPError as e:
        print(f"[state] sync failed conv={conv_key} err={e}")
    return state


@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()
    if data.get("event") != "messages.upsert":
        return {"status": "ignored"}

    instance_name = data.get("instance", "")
    cfg = resolve_instance_by_name(instance_name)
    if not cfg:
        print(f"[whatsapp_webhook] unknown instance={instance_name}")
        return {"status": "ignored", "reason": "unknown_instance"}

    inbox_id = cfg["inbox_id"]
    evo_instance = cfg["evo_instance"]
    flow = cfg["flow"]

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
        contact, is_new = await get_or_create_contact(phone, push_name, client)
        contact_id = contact.get("id")
        if not contact_id:
            print(f"[whatsapp_webhook] failed to get/create contact phone={phone}")
            return {"status": "error", "reason": "contact_failed"}

        source_id = contact.get("contact_inboxes", [{}])[0].get("source_id", phone)
        result = await get_or_create_conversation(contact_id, source_id, inbox_id, client)
        if not result:
            print(f"[whatsapp_webhook] failed to get/create conversation contact_id={contact_id}")
            return {"status": "error", "reason": "conversation_failed"}
        conversation_id, conv_is_new = result

        await create_message(conversation_id, message, client)

        # is_new (get_or_create_contact) nao e mais usado para labels desde a migracao
        # para o esquema aberto/aguardando-cliente/em-andamento/cancelado.
        # conv_is_new (conversa nova) e o que define a label "aberto".
        if conv_is_new:
            await set_label(str(conversation_id), ABERTO_LABEL)

        if flow == "comercial":
            print(f"[whatsapp_webhook] conv={conversation_id} flow=comercial")
            await send_whatsapp_message(phone, COMERCIAL_GREETING, evo_instance, client)
            await assign_team(str(conversation_id), COMERCIAL_TEAM_ID, client)
            return {"status": "ok", "conversation_id": conversation_id}

        conv_key = f"{inbox_id}:{conversation_id}"
        state = await load_state()
        state = await sync_state_with_chatwoot(conv_key, state, client)
        conv_state = state.get(conv_key)

        if conv_state and is_state_expired(conv_state):
            print(f"[whatsapp_webhook] conv={conv_key} state expired, resetting")
            del state[conv_key]
            await save_state(state)
            conv_state = None

        if conv_state is None:
            print(f"[whatsapp_webhook] conv={conv_key} sending greeting")
            await send_whatsapp_message(phone, GREETING_MESSAGE, evo_instance, client)
            state[conv_key] = {
                "status": "awaiting_department",
                "phone": phone,
                "created_at": datetime.now(tz=timezone.utc).isoformat(),
            }
            await save_state(state)

        elif conv_state.get("status") == "awaiting_department":
            dept_key = classify_message(message)
            if dept_key:
                dept = DEPARTMENTS[dept_key]
                print(f"[whatsapp_webhook] conv={conv_key} classified dept={dept_key} name={dept['name']}")
                await assign_team(str(conversation_id), dept["team_id"], client)
                transfer_msg = (
                    f"Sua solicitacao foi direcionada para o time de *{dept['name']}*. "
                    f"Em breve um de nossos especialistas entrara em contato."
                )
            else:
                print(f"[whatsapp_webhook] conv={conv_key} no match, triagem")
                await assign_team(str(conversation_id), TRIAGEM_TEAM_ID, client)
                transfer_msg = (
                    "Sua solicitacao foi recebida e sera direcionada para o setor responsavel. "
                    "Em breve um de nossos atendentes entrara em contato."
                )

            await send_whatsapp_message(phone, transfer_msg, evo_instance, client)
            state[conv_key]["status"] = "classified"
            await save_state(state)

    return {"status": "ok", "conversation_id": conversation_id}


@app.post("/webhook/chatwoot")
async def chatwoot_webhook(request: Request):
    data = await request.json()
    print(f"[chatwoot-webhook] RAW event={data.get('event')} message_type={data.get('message_type')} sender={data.get('sender')}")
    if data.get("event") != "message_created":
        return {"status": "ignored"}
    if data.get("message_type") != "outgoing":
        return {"status": "ignored"}
    if data.get("private"):
        return {"status": "ignored"}

    conversation = data.get("conversation", {})
    contact = conversation.get("meta", {}).get("sender", {})
    phone = contact.get("identifier") or contact.get("phone_number", "").replace("+", "")
    content = data.get("content", "")
    if not phone or not content:
        return {"status": "ignored"}

    inbox_id = conversation.get("inbox_id")
    cfg = resolve_instance_by_inbox(inbox_id)
    if not cfg:
        print(f"[chatwoot-webhook] unknown inbox_id={inbox_id}")
        return {"status": "ignored", "reason": "unknown_inbox"}

    agent_name = data.get("sender", {}).get("name", "")
    if agent_name:
        content = f"*{agent_name}:*\n{content}"

    async with httpx.AsyncClient() as client:
        await send_whatsapp_message(phone, content, cfg["evo_instance"], client)

    return {"status": "sent"}


@app.post("/webhook/chatwoot-resolved")
async def chatwoot_resolved_webhook(request: Request):
    data = await request.json()
    status = data.get("status") or data.get("conversation", {}).get("status")
    print(f"[resolved-webhook] event={data.get('event')} channel={data.get('channel')} status={status}")

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

    cfg = resolve_instance_by_inbox(inbox_id)
    if not cfg:
        print(f"[resolved-webhook] unknown inbox_id={inbox_id}")
        return {"status": "ignored", "reason": "unknown_inbox"}

    conv_key = f"{inbox_id}:{conversation_id}"
    state = await load_state()
    if conv_key in state:
        del state[conv_key]
        await save_state(state)
        print(f"[resolved-webhook] removed conv={conv_key} from state")

    if phone:
        async with httpx.AsyncClient() as client:
            await send_whatsapp_message(phone, CLOSING_MESSAGE, cfg["evo_instance"], client)

    return {"status": "ok"}


@app.post("/webhook/chatwoot-email")
async def chatwoot_email_webhook(request: Request):
    data = await request.json()
    print(json.dumps(data, indent=2, default=str))
    print(f"[email-webhook] RAW event={data.get('event')} keys={list(data.keys())}")

    if data.get("event") != "conversation_created":
        print(f"[email-webhook] IGNORED event={data.get('event')}")
        return {"status": "ignored"}

    conversation_id = data.get("id")
    contact = data.get("meta", {}).get("sender", {})
    email = contact.get("email", "")
    conv_created_raw = data.get("created_at")

    print(f"[email-webhook] conversation_id={conversation_id} email={email}")

    if not email:
        print("[email-webhook] no email found in contact")
        return {"status": "ignored"}

    if is_blacklisted(email):
        await add_label(conversation_id, "cancelado")
        await delete_conversation(conversation_id)
        return {"status": "deleted", "reason": "blacklisted"}

    contact_id = contact.get("id")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{CHATWOOT_URL}/api/v1/accounts/{CHATWOOT_ACCOUNT_ID}/contacts/{contact_id}",
            headers=CW_HEADERS,
        )
        if r.status_code != 200:
            print(f"[email-webhook] failed to fetch contact status={r.status_code}")
            return {"status": "error", "reason": "contact_fetch_failed"}

        raw = r.json()
        
    contact_data = raw.get("payload", {})
    if "contact" in contact_data:
        contact_data = contact_data["contact"]

    custom_attrs = contact_data.get("custom_attributes", {})
    # slug renomeado de cliente_cadastrado para conversa_por_email (mais didatico)
    is_registered = bool(custom_attrs.get("conversa_por_email"))
    print(f"[email-webhook] email={email} is_registered={is_registered}")

    if not is_registered:
        await add_label(conversation_id, "cancelado")
        await delete_conversation(conversation_id)
        return {"status": "deleted", "reason": "not_registered"}

    # label cliente-cadastrado removida: agora so o custom_attribute controla o registro
    await add_label(conversation_id, ABERTO_LABEL)
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "ok"}
