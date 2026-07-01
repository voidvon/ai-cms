#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REMOTE_HOST="104.224.159.234"
REMOTE_USER="root"
REMOTE_DIR="/www/wwwroot/node-cms"
DEPLOY_RUNTIME_MANAGER="bt-manual"
BT_RESTART_COMMAND=""
MAX_SQLITE_BACKUPS="10"
BUILD_STATIC_ON_DEPLOY="0"
DEPLOY_UPLOAD_DB="0"
LOCAL_SQLITE_DB_PATH="${PROJECT_ROOT}/data/site.sqlite"
HEALTH_CHECK_URL="https://www.spiraxsteam.com"

KEY_FILE="$(mktemp "${TMPDIR:-/tmp}/node-cms-deploy-key.XXXXXX")"
KNOWN_HOSTS_FILE="$(mktemp "${TMPDIR:-/tmp}/node-cms-known-hosts.XXXXXX")"
LOCAL_DB_ARCHIVE_FILE=""

cleanup() {
  rm -f "${KEY_FILE}" "${KNOWN_HOSTS_FILE}"
  if [ -n "${LOCAL_DB_ARCHIVE_FILE}" ]; then
    rm -f "${LOCAL_DB_ARCHIVE_FILE}"
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

print_usage() {
  cat <<EOF
Usage: ./scripts/deploy.sh [options]

Options:
  --data                         Upload local sqlite database after gzip compression and overwrite remote database
  --build-site                   Run remote static generation after deploy
  --db-path <path>               Local sqlite database path
  --host <host>                  Remote host, default: ${REMOTE_HOST}
  --user <user>                  Remote user, default: ${REMOTE_USER}
  --dir <dir>                    Remote app dir, default: ${REMOTE_DIR}
  --runtime-manager <mode>       Runtime manager: bt, bt-manual, plain. Default: ${DEPLOY_RUNTIME_MANAGER}
  --bt-restart-command <cmd>     Restart command used when runtime manager is bt
  --max-sqlite-backups <count>   Remote sqlite backup retention, default: ${MAX_SQLITE_BACKUPS}
  --health-url <url>             Health check base url, default: ${HEALTH_CHECK_URL}
  --help                         Show this help message
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --data)
        DEPLOY_UPLOAD_DB=1
        ;;
      --build-site)
        BUILD_STATIC_ON_DEPLOY=1
        ;;
      --db-path)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --db-path\n' >&2
          exit 1
        }
        LOCAL_SQLITE_DB_PATH="$2"
        shift
        ;;
      --host)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --host\n' >&2
          exit 1
        }
        REMOTE_HOST="$2"
        shift
        ;;
      --user)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --user\n' >&2
          exit 1
        }
        REMOTE_USER="$2"
        shift
        ;;
      --dir)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --dir\n' >&2
          exit 1
        }
        REMOTE_DIR="$2"
        shift
        ;;
      --runtime-manager)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --runtime-manager\n' >&2
          exit 1
        }
        DEPLOY_RUNTIME_MANAGER="$2"
        shift
        ;;
      --bt-restart-command)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --bt-restart-command\n' >&2
          exit 1
        }
        BT_RESTART_COMMAND="$2"
        shift
        ;;
      --max-sqlite-backups)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --max-sqlite-backups\n' >&2
          exit 1
        }
        MAX_SQLITE_BACKUPS="$2"
        shift
        ;;
      --health-url)
        [ "$#" -ge 2 ] || {
          printf 'Missing value for --health-url\n' >&2
          exit 1
        }
        HEALTH_CHECK_URL="$2"
        shift
        ;;
      --help|-h)
        print_usage
        exit 0
        ;;
      *)
        printf 'Unknown option: %s\n\n' "$1" >&2
        print_usage >&2
        exit 1
        ;;
    esac
    shift
  done
}

