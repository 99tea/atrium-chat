#!/bin/bash
set -uo pipefail

# ── Config ────────────────────────────────────────────────
BASE_DIR="/opt/djcontabilidade/backup"
ENV_FILE="$BASE_DIR/.env"
DATE=$(date +%F)
DAY_DIR="$BASE_DIR/local/$DATE"
LOG_FILE="$BASE_DIR/logs/backup_$DATE.log"

CHATWOOT_PG_CONTAINER="chatwoot-chatwoot-postgres-1"
EVOLUTION_PG_CONTAINER="evolution-evolution-postgres-1"
EVOLUTION_PG_USER="evolution"
EVOLUTION_PG_DB="evolution"

CHATWOOT_STORAGE_VOL="chatwoot_chatwoot-storage"
EVOLUTION_INSTANCES_VOL="evolution_evolution-instances"
EVOLUTION_STORE_VOL="evolution_evolution-store"

CONFIG_PATHS=(
  "/opt/djcontabilidade/chatwoot/.env"
  "/opt/djcontabilidade/chatwoot/docker-compose.yml"
  "/opt/djcontabilidade/evolution"
  "/opt/djcontabilidade/monitor/.env"
  "/opt/djcontabilidade/branding"
  "/etc/nginx/sites-available"
)

LOCAL_RETENTION_DAYS=3
CLOUD_RETENTION_DAYS=30

RCLONE_CONFIG="/home/djadmin/.config/rclone/rclone.conf"
GDRIVE_REMOTE="gdrive:"
DROPBOX_REMOTE="dropbox:Australis Dev/Backup/dj-contabilidade"

# ── Setup ─────────────────────────────────────────────────
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
mkdir -p "$DAY_DIR" "$BASE_DIR/logs"

ERRORS=()

log() {
  echo "$(date '+%F %T') - $1" | tee -a "$LOG_FILE"
}

run_step() {
  local desc="$1"; shift
  log "INICIANDO: $desc"
  if "$@" >>"$LOG_FILE" 2>&1; then
    log "OK: $desc"
  else
    log "FALHOU: $desc"
    ERRORS+=("$desc")
  fi
}

send_failure_email() {
  local body
  body=$(printf "Backup de %s apresentou falhas:\n\n%s\n\nVer log completo em: %s" "$DATE" "$(printf '%s\n' "${ERRORS[@]}")" "$LOG_FILE")
  local payload
  payload=$(jq -n \
    --arg from "$RESEND_FROM_EMAIL" \
    --arg to "$ALERT_EMAIL" \
    --arg subject "[ALERTA] Falha no backup DJ Contabilidade - $DATE" \
    --arg text "$body" \
    '{from: $from, to: $to, subject: $subject, text: $text}')
  curl -s -X POST 'https://api.resend.com/emails' \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" >>"$LOG_FILE" 2>&1
}

# ── 1. Dumps de banco ─────────────────────────────────────
dump_chatwoot() {
  docker exec "$CHATWOOT_PG_CONTAINER" pg_dump -U chatwoot -Fc chatwoot > "$DAY_DIR/db_chatwoot.dump"
}

dump_evolution() {
  docker exec "$EVOLUTION_PG_CONTAINER" pg_dump -U "$EVOLUTION_PG_USER" -Fc "$EVOLUTION_PG_DB" > "$DAY_DIR/db_evolution.dump"
}

run_step "Dump banco Chatwoot" dump_chatwoot
run_step "Dump banco Evolution API" dump_evolution

# ── 2. Volumes (storage / sessões WhatsApp) ───────────────
backup_volume() {
  local vol="$1" out="$2"
  docker run --rm \
    -v "${vol}:/data:ro" \
    -v "$DAY_DIR:/backup" \
    alpine tar czf "/backup/${out}" -C /data .
}

run_step "Backup storage Chatwoot" backup_volume "$CHATWOOT_STORAGE_VOL" "storage.tar.gz"
run_step "Backup instances Evolution API" backup_volume "$EVOLUTION_INSTANCES_VOL" "evolution_instances.tar.gz"
run_step "Backup store Evolution API" backup_volume "$EVOLUTION_STORE_VOL" "evolution_store.tar.gz"

# ── 3. Configs ─────────────────────────────────────────────
backup_configs() {
  local existing_paths=()
  for p in "${CONFIG_PATHS[@]}"; do
    if [ -e "$p" ]; then
      existing_paths+=("$p")
    else
      log "AVISO: path não encontrado, ignorando: $p"
    fi
  done
  tar czf "$DAY_DIR/configs.tar.gz" "${existing_paths[@]}"
}

run_step "Backup configs (.env, compose, nginx, branding)" backup_configs

# ── 4. Sincronizar com cloud (Drive + Dropbox) ────────────
run_step "Sync para Google Drive" rclone --config "$RCLONE_CONFIG" copy "$DAY_DIR" "${GDRIVE_REMOTE}${DATE}"
run_step "Sync para Dropbox" rclone --config "$RCLONE_CONFIG" copy "$DAY_DIR" "${DROPBOX_REMOTE}/${DATE}"

# ── 5. Limpeza local (retenção curta) ─────────────────────
log "Limpando backups locais com mais de ${LOCAL_RETENTION_DAYS} dias"
find "$BASE_DIR/local" -mindepth 1 -maxdepth 1 -type d -mtime +$LOCAL_RETENTION_DAYS -exec rm -rf {} \; >>"$LOG_FILE" 2>&1

# ── 6. Limpeza cloud (retenção 30 dias) ───────────────────
cleanup_cloud() {
  local remote="$1"
  local cutoff
  cutoff=$(date -d "-${CLOUD_RETENTION_DAYS} days" +%F)
  rclone --config "$RCLONE_CONFIG" lsf "$remote" --dirs-only 2>/dev/null | sed 's#/##' | while read -r folder; do
    if [[ "$folder" < "$cutoff" ]]; then
      rclone --config "$RCLONE_CONFIG" purge "${remote}${folder}" 2>/dev/null || rclone --config "$RCLONE_CONFIG" purge "${remote}/${folder}" 2>/dev/null
      log "Removido remoto expirado: $remote$folder"
    fi
  done
}

run_step "Limpeza retenção Google Drive" cleanup_cloud "$GDRIVE_REMOTE"
run_step "Limpeza retenção Dropbox" cleanup_cloud "${DROPBOX_REMOTE}/"

# ── 7. Alerta em caso de falha ────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
  log "Backup concluído COM FALHAS (${#ERRORS[@]} etapas)"
  send_failure_email
  exit 1
else
  log "Backup concluído com sucesso"
  exit 0
fi
