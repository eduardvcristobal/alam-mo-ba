#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
if [[ -n "${FRONTEND_MODE:-}" ]]; then
  FRONTEND_MODE="$FRONTEND_MODE"
elif [[ -f "$ROOT_DIR/frontend/.env.admin" ]]; then
  FRONTEND_MODE="admin"
else
  FRONTEND_MODE="development"
fi
BACKEND_PID=""
FRONTEND_PID=""

stop_port_processes() {
  local port="$1"
  local pids

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
  else
    echo "Error: need either lsof or fuser to clear app ports." >&2
    exit 1
  fi

  if [[ -n "$pids" ]]; then
    echo "Stopping process(es) listening on app port $port: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    if command -v lsof >/dev/null 2>&1; then
      pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    else
      pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
    fi
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

cleanup() {
  trap - EXIT INT TERM
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || wait "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || wait "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Clear only the backend and frontend ports. Leave the local database alone.
stop_port_processes "$FRONTEND_PORT"
stop_port_processes "$BACKEND_PORT"

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && npm ci)
fi

if [[ ! -x "$ROOT_DIR/backend/mvnw" ]] && ! command -v mvn >/dev/null 2>&1; then
  echo "Error: Maven is required (or add the Maven wrapper at backend/mvnw)." >&2
  exit 1
fi

cd "$ROOT_DIR"
# Export .env settings to the backend process. The Spring configuration uses
# DB_URL, DB_USER, DB_PASSWORD, and PORT to connect to the local PostgreSQL.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Starting backend at http://localhost:$BACKEND_PORT"
(
  cd "$ROOT_DIR/backend"
  if [[ -x ./mvnw ]]; then
    PORT="$BACKEND_PORT" ./mvnw spring-boot:run
  else
    PORT="$BACKEND_PORT" mvn spring-boot:run
  fi
) &
BACKEND_PID=$!

echo "Starting frontend at http://$FRONTEND_HOST:$FRONTEND_PORT"
echo "Using frontend mode: $FRONTEND_MODE"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --mode "$FRONTEND_MODE" --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo "Backend and frontend are running. Press Ctrl+C to stop them."
echo "Using database: ${DB_URL:-jdbc:postgresql://localhost:5432/alammoba}"
while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" || true
    echo "Backend stopped; shutting down." >&2
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID" || true
    echo "Frontend stopped; shutting down." >&2
    exit 1
  fi
  sleep 1
done