prompt_private_key() {
  local line=""

  printf 'Paste the SSH private key for %s@%s.\n' "${REMOTE_USER}" "${REMOTE_HOST}" >&2
  printf 'The input will stop automatically after the END PRIVATE KEY line.\n' >&2
  : > "${KEY_FILE}"

  while IFS= read -r line; do
    line="${line%$'\r'}"
    printf '%s\n' "${line}" >> "${KEY_FILE}"
    if [[ "${line}" == *"END "* && "${line}" == *"PRIVATE KEY"* ]]; then
      break
    fi
  done

  chmod 600 "${KEY_FILE}"

  if ! grep -Eq 'BEGIN .+PRIVATE KEY' "${KEY_FILE}" || ! grep -Eq 'END .+PRIVATE KEY' "${KEY_FILE}"; then
    printf 'The pasted content does not look like an SSH private key.\n' >&2
    exit 1
  fi

  read -r -p 'Private key captured. Press Enter to continue...' _ < /dev/tty
}

main() {
  parse_args "$@"

  require_command npm
  require_command ssh
  require_command rsync

  printf '\n[deploy] Building dist package...\n'
  (
    cd "${PROJECT_ROOT}"
    npm run build:dist
  )

  prompt_private_key

  if [ "${DEPLOY_UPLOAD_DB}" = "1" ]; then
    require_command gzip

    if [ ! -f "${LOCAL_SQLITE_DB_PATH}" ]; then
      printf 'Local sqlite database not found: %s\n' "${LOCAL_SQLITE_DB_PATH}" >&2
      exit 1
    fi

    LOCAL_DB_ARCHIVE_FILE="$(mktemp "${TMPDIR:-/tmp}/node-cms-site-sqlite.XXXXXX.gz")"
    printf '[deploy] Compressing local sqlite database...\n'
    gzip -c "${LOCAL_SQLITE_DB_PATH}" > "${LOCAL_DB_ARCHIVE_FILE}"

    if [ "${BUILD_STATIC_ON_DEPLOY}" != "1" ]; then
      printf '[deploy] Warning: DEPLOY_UPLOAD_DB=1 but BUILD_STATIC_ON_DEPLOY=0; remote html/ will not be regenerated.\n'
    fi
  fi

  local ssh_options=(
    -i "${KEY_FILE}"
    -o StrictHostKeyChecking=accept-new
    -o UserKnownHostsFile="${KNOWN_HOSTS_FILE}"
    -o IdentitiesOnly=yes
  )

  printf '[deploy] Ensuring remote directory exists...\n'
  ssh "${ssh_options[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p '${REMOTE_DIR}' '${REMOTE_DIR}/.deploy'"

  printf '[deploy] Syncing dist package to %s...\n' "${REMOTE_DIR}"
  rsync -az --delete \
    --rsh="ssh ${ssh_options[*]}" \
    --filter='P /.deploy/' \
    --filter='P /.deploy/***' \
    --filter='P /.env' \
    --filter='P /.env.*' \
    --filter='P /data/' \
    --filter='P /data/***' \
    --filter='P /html/' \
    --filter='P /html/***' \
    --filter='P /logs/' \
    --filter='P /logs/***' \
    --filter='P /node_modules/' \
    --filter='P /node_modules/***' \
    --filter='P /system/server/node_modules/' \
    --filter='P /system/server/node_modules/***' \
    --filter='P /system/admin/node_modules/' \
    --filter='P /system/admin/node_modules/***' \
    --filter='P /uploads/' \
    --filter='P /uploads/***' \
    "${PROJECT_ROOT}/dist/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

  if [ "${DEPLOY_UPLOAD_DB}" = "1" ]; then
    printf '[deploy] Uploading compressed sqlite database...\n'
    rsync -az \
      --rsh="ssh ${ssh_options[*]}" \
      "${LOCAL_DB_ARCHIVE_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.deploy/site.sqlite.gz"
  fi

  if [ "${BUILD_STATIC_ON_DEPLOY}" = "1" ]; then
    printf '[deploy] Installing dependencies and rebuilding static pages...\n'
  else
    printf '[deploy] Installing dependencies without static page generation...\n'
  fi

  ssh "${ssh_options[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
    "DEPLOY_RUNTIME_MANAGER='${DEPLOY_RUNTIME_MANAGER}' BT_RESTART_COMMAND='${BT_RESTART_COMMAND}' MAX_SQLITE_BACKUPS='${MAX_SQLITE_BACKUPS}' BUILD_STATIC_ON_DEPLOY='${BUILD_STATIC_ON_DEPLOY}' DEPLOY_UPLOAD_DB='${DEPLOY_UPLOAD_DB}' HEALTH_CHECK_URL='${HEALTH_CHECK_URL}' bash -s -- '${REMOTE_DIR}'" <<'EOF'
set -euo pipefail

APP_DIR="$1"
PID_FILE="${APP_DIR}/.deploy/server.pid"
LOG_FILE="${APP_DIR}/logs/server.log"
SQLITE_DB_FILE="${APP_DIR}/data/site.sqlite"
SQLITE_BACKUP_DIR="${APP_DIR}/data/backups"
UPLOADED_SQLITE_ARCHIVE_FILE="${APP_DIR}/.deploy/site.sqlite.gz"
SKIP_PRE_RESTART_SQLITE_BACKUP=0

terminate_app_processes_by_cwd() {
  local app_dir="$1"
  local killed=0
  local pid

  while IFS= read -r pid; do
    [ -n "${pid}" ] || continue
    [ -d "/proc/${pid}" ] || continue

    local cwd
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [ "${cwd}" != "${app_dir}" ]; then
      continue
    fi

    kill "${pid}" 2>/dev/null || true
    killed=1
  done < <(pgrep -u www -f 'node server.mjs|npm run start' || true)

  if [ "${killed}" -eq 1 ]; then
    sleep 2
  fi

  while IFS= read -r pid; do
    [ -n "${pid}" ] || continue
    [ -d "/proc/${pid}" ] || continue

    local cwd
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [ "${cwd}" != "${app_dir}" ]; then
      continue
    fi

    kill -9 "${pid}" 2>/dev/null || true
  done < <(pgrep -u www -f 'node server.mjs|npm run start' || true)
}

prune_sqlite_backups() {
  local backup_dir="$1"
  local limit="${MAX_SQLITE_BACKUPS:-10}"
  local index=0
  local file

  while IFS= read -r file; do
    index=$((index + 1))
    if [ "${index}" -le "${limit}" ]; then
      continue
    fi
    rm -f "${file}"
  done < <(find "${backup_dir}" -maxdepth 1 -type f -name 'site-*.sqlite' | sort -r)
}

create_sqlite_backup() {
  local db_file="$1"
  local backup_dir="$2"

  if [ ! -f "${db_file}" ]; then
    printf '[deploy] No sqlite database found, skipping backup.\n'
    return 0
  fi

  mkdir -p "${backup_dir}"

  local timestamp
  local backup_file
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_file="${backup_dir}/site-${timestamp}.sqlite"

  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db_file}" ".backup '${backup_file}'"
  else
    cp -f "${db_file}" "${backup_file}"
  fi

  prune_sqlite_backups "${backup_dir}"
  printf '[deploy] SQLite backup created: %s\n' "${backup_file}"
}

