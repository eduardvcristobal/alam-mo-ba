#!/usr/bin/env bash
set -Eeuo pipefail

STAGE_DIR="${1:?Usage: deploy_release.sh STAGE_DIR DOMAIN COMPONENT}"
DOMAIN="${2:?Usage: deploy_release.sh STAGE_DIR DOMAIN COMPONENT}"
COMPONENT="${3:?Usage: deploy_release.sh STAGE_DIR DOMAIN COMPONENT}"
trap 'rm -rf "$STAGE_DIR"' EXIT

exec 9>/run/lock/alammoba-deploy.lock
flock -n 9 || { echo "Another deployment is already running." >&2; exit 1; }

[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid domain." >&2; exit 2; }
case "$COMPONENT" in frontend|backend|both) ;; *) echo "Invalid deployment component." >&2; exit 2 ;; esac
[[ -s "$STAGE_DIR/deploy_release.sh" ]] || { echo "Missing remote release script." >&2; exit 1; }
if [[ "$COMPONENT" != frontend ]]; then
  [[ -s "$STAGE_DIR/alammoba-api.jar" ]] || { echo "Backend jar is missing." >&2; exit 1; }
fi
if [[ "$COMPONENT" != backend ]]; then
  [[ -s "$STAGE_DIR/frontend/index.html" ]] || { echo "Frontend build is missing." >&2; exit 1; }
fi

DOMAIN="$DOMAIN" COMPONENT="$COMPONENT" STAGE_DIR="$STAGE_DIR" bash -s <<'REMOTE'
set -Eeuo pipefail

DOMAIN="$DOMAIN"
COMPONENT="$COMPONENT"
STAGE_DIR="$STAGE_DIR"
CURRENT_LINK=/opt/alammoba/current
WEB_ROOT=/var/www/alammoba
API_ENV=/etc/alammoba/api.env
PREVIOUS_RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
ENV_BACKUP=""
RELEASE_ID="$(date -u +%Y%m%dT%H%M%S%NZ)"
RELEASE_DIR="/opt/alammoba/releases/$RELEASE_ID"

cleanup() {
  rm -rf "$STAGE_DIR"
  if [[ -n "$ENV_BACKUP" ]]; then rm -f "$ENV_BACKUP"; fi
}
trap cleanup EXIT

