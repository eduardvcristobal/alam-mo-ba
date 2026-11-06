#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-mystore-510802}"
ZONE="${GCP_ZONE:-asia-east1-b}"
INSTANCE="${GCP_INSTANCE:-apexmedsuite}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_SCRIPT="$ROOT_DIR/scripts/deploy_gce_remote.sh"
STAGE_DIR=""
COMPONENT="both"
DOMAIN=""
GOOGLE_CLIENT_ID=""

cleanup() {
  if [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]]; then rm -rf "$STAGE_DIR"; fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage:
  ./deploy_gce.sh --domain DOMAIN [--component frontend|backend|both]
                  [--google-client-id CLIENT_ID]

Components:
  frontend  Build and deploy only the Vite frontend; do not restart the API.
  backend   Build and deploy only the Spring API; preserve the existing frontend.
  both      Build and deploy both (default).

Google OAuth client IDs are read from the repository-root .env. A client ID
change requires --component both so the frontend and backend stay in sync.

Optional environment overrides:
  GCP_PROJECT_ID   Defaults to mystore-510802
  GCP_ZONE         Defaults to asia-east1-b
  GCP_INSTANCE     Defaults to apexmedsuite

The script deploys to the existing VM over IAP. It does not provision packages,
modify PostgreSQL credentials/data, rewrite Nginx/TLS configuration, or change
Google Cloud firewall, static IP, DNS, or OAuth console settings.
EOF
}

while (($#)); do
  case "$1" in
    --domain) DOMAIN="${2:?Missing domain}"; shift 2 ;;
    --component) COMPONENT="${2:?Missing component}"; shift 2 ;;
    --google-client-id) GOOGLE_CLIENT_ID="${2:?Missing Google client ID}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$COMPONENT" in
  frontend|backend|both) ;;
  *) echo "Invalid component '$COMPONENT'; use frontend, backend, or both." >&2; exit 2 ;;
esac

