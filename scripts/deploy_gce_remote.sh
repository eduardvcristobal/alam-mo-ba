#!/usr/bin/env bash
set -Eeuo pipefail

STAGE_DIR="${1:?Usage: deploy_remote.sh STAGE_DIR DOMAIN}"
DOMAIN="${2:?Usage: deploy_remote.sh STAGE_DIR DOMAIN}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid domain." >&2; exit 2; }
[[ -s "$STAGE_DIR/alammoba-api.jar" && -s "$STAGE_DIR/api.env" && -d "$STAGE_DIR/frontend" ]] || {
  echo "Incomplete deployment package at $STAGE_DIR" >&2
  exit 1
}
cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

set -a
# Values are generated/validated by deploy_gce.sh and contain no shell syntax.
. "$STAGE_DIR/api.env"
set +a
[[ "$DB_PASSWORD" =~ ^[A-Za-z0-9_-]{32,}$ ]] || { echo "Invalid database password format." >&2; exit 2; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y openjdk-17-jre-headless postgresql postgresql-contrib nginx rsync curl
systemctl enable --now postgresql nginx

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='alammoba'" | grep -qx '1'; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'CREATE ROLE alammoba LOGIN'
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE alammoba WITH LOGIN PASSWORD '$DB_PASSWORD';
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='alammoba'" | grep -qx '1'; then
  sudo -u postgres createdb --owner=alammoba alammoba
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'ALTER DATABASE alammoba OWNER TO alammoba'
fi

install -d -o root -g root -m 0755 /opt/alammoba/releases
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="/opt/alammoba/releases/$RELEASE_ID"
PREVIOUS_RELEASE="$(readlink -f /opt/alammoba/current 2>/dev/null || true)"
install -d -o root -g root -m 0755 "$RELEASE_DIR/frontend"
install -o root -g root -m 0644 "$STAGE_DIR/alammoba-api.jar" "$RELEASE_DIR/alammoba-api.jar"
rsync -a --delete "$STAGE_DIR/frontend/" "$RELEASE_DIR/frontend/"
chown -R root:root "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 0755 {} +
find "$RELEASE_DIR" -type f -exec chmod 0644 {} +

install -d -o root -g root -m 0750 /etc/alammoba
install -o root -g root -m 0600 "$STAGE_DIR/api.env" /etc/alammoba/api.env

cat >/etc/systemd/system/alammoba-api.service <<'EOF'
[Unit]
Description=Alam Mo Ba API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
EnvironmentFile=/etc/alammoba/api.env
WorkingDirectory=/opt/alammoba/current
ExecStart=/usr/bin/java -jar /opt/alammoba/current/alammoba-api.jar
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/nginx/sites-available/alammoba <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root /var/www/alammoba;
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/alammoba /etc/nginx/sites-enabled/alammoba
rm -f /etc/nginx/sites-enabled/default
nginx -t

if [[ -e /var/www/alammoba && ! -L /var/www/alammoba ]]; then
  mv /var/www/alammoba "/var/www/alammoba.pre-deploy.$RELEASE_ID"
fi
ln -sfn "$RELEASE_DIR/frontend" /var/www/alammoba.new
mv -Tf /var/www/alammoba.new /var/www/alammoba
ln -sfn "$RELEASE_DIR" /opt/alammoba/current.new
mv -Tf /opt/alammoba/current.new /opt/alammoba/current

nginx -t
systemctl daemon-reload
systemctl enable alammoba-api
restore_previous() {
  echo "Deployment health check failed; restoring the previous release." >&2
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    ln -sfn "$PREVIOUS_RELEASE/frontend" /var/www/alammoba.rollback
    mv -Tf /var/www/alammoba.rollback /var/www/alammoba
    ln -sfn "$PREVIOUS_RELEASE" /opt/alammoba/current.rollback
    mv -Tf /opt/alammoba/current.rollback /opt/alammoba/current
    systemctl restart alammoba-api || true
    systemctl reload nginx || true
  else
    systemctl stop alammoba-api || true
  fi
  exit 1
}

if ! systemctl restart alammoba-api; then
  restore_previous
fi
systemctl reload nginx

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8080/api/v1/status >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    journalctl -u alammoba-api -n 100 --no-pager
    restore_previous
  fi
  sleep 2
done

if ! curl --fail --silent -H "Host: $DOMAIN" http://127.0.0.1/ >/dev/null; then
  restore_previous
fi

echo "Deployed release $RELEASE_ID for $DOMAIN"
echo "API check: http://127.0.0.1:8080/api/v1/status"
echo "Frontend root: /var/www/alammoba"
