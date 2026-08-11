#!/bin/bash
set -uo pipefail

# ── Config ────────────────────────────────────────────────
BASE_DIR="/opt/djcontabilidade/backup"
TEST_DIR="$BASE_DIR/restore_test"
DATE=$(date +%F)
SOURCE_DIR="$BASE_DIR/local/$DATE"   # usa o backup local mais recente

TEST_PG_CONTAINER="restore-test-postgres"
TEST_PG_PORT=5433
TEST_PG_USER="testuser"
TEST_PG_PASS="testpass"

RESULTS=()

log() { echo "$(date '+%T') - $1"; }
pass() { RESULTS+=("PASS: $1"); log "✅ PASS: $1"; }
fail() { RESULTS+=("FAIL: $1"); log "❌ FAIL: $1"; }

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Nenhum backup encontrado em $SOURCE_DIR. Rode backup.sh primeiro ou ajuste SOURCE_DIR."
  exit 1
fi

echo "== Teste de restore usando backup de: $SOURCE_DIR =="
mkdir -p "$TEST_DIR"

# ── 1. Subir Postgres temporário isolado ──────────────────
log "Subindo Postgres de teste (porta $TEST_PG_PORT)..."
docker rm -f "$TEST_PG_CONTAINER" >/dev/null 2>&1
docker run -d --name "$TEST_PG_CONTAINER" \
  -e POSTGRES_USER="$TEST_PG_USER" \
  -e POSTGRES_PASSWORD="$TEST_PG_PASS" \
  -p "127.0.0.1:${TEST_PG_PORT}:5432" \
  postgres:15-alpine >/dev/null

log "Aguardando Postgres subir..."
for i in $(seq 1 15); do
  docker exec "$TEST_PG_CONTAINER" pg_isready -U "$TEST_PG_USER" >/dev/null 2>&1 && break
  sleep 1
done

# ── 2. Restaurar dump do Chatwoot ──────────────────────────
if [ -f "$SOURCE_DIR/db_chatwoot.dump" ]; then
  docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -c "CREATE DATABASE chatwoot_test;" >/dev/null 2>&1
  docker cp "$SOURCE_DIR/db_chatwoot.dump" "$TEST_PG_CONTAINER:/tmp/db_chatwoot.dump"
  if docker exec "$TEST_PG_CONTAINER" pg_restore -U "$TEST_PG_USER" -d chatwoot_test --no-owner --no-privileges /tmp/db_chatwoot.dump 2>/tmp/restore_chatwoot.log; then
    pass "Restore do dump Chatwoot executado sem erro fatal"
  else
    # pg_restore retorna erro em warnings normais (ex: role ausente); checar se tabelas essenciais existem
    log "pg_restore retornou avisos, verificando se dados essenciais restauraram..."
  fi

  CONV_COUNT=$(docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -d chatwoot_test -tAc "SELECT COUNT(*) FROM conversations;" 2>/dev/null)
  CONTACT_COUNT=$(docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -d chatwoot_test -tAc "SELECT COUNT(*) FROM contacts;" 2>/dev/null)
  MSG_COUNT=$(docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -d chatwoot_test -tAc "SELECT COUNT(*) FROM messages;" 2>/dev/null)

  if [[ "$CONV_COUNT" =~ ^[0-9]+$ ]]; then
    pass "Tabela conversations restaurada ($CONV_COUNT linhas)"
  else
    fail "Tabela conversations não restaurada corretamente"
  fi
  if [[ "$CONTACT_COUNT" =~ ^[0-9]+$ ]]; then
    pass "Tabela contacts restaurada ($CONTACT_COUNT linhas)"
  else
    fail "Tabela contacts não restaurada corretamente"
  fi
  if [[ "$MSG_COUNT" =~ ^[0-9]+$ ]]; then
    pass "Tabela messages restaurada ($MSG_COUNT linhas)"
  else
    fail "Tabela messages não restaurada corretamente"
  fi
