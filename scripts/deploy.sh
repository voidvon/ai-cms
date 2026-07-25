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
LOCAL_DB_SNAPSHOT_FILE=""

cleanup() {
  rm -f "${KEY_FILE}" "${KNOWN_HOSTS_FILE}"
  if [ -n "${LOCAL_DB_ARCHIVE_FILE}" ]; then
    rm -f "${LOCAL_DB_ARCHIVE_FILE}"
  fi
  if [ -n "${LOCAL_DB_SNAPSHOT_FILE}" ]; then
    rm -f "${LOCAL_DB_SNAPSHOT_FILE}"
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '缺少必需命令：%s\n' "$1" >&2
    exit 1
  fi
}

print_usage() {
  cat <<EOF
用法：./scripts/deploy.sh [选项]

选项：
  --data                         gzip 压缩并上传本地 sqlite 数据库，覆盖远端数据库
  --build-site                   部署后在远端执行静态生成
  --db-path <path>               本地 sqlite 数据库路径
  --host <host>                  远端主机，默认：${REMOTE_HOST}
  --user <user>                  远端用户，默认：${REMOTE_USER}
  --dir <dir>                    远端应用目录，默认：${REMOTE_DIR}
  --runtime-manager <mode>       运行管理模式：bt、bt-manual、plain。默认：${DEPLOY_RUNTIME_MANAGER}
  --bt-restart-command <cmd>     runtime-manager 为 bt 时使用的重启命令
  --max-sqlite-backups <count>   远端 sqlite 备份保留数量，默认：${MAX_SQLITE_BACKUPS}
  --health-url <url>             健康检查基础 URL，默认：${HEALTH_CHECK_URL}
  --help                         显示此帮助信息
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
          printf '缺少 --db-path 的参数值\n' >&2
          exit 1
        }
        LOCAL_SQLITE_DB_PATH="$2"
        shift
        ;;
      --host)
        [ "$#" -ge 2 ] || {
          printf '缺少 --host 的参数值\n' >&2
          exit 1
        }
        REMOTE_HOST="$2"
        shift
        ;;
      --user)
        [ "$#" -ge 2 ] || {
          printf '缺少 --user 的参数值\n' >&2
          exit 1
        }
        REMOTE_USER="$2"
        shift
        ;;
      --dir)
        [ "$#" -ge 2 ] || {
          printf '缺少 --dir 的参数值\n' >&2
          exit 1
        }
        REMOTE_DIR="$2"
        shift
        ;;
      --runtime-manager)
        [ "$#" -ge 2 ] || {
          printf '缺少 --runtime-manager 的参数值\n' >&2
          exit 1
        }
        DEPLOY_RUNTIME_MANAGER="$2"
        shift
        ;;
      --bt-restart-command)
        [ "$#" -ge 2 ] || {
          printf '缺少 --bt-restart-command 的参数值\n' >&2
          exit 1
        }
        BT_RESTART_COMMAND="$2"
        shift
        ;;
      --max-sqlite-backups)
        [ "$#" -ge 2 ] || {
          printf '缺少 --max-sqlite-backups 的参数值\n' >&2
          exit 1
        }
        MAX_SQLITE_BACKUPS="$2"
        shift
        ;;
      --health-url)
        [ "$#" -ge 2 ] || {
          printf '缺少 --health-url 的参数值\n' >&2
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
        printf '未知选项：%s\n\n' "$1" >&2
        print_usage >&2
        exit 1
        ;;
    esac
    shift
  done
}

prompt_private_key() {
  local line=""

  printf '请粘贴用于连接 %s@%s 的 SSH 私钥。\n' "${REMOTE_USER}" "${REMOTE_HOST}" >&2
  printf '读取到 END PRIVATE KEY 行后会自动结束输入。\n' >&2
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
    printf '粘贴的内容看起来不是有效的 SSH 私钥。\n' >&2
    exit 1
  fi

  read -r -p '私钥已读取，按回车继续...' _ < /dev/tty
}

create_local_sqlite_archive() {
  local db_file="$1"
  local archive_file="$2"

  LOCAL_DB_SNAPSHOT_FILE="$(mktemp "${TMPDIR:-/tmp}/node-cms-site-sqlite-snapshot.XXXXXX")"

  printf '[部署] 正在创建 sqlite 一致性快照...\n'
  sqlite3 "${db_file}" ".backup '${LOCAL_DB_SNAPSHOT_FILE}'"
  sqlite3 "${LOCAL_DB_SNAPSHOT_FILE}" "PRAGMA quick_check;" | grep -qx 'ok'

  printf '[部署] 正在压缩 sqlite 快照...\n'
  gzip -c "${LOCAL_DB_SNAPSHOT_FILE}" > "${archive_file}"
}

