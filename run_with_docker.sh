#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
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
    echo "Error: need either lsof or fuser to clear ports." >&2
    exit 1
  fi

  if [[ -n "$pids" ]]; then
    echo "Stopping process(es) listening on port $port: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # Force-stop only processes still listening on this port.
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

for port in "$FRONTEND_PORT" "$BACKEND_PORT" "$DATABASE_PORT"; do
  stop_port_processes "$port"
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required to start PostgreSQL." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Error: Docker Compose is required to start PostgreSQL." >&2
  exit 1
fi

cd "$ROOT_DIR"
docker compose up -d --wait postgres

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && npm ci)
fi

if [[ ! -x "$ROOT_DIR/backend/mvnw" ]] && ! command -v mvn >/dev/null 2>&1; then
  echo "Error: Maven is required (or add the Maven wrapper at backend/mvnw)." >&2
  exit 1
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

echo "Starting frontend at http://localhost:$FRONTEND_PORT"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo "Both services are running. Press Ctrl+C to stop them."
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
