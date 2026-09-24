# Atrium Chat & Monitor

Plataforma de atendimento ao cliente construída sobre o **Chatwoot** (whitelabel), com um **dashboard de monitoramento próprio** (FastAPI + Tailwind) e integração de **WhatsApp via Evolution API**.

## Stack

- **Chatwoot** — helpdesk/ticketing (self-hosted)
- **Evolution API v2** — gateway WhatsApp
- **FastAPI** (`evolution/webhook`) — bridge de webhooks WhatsApp ↔ Chatwoot, roteamento por departamento, horário comercial, multi-tenant via YAML
- **Monitor** (`monitor/`) — dashboard interno em FastAPI + Tailwind + Chart.js, consumindo eventos do Chatwoot via webhook e persistindo em PostgreSQL (schema `monitor`)
- **PostgreSQL** — banco do Chatwoot + schema próprio do Monitor
- **Nginx + Certbot** — reverse proxy e SSL
- **Docker Compose** — todos os serviços containerizados

## Funcionalidades do Monitor

- **Visão Hoje / Volume / SLA** — métricas em tempo real por canal, prioridade, time e cliente
- **Agentes** — desempenho, ranking, SLA individual, reaberturas
- **Conversas** — busca e filtro completo com paginação
- **Clientes** — métricas por empresa, regime tributário, status de contrato, detecção de cadastro inconsistente
- **CSAT/DSAT** — avaliações de satisfação por agente/time/canal
- **Configurações** — canais, times, cores de etiquetas, horário comercial, metas de SLA por prioridade
- **Modo TV** e **exportação PDF/CSV**

## Webhook WhatsApp (evolution/webhook)

- Roteamento por menu, palavra-chave ou fluxo direto
- Respeita horário comercial configurado no próprio Chatwoot
- Blacklist de e-mails/domínios
- Suporte multi-tenant (um YAML de config por cliente)

## Infraestrutura

- Ubuntu + Docker Compose
- Nginx com subdomínios: `chat.`, `api.`, `wa.`, `monitor.`
- Backup diário (Postgres dump + volumes) com sync para Google Drive e Dropbox, com script de teste de restore
