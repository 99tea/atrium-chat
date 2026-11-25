
# 🏛️ Atrium Chat

> Multi-tenant customer service platform (Chatwoot whitelabel) with a FastAPI monitoring dashboard and WhatsApp bridge via Evolution API.

![FastAPI](https://img.shields.io/badge/FastAPI-framework-009688.svg)
![Chatwoot](https://img.shields.io/badge/chatwoot-whitelabel-1F93FF.svg)
![WhatsApp](https://img.shields.io/badge/whatsapp-evolution%20api-25D366.svg)
![Multi-Tenant](https://img.shields.io/badge/architecture-multi--tenant-purple.svg)

## 📌 About

**Atrium Chat** is a complete, multi-tenant customer service platform built on top of **Chatwoot** (whitelabeled) and extended with a **FastAPI monitoring dashboard** and a **WhatsApp bridge via Evolution API**. It gives support managers and administrators real-time visibility into operations — SLA compliance, CSAT scores, agent productivity, and client management — while keeping data fully isolated per tenant.

The stack is designed as a **containerized infrastructure** with a reverse proxy (Nginx) handling multi-tenant routing, a dedicated monitoring service, and a WhatsApp integration layer.

## 🚀 Key Features

- 🏢 **Multi-Tenant Architecture** — Full data isolation per client/organization across the monitoring dashboard and webhooks.
- 📊 **Real-Time Monitoring Dashboard** — SLA metrics, CSAT scores, agent productivity, and client management, all live.
- 💬 **WhatsApp Integration** — Bridge via Evolution API with multi-tenant webhook handling.
- 🎨 **Whitelabel Chatwoot** — Custom branding assets for a fully branded experience.
- 🌐 **Nginx Reverse Proxy** — Multi-tenant routing configuration out of the box.
- 💾 **Backup Automation** — Scripts for scheduled backups.
- 🔐 **Tenant-Scoped Webhooks** — Evolution API webhooks routed and processed per tenant.

## 🧱 Project Structure

```
atrium-chat/
├── backup/scripts/          # Backup automation scripts
├── branding/                # Whitelabel assets and customization
├── evolution/webhook/       # WhatsApp bridge (Evolution API webhooks)
├── monitor/                 # FastAPI monitoring dashboard
├── nginx/conf.d/            # Nginx reverse proxy configs (multi-tenant)
└── .gitignore
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Core chat platform** | Chatwoot (whitelabeled) |
| **Monitoring dashboard** | FastAPI (Python) |
| **WhatsApp bridge** | Evolution API |
| **Reverse proxy** | Nginx |
| **Architecture** | Multi-tenant, containerized |

## 📦 Prerequisites

- Docker and Docker Compose
- A running **Chatwoot** instance (or credentials to connect one)
- An **Evolution API** instance for WhatsApp integration
- A domain and TLS certificates (for Nginx)
- Python 3.x (if running the monitor outside containers)

> ⚠️ **Note**: The `docker-compose.yml` is **not tracked** in this repository (removed from version control). You will need to provide or recreate your own orchestration file — see the "Setup" section below.

## ⚙️ Configuration

1. **Clone the repository:**

```bash
git clone https://github.com/99tea/atrium-chat.git
cd atrium-chat
```

2. **Set up environment variables** — create a `.env` file with the required secrets:
   - Chatwoot API URL and token
   - Evolution API URL and key
   - Database credentials
   - Tenant configuration

3. **Configure Nginx** — review and adjust `nginx/conf.d/` for your domains and tenant routing.

4. **Customize branding** — replace assets in `branding/` with your own.

## 🚀 Deployment

Since `docker-compose.yml` is not included, bring up the stack using your own orchestration, or run services individually:

```bash
# Example: run the monitoring dashboard
cd monitor
pip install -r requirements.txt   # if present
uvicorn main:app --host 0.0.0.0 --port 8000
```

For the full stack, define a `docker-compose.yml` that includes:
- `monitor` (FastAPI service)
- `evolution/webhook` (WhatsApp bridge)
- `nginx` (reverse proxy)
- Chatwoot instance (external or included)

Then:

```bash
docker compose up -d
```

## 📊 Monitoring Dashboard

The `monitor/` service (FastAPI) exposes real-time metrics:

- **SLA compliance** — ticket response and resolution times
- **CSAT** — customer satisfaction scores
- **Agent productivity** — per-agent performance and workload
- **Client management** — per-tenant client overview

Access the dashboard via the Nginx-proxied endpoint or directly on the FastAPI port.

## 💬 WhatsApp Bridge (Evolution API)

The `evolution/webhook/` service receives webhooks from **Evolution API** and routes them per tenant to Chatwoot, enabling WhatsApp-based customer conversations within the multi-tenant setup.

## 💾 Backups

Backup scripts live in `backup/scripts/`. Schedule them via cron or your orchestrator:

```bash
# Example (adjust to your script name)
./backup/scripts/backup.sh
```

## 📝 Notes

- The repository does **not include a LICENSE file** — add one if you plan to distribute.
- `docker-compose.yml` was intentionally removed from tracking; keep your orchestration file out of version control if it contains secrets.
- Verify tenant isolation in webhook routing and API queries — this is critical in a multi-tenant deployment.
- The original description is in **Portuguese**; consider maintaining a `README.pt-BR.md` alongside this English version.

## 👤 Author

Developed by **99tea**
