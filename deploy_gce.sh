#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-mystore-510802}"
ZONE="${GCP_ZONE:-asia-east1-b}"
INSTANCE="${GCP_INSTANCE:-apexmedsuite}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_SCRIPT="$ROOT_DIR/scripts/deploy_gce_remote.sh"
STAGE_DIR=""
DB_PASSWORD=""
PASSWORD_GENERATED="false"

cleanup() {
  if [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]]; then
    rm -rf "$STAGE_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage:
  ./deploy_gce.sh --domain DOMAIN [--google-client-id CLIENT_ID] [--admin-email EMAIL]
  ./deploy_gce.sh --domain DOMAIN --no-admin-bootstrap

Optional environment overrides:
  GCP_PROJECT_ID   Defaults to mystore-510802
  GCP_ZONE         Defaults to asia-east1-b
  GCP_INSTANCE     Defaults to apexmedsuite

This script builds and deploys the app over IAP SSH, installs Java,
PostgreSQL, and Nginx on the VM, and configures a local PostgreSQL database.
It does not change Google Cloud firewall rules, static IP assignment, DNS,
Google OAuth console settings, or issue an HTTPS certificate.
EOF
}

DOMAIN=""
GOOGLE_CLIENT_ID=""
ADMIN_EMAIL=""
NO_ADMIN_BOOTSTRAP="false"
while (($#)); do
  case "$1" in
    --domain) DOMAIN="${2:?Missing domain}"; shift 2 ;;
    --google-client-id) GOOGLE_CLIENT_ID="${2:?Missing Google client ID}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:?Missing admin email}"; shift 2 ;;
    --no-admin-bootstrap) NO_ADMIN_BOOTSTRAP="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