read_env_value() {
  local file="$1" key="$2" line value
  [[ -f "$file" ]] || return 0
  line="$(grep -m1 -E "^${key}=" "$file" || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \'* ]]; then value="${value#\'}"; value="${value%\'}"; fi
  if [[ "$value" == \"* ]]; then value="${value#\"}"; value="${value%\"}"; fi
  printf '%s' "$value"
}

BACKEND_GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" APP_GOOGLE_CLIENT_ID)"
if [[ -z "$BACKEND_GOOGLE_CLIENT_ID" ]]; then
  BACKEND_GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" GOOGLE_CLIENT_ID)"
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then GOOGLE_CLIENT_ID="$BACKEND_GOOGLE_CLIENT_ID"; fi

[[ -n "$DOMAIN" ]] || { usage >&2; exit 2; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid domain format." >&2; exit 2; }
if [[ "$COMPONENT" != backend && -z "$GOOGLE_CLIENT_ID" ]]; then
  echo "Frontend deployments require APP_GOOGLE_CLIENT_ID in the repository-root .env." >&2
  exit 2
fi
if [[ -n "$BACKEND_GOOGLE_CLIENT_ID" && "$BACKEND_GOOGLE_CLIENT_ID" != "$GOOGLE_CLIENT_ID" ]]; then
  echo "Frontend and backend Google client IDs do not match; use the backend ID from the root .env." >&2
  exit 2
fi
if [[ -n "$GOOGLE_CLIENT_ID" && ! "$GOOGLE_CLIENT_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "Invalid Google client ID format." >&2
  exit 2
fi
[[ -f "$REMOTE_SCRIPT" ]] || { echo "Missing release installer: $REMOTE_SCRIPT" >&2; exit 1; }

for tool in gcloud git; do
  command -v "$tool" >/dev/null || { echo "Required local command not found: $tool" >&2; exit 1; }
done
if [[ "$COMPONENT" != backend ]]; then
  for tool in node npm; do
    command -v "$tool" >/dev/null || { echo "Required local command not found: $tool" >&2; exit 1; }
  done
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= 22 )) || {
    echo "Node.js 22 or newer is required (found $(node --version))." >&2
    exit 1
  }
fi
if [[ "$COMPONENT" != frontend ]]; then
  for tool in java mvn; do
    command -v "$tool" >/dev/null || { echo "Required local command not found: $tool" >&2; exit 1; }
  done
  java_major="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
  [[ "$java_major" == 17 ]] || { echo "Java 17 is required (found major ${java_major:-unknown})." >&2; exit 1; }
fi

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  echo "Refusing to deploy a dirty working tree. Commit or stash changes and rerun." >&2
  exit 1
fi

ACTIVE_GCLOUD_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
[[ -n "$ACTIVE_GCLOUD_ACCOUNT" ]] || { echo "No active gcloud account; run gcloud auth login first." >&2; exit 1; }
INSTANCE_STATUS="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" --format='value(status)')"
[[ "$INSTANCE_STATUS" == RUNNING ]] || { echo "Target VM status is '$INSTANCE_STATUS'; expected RUNNING." >&2; exit 1; }

echo "Target: $INSTANCE ($PROJECT_ID / $ZONE)"
echo "Component: $COMPONENT"
echo "Release commit: $(git -C "$ROOT_DIR" rev-parse --short HEAD)"
echo "Domain: $DOMAIN"
echo "This deploy preserves the VM database and Nginx/TLS configuration."
read -r -p "Type DEPLOY to continue: " confirmation
[[ "$confirmation" == DEPLOY ]] || { echo "Cancelled."; exit 1; }

if [[ "$COMPONENT" != backend ]]; then
  echo "Building frontend (including its available unit tests)..."
  (
    cd "$ROOT_DIR/frontend"
    npm ci
    npm test
    VITE_API_BASE_URL=/api/v1 \
    VITE_ADMIN_LOGIN_ENABLED=true \
    VITE_ADMIN_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
      npm run build
  )
fi

if [[ "$COMPONENT" != frontend ]]; then
  echo "Building and verifying backend..."
  (cd "$ROOT_DIR/backend" && mvn -B --no-transfer-progress clean verify)
fi

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alammoba-release.XXXXXX")"
install -m 0644 "$REMOTE_SCRIPT" "$STAGE_DIR/deploy_release.sh"
if [[ "$COMPONENT" != frontend ]]; then
  JAR_PATH="$(find "$ROOT_DIR/backend/target" -maxdepth 1 -type f -name 'alammoba-api-*.jar' ! -name '*.original' -print -quit)"
  [[ -n "$JAR_PATH" ]] || { echo "Backend jar not found after Maven build." >&2; exit 1; }
  install -m 0644 "$JAR_PATH" "$STAGE_DIR/alammoba-api.jar"
fi
if [[ "$COMPONENT" != backend ]]; then
  [[ -s "$ROOT_DIR/frontend/dist/index.html" ]] || { echo "Frontend build output not found." >&2; exit 1; }
  mkdir -p "$STAGE_DIR/frontend"
  cp -R "$ROOT_DIR/frontend/dist/." "$STAGE_DIR/frontend/"
fi
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  printf '%s\n' "$GOOGLE_CLIENT_ID" > "$STAGE_DIR/google-client-id"
  chmod 0600 "$STAGE_DIR/google-client-id"
fi

echo "Uploading selected component over IAP..."
gcloud compute scp --recurse "$STAGE_DIR" "$INSTANCE:/tmp/" \
  --project="$PROJECT_ID" --zone="$ZONE" --tunnel-through-iap

STAGE_NAME="$(basename "$STAGE_DIR")"
echo "Deploying $COMPONENT release without changing Nginx or PostgreSQL..."
gcloud compute ssh "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" \
  --tunnel-through-iap \
  --command="sudo -n bash /tmp/$STAGE_NAME/deploy_release.sh /tmp/$STAGE_NAME '$DOMAIN' '$COMPONENT'"

echo "Deployment completed for $COMPONENT at https://$DOMAIN"