restore_uploaded_sqlite_database() {
  local archive_file="$1"
  local db_file="$2"
  local backup_dir="$3"

  if [ ! -f "${archive_file}" ]; then
    printf '[deploy] Expected uploaded sqlite archive not found: %s\n' "${archive_file}" >&2
    exit 1
  fi

  create_sqlite_backup "${db_file}" "${backup_dir}"

  local tmp_file
  tmp_file="${db_file}.upload.$$"
  gzip -dc "${archive_file}" > "${tmp_file}"
  mv -f "${tmp_file}" "${db_file}"
  rm -f "${archive_file}"

  SKIP_PRE_RESTART_SQLITE_BACKUP=1
  printf '[deploy] Uploaded sqlite database restored to: %s\n' "${db_file}"
}

ensure_runtime_permissions() {
  local app_dir="$1"
  local target_user="${2:-www}"
  local target_group="${3:-www}"

  if [ -e "${app_dir}" ]; then
    chown "${target_user}:${target_group}" "${app_dir}"
    chmod 775 "${app_dir}"
  fi

  for runtime_path in \
    "${app_dir}/.deploy" \
    "${app_dir}/logs" \
    "${app_dir}/data" \
    "${app_dir}/html" \
    "${app_dir}/uploads"; do
    if [ -e "${runtime_path}" ]; then
      chown -R "${target_user}:${target_group}" "${runtime_path}"
      chmod -R u+rwX,g+rwX,o-rwx "${runtime_path}" 2>/dev/null || true
    fi
  done
}