read_env_value() {
  local file="$1" key="$2" line value
  [[ -f "$file" ]] || return 0
  line="$(grep -m1 -E "^${key}=" "$file" || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \'*\' ]]; then value="${value#\'}"; value="${value%\'}"; fi
  if [[ "$value" == \"*\" ]]; then value="${value#\"}"; value="${value%\"}"; fi
  printf '%s' "$value"
}

if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/frontend/.env" VITE_ADMIN_GOOGLE_CLIENT_ID)"
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/frontend/.env.admin" VITE_ADMIN_GOOGLE_CLIENT_ID)"
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/frontend/.env.admin" VITE_GOOGLE_CLIENT_ID)"
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" APP_GOOGLE_CLIENT_ID)"
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" GOOGLE_CLIENT_ID)"
fi
BACKEND_GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" APP_GOOGLE_CLIENT_ID)"
if [[ -z "$BACKEND_GOOGLE_CLIENT_ID" ]]; then
  BACKEND_GOOGLE_CLIENT_ID="$(read_env_value "$ROOT_DIR/.env" GOOGLE_CLIENT_ID)"
fi
if [[ -z "$ADMIN_EMAIL" && "$NO_ADMIN_BOOTSTRAP" == "false" ]]; then
  ADMIN_EMAIL="$(read_env_value "$ROOT_DIR/.env" PLATFORM_ADMIN_EMAIL)"
fi
if [[ "$NO_ADMIN_BOOTSTRAP" == "true" ]]; then
  ADMIN_EMAIL=""
fi

if [[ -z "$DOMAIN" || -z "$GOOGLE_CLIENT_ID" ]]; then
  usage >&2
  exit 2
fi
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid domain format." >&2; exit 2; }
if [[ -n "$BACKEND_GOOGLE_CLIENT_ID" && "$BACKEND_GOOGLE_CLIENT_ID" != "$GOOGLE_CLIENT_ID" ]]; then
  echo "Frontend and backend Google client IDs do not match; align local env files or pass the correct --google-client-id." >&2
  exit 2
fi
if [[ -n "$ADMIN_EMAIL" ]]; then
  [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Invalid admin email format." >&2; exit 2; }
fi
[[ "$GOOGLE_CLIENT_ID" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid Google client ID format." >&2; exit 2; }

for tool in gcloud git node npm java mvn openssl; do
  command -v "$tool" >/dev/null || { echo "Required local command not found: $tool" >&2; exit 1; }
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
java_major="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
[[ "$node_major" == "22" ]] || { echo "Node.js 22 is required (found $(node --version))." >&2; exit 1; }
[[ "$java_major" == "17" ]] || { echo "Java 17 is required (found major ${java_major:-unknown})." >&2; exit 1; }
[[ -f "$REMOTE_SCRIPT" ]] || { echo "Missing remote installer: $REMOTE_SCRIPT" >&2; exit 1; }

if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  echo "Refusing to deploy a dirty working tree. Commit or stash changes and rerun." >&2
  exit 1
fi

ACTIVE_GCLOUD_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
[[ -n "$ACTIVE_GCLOUD_ACCOUNT" ]] || { echo "No active gcloud account; run gcloud auth login first." >&2; exit 1; }
INSTANCE_STATUS="$(gcloud compute instances describe "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" --format='value(status)')"
[[ "$INSTANCE_STATUS" == "RUNNING" ]] || { echo "Target VM status is '$INSTANCE_STATUS'; expected RUNNING." >&2; exit 1; }

echo "Target: $INSTANCE ($PROJECT_ID / $ZONE)"
echo "Release commit: $(git -C "$ROOT_DIR" rev-parse --short HEAD)"
echo "Domain: $DOMAIN"
echo "The deployment will install packages, create/update the database role password,"
echo "write the app environment file, and restart services on the VM."
echo "OAuth client ID and bootstrap email are read from local env files unless overridden."
read -r -p "Type DEPLOY to continue: " confirmation
[[ "$confirmation" == "DEPLOY" ]] || { echo "Cancelled."; exit 1; }

read -r -s -p "Database password (leave blank to generate a new one): " DB_PASSWORD
printf '\n'
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  PASSWORD_GENERATED="true"
  echo "Generated a unique database password; it will be stored in the root-only server env file."
fi
[[ "$DB_PASSWORD" =~ ^[A-Za-z0-9_-]{32,}$ ]] || {
  echo "Use at least 32 characters from letters, digits, underscore, or hyphen." >&2
  exit 2
}

echo "Running frontend tests and production build..."
(
  cd "$ROOT_DIR/frontend"
  npm ci
  npm test
  VITE_API_BASE_URL=/api/v1 \
  VITE_ADMIN_LOGIN_ENABLED=true \
  VITE_ADMIN_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    npm run build
)

echo "Running backend verification build..."
(
  cd "$ROOT_DIR/backend"
  mvn -B --no-transfer-progress clean verify
)

JAR_PATH="$(find "$ROOT_DIR/backend/target" -maxdepth 1 -type f -name 'alammoba-api-*.jar' ! -name '*.original' -print -quit)"
[[ -n "$JAR_PATH" && -d "$ROOT_DIR/frontend/dist" ]] || {
  echo "Expected API jar and frontend/dist build outputs were not found." >&2
  exit 1
}

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alammoba-deploy.XXXXXX")"
mkdir -p "$STAGE_DIR/frontend"
install -m 0644 "$JAR_PATH" "$STAGE_DIR/alammoba-api.jar"
cp -R "$ROOT_DIR/frontend/dist/." "$STAGE_DIR/frontend/"
install -m 0644 "$REMOTE_SCRIPT" "$STAGE_DIR/deploy_remote.sh"
cat >"$STAGE_DIR/api.env" <<EOF
PORT=8080
SERVER_ADDRESS=127.0.0.1
SERVER_ERROR_INCLUDE_MESSAGE=never
DB_URL=jdbc:postgresql://127.0.0.1:5432/alammoba
DB_USER=alammoba
DB_PASSWORD=$DB_PASSWORD
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ADMIN_GOOGLE_LOGIN_ENABLED=true
PLATFORM_ADMIN_EMAIL=$ADMIN_EMAIL
APP_ACCOUNT_REGISTRATION_ENABLED=false
CORS_ORIGIN=https://$DOMAIN
EOF
chmod 0600 "$STAGE_DIR/api.env"

echo "Checking Google Cloud access and uploading release over IAP..."
gcloud compute scp --recurse "$STAGE_DIR" "$INSTANCE:/tmp/" \
  --project="$PROJECT_ID" --zone="$ZONE" --tunnel-through-iap

echo "Installing server packages and deploying release..."
gcloud compute ssh "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" \
  --tunnel-through-iap \
  --command="sudo -n bash /tmp/$(basename "$STAGE_DIR")/deploy_remote.sh /tmp/$(basename "$STAGE_DIR") '$DOMAIN'"

echo
echo "Deployment completed. Verify DNS and configure HTTPS as documented in DEPLOYMENT.MD."
if [[ "$PASSWORD_GENERATED" == "true" ]]; then
  echo "A new database password was generated and installed; it was not printed."
fi
if [[ -z "$ADMIN_EMAIL" ]]; then
  echo "No bootstrap email was configured. Existing provisioned admin accounts can still sign in."
else
  echo "Initial admin sign-in: https://$DOMAIN/admin with $ADMIN_EMAIL"
fi