else
  fail "Arquivo db_chatwoot.dump não encontrado no backup"
fi

# ── 3. Restaurar dump da Evolution API ─────────────────────
if [ -f "$SOURCE_DIR/db_evolution.dump" ]; then
  docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -c "CREATE DATABASE evolution_test;" >/dev/null 2>&1
  docker cp "$SOURCE_DIR/db_evolution.dump" "$TEST_PG_CONTAINER:/tmp/db_evolution.dump"
  docker exec "$TEST_PG_CONTAINER" pg_restore -U "$TEST_PG_USER" -d evolution_test --no-owner --no-privileges /tmp/db_evolution.dump 2>/tmp/restore_evolution.log

  TABLE_COUNT=$(docker exec "$TEST_PG_CONTAINER" psql -U "$TEST_PG_USER" -d evolution_test -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)
  if [[ "$TABLE_COUNT" =~ ^[0-9]+$ ]] && [ "$TABLE_COUNT" -gt 0 ]; then
    pass "Banco Evolution API restaurado ($TABLE_COUNT tabelas)"
  else
    fail "Banco Evolution API não restaurou tabelas"
  fi
else
  fail "Arquivo db_evolution.dump não encontrado no backup"
fi

# ── 4. Validar integridade dos tar.gz ──────────────────────
check_tar() {
  local file="$1" label="$2"
  if [ -f "$file" ]; then
    if tar tzf "$file" >/dev/null 2>&1; then
      local count
      count=$(tar tzf "$file" | wc -l)
      pass "$label íntegro ($count arquivos)"
    else
      fail "$label corrompido ou ilegível"
    fi
  else
    fail "$label não encontrado no backup"
  fi
}

check_tar "$SOURCE_DIR/storage.tar.gz" "storage.tar.gz (anexos Chatwoot)"
check_tar "$SOURCE_DIR/evolution_instances.tar.gz" "evolution_instances.tar.gz"
check_tar "$SOURCE_DIR/evolution_store.tar.gz" "evolution_store.tar.gz"
check_tar "$SOURCE_DIR/configs.tar.gz" "configs.tar.gz"

# ── 5. Testar download direto da cloud (simula perda total do droplet) ──
log "Testando download do backup direto do Google Drive (simulação de recovery remoto)..."
CLOUD_TEST_DIR="$TEST_DIR/cloud_download_test"
rm -rf "$CLOUD_TEST_DIR"
mkdir -p "$CLOUD_TEST_DIR"
if rclone --config "/home/djadmin/.config/rclone/rclone.conf" copy "gdrive:$DATE" "$CLOUD_TEST_DIR" 2>/tmp/cloud_download.log; then
  DOWNLOADED_COUNT=$(find "$CLOUD_TEST_DIR" -type f | wc -l)
  if [ "$DOWNLOADED_COUNT" -gt 0 ]; then
    pass "Download do backup direto da cloud (Google Drive) - $DOWNLOADED_COUNT arquivos"
  else
    fail "Download da cloud retornou 0 arquivos"
  fi
else
  fail "Falha ao baixar backup do Google Drive"
fi

# ── Limpeza ─────────────────────────────────────────────────
log "Limpando ambiente de teste..."
docker rm -f "$TEST_PG_CONTAINER" >/dev/null 2>&1
rm -rf "$CLOUD_TEST_DIR"

# ── Resultado final ──────────────────────────────────────────
echo ""
echo "===================== RESULTADO DO TESTE ====================="
printf '%s\n' "${RESULTS[@]}"
echo "================================================================"

FAIL_COUNT=$(printf '%s\n' "${RESULTS[@]}" | grep -c "^FAIL" || true)
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "RESULTADO: $FAIL_COUNT falha(s) encontrada(s)."
  exit 1
else
  echo "RESULTADO: Todos os testes passaram. Backup validado como restaurável."
  exit 0
fi