run_local_health_checks() {
  local base_url="${HEALTH_CHECK_URL:-https://www.spiraxsteam.com}"

  if ! command -v curl >/dev/null 2>&1; then
    printf '[deploy] curl not found, skipping health checks.\n'
    return 0
  fi

  printf '[deploy] Running health checks on %s ...\n' "${base_url}"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/admin/"
  printf '[deploy] Health checks passed: / and /admin/\n'
}

start_app_as_www() {
  local app_dir="$1"
  local log_file="$2"
  local pid_file="$3"

  su -s /bin/bash www -c "
    set -euo pipefail
    cd \"${app_dir}\"
    if [ -f .env.production ]; then
      set -a
      . ./.env.production
      set +a
    fi
    nohup env NODE_ENV=production npm run start >> \"${log_file}\" 2>&1 &
    echo \$! > \"${pid_file}\"
  "

  local new_pid
  new_pid="$(cat "${pid_file}" 2>/dev/null || true)"
  sleep 2

  if [ -z "${new_pid}" ] || ! kill -0 "${new_pid}" 2>/dev/null; then
    printf 'Remote service failed to start as user www. Check %s\n' "${log_file}" >&2
    exit 1
  fi

  printf 'Deployment finished. PID=%s\n' "${new_pid}"
  run_local_health_checks
}

mkdir -p "${APP_DIR}" "${APP_DIR}/.deploy" "${APP_DIR}/data" "${APP_DIR}/html" "${APP_DIR}/logs" "${APP_DIR}/uploads"
cd "${APP_DIR}"

if [ -f .env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

npm --prefix system/server install --omit=dev
npm --prefix system/admin install --omit=dev
if [ "${BUILD_STATIC_ON_DEPLOY:-0}" = "1" ]; then
  npm run build:site
else
  printf '[deploy] Skipping static page generation; existing html/ is preserved.\n'
fi

if [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt" ]; then
  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    printf '[deploy] Warning: DEPLOY_RUNTIME_MANAGER=bt may keep the app running while database is replaced.\n'
    printf '[deploy] Consider using bt-manual mode or providing a stop/start command outside this script.\n'
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi

  if [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" != "1" ]; then
    create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  ensure_runtime_permissions "${APP_DIR}"
  if [ -n "${BT_RESTART_COMMAND:-}" ]; then
    printf '[deploy] Running BT restart command...\n'
    bash -lc "${BT_RESTART_COMMAND}"
    run_local_health_checks
  else
    printf '[deploy] BT-managed project detected. Files are updated and static pages are rebuilt.\n'
    printf '[deploy] Restart or reload the Node project from BT panel if it does not auto-reload.\n'
  fi
elif [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt-manual" ]; then
  terminate_app_processes_by_cwd "${APP_DIR}"
  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  if [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" != "1" ]; then
    create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  ensure_runtime_permissions "${APP_DIR}"
  start_app_as_www "${APP_DIR}" "${LOG_FILE}" "${PID_FILE}"
else
  if [ -f "${PID_FILE}" ]; then
    OLD_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; then
      kill "${OLD_PID}" 2>/dev/null || true
      sleep 2
      if kill -0 "${OLD_PID}" 2>/dev/null; then
        kill -9 "${OLD_PID}" 2>/dev/null || true
      fi
    fi
  fi

  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  if [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" != "1" ]; then
    create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  ensure_runtime_permissions "${APP_DIR}"
  nohup env NODE_ENV=production npm start >> "${LOG_FILE}" 2>&1 &
  NEW_PID="$!"
  echo "${NEW_PID}" > "${PID_FILE}"
  sleep 2

  if ! kill -0 "${NEW_PID}" 2>/dev/null; then
    printf 'Remote service failed to start. Check %s\n' "${LOG_FILE}" >&2
    exit 1
  fi

  printf 'Deployment finished. PID=%s\n' "${NEW_PID}"
  run_local_health_checks
fi
EOF

  printf '[deploy] Done.\n'
}

main "$@"