main() {
  parse_args "$@"

  require_command npm
  require_command ssh
  require_command rsync

  printf '\n[部署] 正在构建 dist 发布包...\n'
  (
    cd "${PROJECT_ROOT}"
    npm run build:dist
  )

  prompt_private_key

  if [ "${DEPLOY_UPLOAD_DB}" = "1" ]; then
    require_command gzip
    require_command sqlite3

    if [ ! -f "${LOCAL_SQLITE_DB_PATH}" ]; then
      printf '未找到本地 sqlite 数据库：%s\n' "${LOCAL_SQLITE_DB_PATH}" >&2
      exit 1
    fi

    LOCAL_DB_ARCHIVE_FILE="$(mktemp "${TMPDIR:-/tmp}/node-cms-site-sqlite.XXXXXX.gz")"
    create_local_sqlite_archive "${LOCAL_SQLITE_DB_PATH}" "${LOCAL_DB_ARCHIVE_FILE}"

    if [ "${BUILD_STATIC_ON_DEPLOY}" != "1" ]; then
      printf '[部署] 警告：已启用数据库上传，但未启用静态生成；远端 html/ 不会重新生成。\n'
    fi
  fi

  local ssh_options=(
    -i "${KEY_FILE}"
    -o StrictHostKeyChecking=accept-new
    -o UserKnownHostsFile="${KNOWN_HOSTS_FILE}"
    -o IdentitiesOnly=yes
  )

  printf '[部署] 正在确认远端目录存在...\n'
  ssh "${ssh_options[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p '${REMOTE_DIR}' '${REMOTE_DIR}/.deploy'"

  printf '[部署] 正在同步 dist 发布包到 %s...\n' "${REMOTE_DIR}"
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
    --filter='P /html_*/' \
    --filter='P /html_*/***' \
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
    printf '[部署] 正在上传压缩后的 sqlite 数据库...\n'
    rsync -az \
      --rsh="ssh ${ssh_options[*]}" \
      "${LOCAL_DB_ARCHIVE_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.deploy/site.sqlite.gz"
  fi

  if [ "${BUILD_STATIC_ON_DEPLOY}" = "1" ]; then
    printf '[部署] 正在检查依赖并重新生成静态页面...\n'
  else
    printf '[部署] 正在检查依赖，本次不生成静态页面...\n'
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
    printf '[部署] 未找到 sqlite 数据库，跳过备份。\n'
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
  printf '[部署] SQLite 备份已创建：%s\n' "${backup_file}"
}

restore_uploaded_sqlite_database() {
  local archive_file="$1"
  local db_file="$2"
  local backup_dir="$3"

  if [ ! -f "${archive_file}" ]; then
    printf '[部署] 未找到预期的已上传 sqlite 压缩包：%s\n' "${archive_file}" >&2
    exit 1
  fi

  create_sqlite_backup "${db_file}" "${backup_dir}"

  local tmp_file
  tmp_file="${db_file}.upload.$$"
  gzip -dc "${archive_file}" > "${tmp_file}"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${tmp_file}" "PRAGMA quick_check;" | grep -qx 'ok'
  fi
  mv -f "${tmp_file}" "${db_file}"
  rm -f "${db_file}-wal" "${db_file}-shm"
  rm -f "${archive_file}"

  SKIP_PRE_RESTART_SQLITE_BACKUP=1
  printf '[部署] 已将上传的 sqlite 数据库恢复到：%s\n' "${db_file}"
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
    "${app_dir}/.updates" \
    "${app_dir}/logs" \
    "${app_dir}/data" \
    "${app_dir}/html" \
    "${app_dir}/uploads"; do
    if [ -e "${runtime_path}" ]; then
      chown -R "${target_user}:${target_group}" "${runtime_path}"
      chmod -R u+rwX,g+rwX,o-rwx "${runtime_path}" 2>/dev/null || true
    fi
  done

  # 后台在线更新需要覆盖程序文件并按根目录 lockfile 安装依赖。
  for application_path in \
    "${app_dir}/server.mjs" \
    "${app_dir}/package.json" \
    "${app_dir}/package-lock.json" \
    "${app_dir}/DEPLOY.md" \
    "${app_dir}/RELEASE.json" \
    "${app_dir}/system" \
    "${app_dir}/scripts" \
    "${app_dir}/public" \
    "${app_dir}/node_modules"; do
    if [ -e "${application_path}" ]; then
      chown -R "${target_user}:${target_group}" "${application_path}"
      chmod -R u+rwX,g+rX,o-rX "${application_path}" 2>/dev/null || true
    fi
  done
}