[[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE/frontend" && -s "$PREVIOUS_RELEASE/alammoba-api.jar" ]] || {
  echo "No complete current release found. Run the initial VM setup before component deployments." >&2
  exit 1
}
[[ -f "$API_ENV" ]] || { echo "API environment file is missing; refusing to deploy." >&2; exit 1; }
[[ -f /etc/nginx/sites-available/alammoba ]] || { echo "Nginx site config is missing; refusing to deploy." >&2; exit 1; }
nginx -t

STAGED_CLIENT_ID=""
CURRENT_CLIENT_ID="$(sed -n 's/^APP_GOOGLE_CLIENT_ID=//p' "$API_ENV" | head -n 1)"
if [[ -z "$CURRENT_CLIENT_ID" ]]; then
  CURRENT_CLIENT_ID="$(sed -n 's/^GOOGLE_CLIENT_ID=//p' "$API_ENV" | head -n 1)"
fi
if [[ -s "$STAGE_DIR/google-client-id" ]]; then
  STAGED_CLIENT_ID="$(cat "$STAGE_DIR/google-client-id")"
  [[ "$STAGED_CLIENT_ID" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "Invalid staged Google client ID." >&2; exit 2; }
fi

if [[ "$COMPONENT" == frontend && "$STAGED_CLIENT_ID" != "$CURRENT_CLIENT_ID" ]]; then
  echo "The frontend Google client ID differs from the VM backend. Deploy both components to change it." >&2
  exit 1
fi
if [[ "$COMPONENT" == backend && "$STAGED_CLIENT_ID" != "$CURRENT_CLIENT_ID" ]]; then
  echo "The backend Google client ID differs from the current frontend. Deploy both components to change it." >&2
  exit 1
fi
if [[ "$COMPONENT" == backend && -n "$CURRENT_CLIENT_ID" ]] && ! grep -R -qF -- "$CURRENT_CLIENT_ID" "$PREVIOUS_RELEASE/frontend/assets"; then
  echo "Current frontend and backend Google client IDs do not match. Deploy both components to synchronize them." >&2
  exit 1
fi

install -d -o root -g root -m 0755 /opt/alammoba/releases "$RELEASE_DIR/frontend"
cp -a "$PREVIOUS_RELEASE/." "$RELEASE_DIR/"
if [[ "$COMPONENT" != frontend ]]; then
  install -o root -g root -m 0644 "$STAGE_DIR/alammoba-api.jar" "$RELEASE_DIR/alammoba-api.jar"
fi
if [[ "$COMPONENT" != backend ]]; then
  rsync -a --delete "$STAGE_DIR/frontend/" "$RELEASE_DIR/frontend/"
fi
chown -R root:root "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +

if [[ "$COMPONENT" != frontend && -n "$STAGED_CLIENT_ID" && "$STAGED_CLIENT_ID" != "$CURRENT_CLIENT_ID" ]]; then
  ENV_BACKUP="$(mktemp /etc/alammoba/api.env.backup.XXXXXX)"
  cp -a "$API_ENV" "$ENV_BACKUP"
  ENV_TEMP="$(mktemp /etc/alammoba/api.env.XXXXXX)"
  awk -v id="$STAGED_CLIENT_ID" '
    BEGIN { found=0 }
    /^(APP_GOOGLE_CLIENT_ID|GOOGLE_CLIENT_ID)=/ {
      key=substr($0, 1, index($0, "=") - 1)
      print key "=" id
      found=1
      next
    }
    { print }
    END { if (!found) print "GOOGLE_CLIENT_ID=" id }
  ' "$API_ENV" > "$ENV_TEMP"
  chown root:root "$ENV_TEMP"
  chmod 0600 "$ENV_TEMP"
  mv -f "$ENV_TEMP" "$API_ENV"
fi

rollback() {
  echo "Release verification failed; restoring the previous release." >&2
  ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK.rollback"
  mv -Tf "$CURRENT_LINK.rollback" "$CURRENT_LINK"
  ln -sfn "$CURRENT_LINK/frontend" "$WEB_ROOT.rollback"
  mv -Tf "$WEB_ROOT.rollback" "$WEB_ROOT"
  if [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
    cp -a "$ENV_BACKUP" "$API_ENV"
    systemctl restart alammoba-api || true
  fi
  exit 1
}

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK.next"
mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
ln -sfn "$CURRENT_LINK/frontend" "$WEB_ROOT.next"
mv -Tf "$WEB_ROOT.next" "$WEB_ROOT"

if [[ "$COMPONENT" != frontend ]]; then
  if ! systemctl restart alammoba-api; then rollback; fi
  for attempt in $(seq 1 30); do
    if curl --fail --silent http://127.0.0.1:8080/api/v1/status >/dev/null; then break; fi
    if [[ "$attempt" -eq 30 ]]; then
      journalctl -u alammoba-api -n 80 --no-pager
      rollback
    fi
    sleep 2
  done
fi

if ! curl --fail --silent --show-error --insecure \
  --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/v1/status" >/dev/null; then
  rollback
fi
if [[ "$COMPONENT" != backend ]]; then
  EXPECTED_JS="$(grep -oE 'assets/[^" ]+\.js' "$RELEASE_DIR/frontend/index.html" | head -n 1)"
  [[ -n "$EXPECTED_JS" ]] || { echo "No JavaScript bundle referenced by the frontend index." >&2; rollback; }
  if ! curl --fail --silent --show-error --insecure \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" | grep -qF "$EXPECTED_JS"; then
    rollback
  fi
fi

systemctl is-active --quiet nginx
echo "Deployed $COMPONENT release $RELEASE_ID for $DOMAIN."
echo "Nginx/TLS and PostgreSQL configuration and credentials were preserved."
REMOTE