run_local_health_checks() {
  local base_url="${HEALTH_CHECK_URL:-https://www.spiraxsteam.com}"

  if ! command -v curl >/dev/null 2>&1; then
    printf '[部署] 未找到 curl，跳过健康检查。\n'
    return 0
  fi

  printf '[部署] 正在对 %s 执行健康检查...\n' "${base_url}"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/admin/"
  printf '[部署] 健康检查通过：/ 和 /admin/\n'
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
    printf '远端服务未能以 www 用户启动。请检查 %s\n' "${log_file}" >&2
    exit 1
  fi

  printf '部署完成。PID=%s\n' "${new_pid}"
  run_local_health_checks
}

run_static_generation_if_requested() {
  if [ "${BUILD_STATIC_ON_DEPLOY:-0}" = "1" ]; then
    npm run build:site
  else
    printf '[部署] 跳过静态页面生成，保留现有 html/。\n'
  fi
}

install_npm_dependencies_if_needed() {
  local package_dir="$1"
  local cache_key_name="$2"
  local label="$3"
  local stamp_file="${APP_DIR}/.deploy/${cache_key_name}.sha256"
  local current_hash
  local previous_hash

  if [ ! -f "${package_dir}/package.json" ]; then
    printf '[部署] 未找到 %s 的 package.json，跳过依赖安装。\n' "${label}"
    return 0
  fi

  current_hash="$(
    cd "${package_dir}"
    {
      sha256sum package.json
      if [ -f package-lock.json ]; then
        sha256sum package-lock.json
      fi
    } | sha256sum | awk '{print $1}'
  )"
  previous_hash="$(cat "${stamp_file}" 2>/dev/null || true)"

  if [ "${current_hash}" = "${previous_hash}" ] && [ -d "${package_dir}/node_modules" ]; then
    printf '[部署] %s 依赖未变化，跳过 npm ci。\n' "${label}"
    return 0
  fi

  printf '[部署] 正在安装 %s 依赖...\n' "${label}"
  if [ ! -f "${package_dir}/package-lock.json" ]; then
    printf '[部署] %s 缺少 package-lock.json，拒绝执行非确定性依赖安装。\n' "${label}" >&2
    exit 1
  fi
  npm --prefix "${package_dir}" ci --omit=dev --legacy-peer-deps --no-audit --no-fund
  printf '%s\n' "${current_hash}" > "${stamp_file}"
}

mkdir -p "${APP_DIR}" "${APP_DIR}/.deploy" "${APP_DIR}/data" "${APP_DIR}/html" "${APP_DIR}/logs" "${APP_DIR}/uploads"
cd "${APP_DIR}"

if [ -f .env.production ]; then
  set -a
  . ./.env.production
  set +a
fi

install_npm_dependencies_if_needed "${APP_DIR}" "root-deps" "运行时"

if [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt" ]; then
  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    printf '[部署] 警告：DEPLOY_RUNTIME_MANAGER=bt 可能会在替换数据库时保持应用运行。\n'
    printf '[部署] 建议使用 bt-manual 模式，或在脚本外提供停止/启动命令。\n'
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi

  if [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" != "1" ]; then
    create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  run_static_generation_if_requested
  ensure_runtime_permissions "${APP_DIR}"
  if [ -n "${BT_RESTART_COMMAND:-}" ]; then
    printf '[部署] 正在执行 BT 重启命令...\n'
    bash -lc "${BT_RESTART_COMMAND}"
    run_local_health_checks
  else
    printf '[部署] 检测到 BT 管理项目。文件已更新，静态页面已重新生成。\n'
    printf '[部署] 如果项目没有自动重载，请在 BT 面板中重启或重载 Node 项目。\n'
  fi
elif [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt-manual" ]; then
  terminate_app_processes_by_cwd "${APP_DIR}"
  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  if [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" != "1" ]; then
    create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  run_static_generation_if_requested
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
  run_static_generation_if_requested
  ensure_runtime_permissions "${APP_DIR}"
  nohup env NODE_ENV=production npm start >> "${LOG_FILE}" 2>&1 &
  NEW_PID="$!"
  echo "${NEW_PID}" > "${PID_FILE}"
  sleep 2

  if ! kill -0 "${NEW_PID}" 2>/dev/null; then
    printf '远端服务启动失败。请检查 %s\n' "${LOG_FILE}" >&2
    exit 1
  fi

  printf '部署完成。PID=%s\n' "${NEW_PID}"
  run_local_health_checks
fi
EOF

  printf '[部署] 完成。\n'
}

main "$@"
