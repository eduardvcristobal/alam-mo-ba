# Alam Mo Ba? deployment runbook

This runbook targets the existing Google Compute Engine VM `apexmedsuite` in
project `mystore-510802`, zone `asia-east1-b`. It documents a single-VM
deployment: Nginx serves the built frontend and proxies `/api/` to Spring Boot;
PostgreSQL listens only on the VM itself. This keeps initial infrastructure
simple. It also means the VM is a single point of failure, so keep database
backups off the VM.

## Current server inspection

Read-only inspection on 2026-11-06 found:

- Ubuntu 24.04.5 LTS, machine type `e2-standard-2` (2 vCPUs, 8 GB RAM).
- 50 GB boot disk, with about 46 GB free at inspection.
- No Java, PostgreSQL, Docker, or Nginx installed; only SSH was listening.
- The project's ingress firewall had SSH, RDP, ICMP, and internal rules, but no
  HTTP/HTTPS rule.
- The VM has a public external IP. Reserve/assign a static IP before publishing
  DNS; the currently assigned address may change if released/recreated.

No server, firewall, DNS, OAuth, or database changes were made during that
inspection.

## Important release gates

Do these before serving real learners:

1. Review and merge the intended code to `main`; the checked-out working tree
   had local uncommitted UI changes when this runbook was written. Deploy a
   known commit, not an uncommitted workspace.
   The last recorded Playwright run had failures as well as passes; repeat the
   end-to-end suite against a live backend and resolve or explicitly review
   those failures before production release.
2. The operations acceptance document says production is **NO-GO** pending
   privileged role provisioning, live Google identity/network verification,
   independent editorial review, privacy/legal review (including minors,
   retention and deletion), and real-environment accessibility/operations
   acceptance. See `docs/M1.3-OPERATIONS-ACCEPTANCE.md`.
3. `backend/src/main/resources/application.yml` currently has
   `server.error.include-message: always`. Change this to `never` for
   production and rebuild the API so internal exception messages are not
   returned to users.
4. Guest rate limits are database-backed for admin login, but guest request
   throttling is process-local. This one-VM setup avoids cross-replica
   inconsistency; still add edge/ingress rate limits before significant public
   traffic.
5. Choose the learner account policy deliberately. Public account registration
   is disabled by default. Keep it disabled if learners use guest mode; enable
   it only after deciding the privacy and data-retention policy.

## Values and prerequisites

Replace these placeholders as you follow the guide:

| Placeholder | Example / source |
|---|---|
| `YOUR_DOMAIN` | A domain you control, such as `learn.example.org` |
| `YOUR_GOOGLE_WEB_CLIENT_ID` | OAuth 2.0 web client ID from Google Auth Platform |
| `YOUR_ADMIN_GOOGLE_EMAIL` | The exact verified Google email that should bootstrap `SUPER_ADMIN` |
| `YOUR_DB_PASSWORD` | A newly generated, unique database password |

You need project Editor/Compute/Network permissions for cloud configuration,
SSH access through IAP, a domain whose DNS you can edit, and the Google OAuth
client configured for the production domain. Build artifacts locally from the
approved Git commit using Node.js 22, Java 17, and Maven 3.9+.

## Automated deployment script

The repository includes `deploy_gce.sh` and its remote installer at
`scripts/deploy_gce_remote.sh`. The script runs locally, builds the frontend
and API, runs `npm test` and `mvn clean verify`, uploads the artifacts over
IAP, installs Java/PostgreSQL/Nginx on the VM, creates or updates the local
database role, and deploys the services. It refuses to deploy a dirty working
tree and requires typing `DEPLOY` before changing the VM.

Before running it, complete the static IP, DNS, web firewall, IAP SSH, and
Google OAuth setup in sections 1 and 7 below. The script does **not** modify
Google Cloud firewall rules, static IP assignment, DNS, OAuth client settings,
or TLS certificates. After the first successful admin bootstrap, remove
`PLATFORM_ADMIN_EMAIL` from `/etc/alammoba/api.env`; for later deployments,
omit `--admin-email` so it remains empty.

From the repository root, after committing the release:

```sh
./deploy_gce.sh \
  --domain YOUR_DOMAIN
```

The script reads the Google client ID and bootstrap email from the local
frontend/backend `.env` files if those flags are omitted. You can explicitly
pass `--google-client-id CLIENT_ID` and `--admin-email EMAIL` to override them.
Pass `--no-admin-bootstrap` on later deployments after removing the bootstrap
email, so the script leaves `PLATFORM_ADMIN_EMAIL` empty. The script prompts
for the PostgreSQL password; if left blank it generates one and stores it
only in the root-only server environment file without printing it. The script sets the API to listen on
localhost and suppresses Spring error messages in production.

The script deploys HTTP first. Once DNS points to the VM and inbound TCP 80/443
is enabled, connect to the VM and run the Certbot commands in section 6 to
enable HTTPS. Do not send learners to the site before that HTTPS check passes.

## 1. Prepare the VM network and DNS

In Google Cloud Console, confirm the VM is `apexmedsuite` in `asia-east1-b`.

1. Reserve a **static external IPv4 address** in `asia-east1` and assign it to
   this VM. Record it as `STATIC_IP`.
2. Add a DNS `A` record for `YOUR_DOMAIN` pointing to `STATIC_IP`. Wait for DNS
   to resolve before requesting a certificate.
3. Add a network tag such as `alam-mo-ba-web` to the VM.
4. Create an ingress firewall rule targeting only that tag: TCP ports `80` and
   `443`, source `0.0.0.0/0`. Do not expose PostgreSQL port `5432` or the Java
   port `8080`.
5. SSH currently has a broad `0.0.0.0/0` rule in the default network. First
   confirm IAP SSH works. Then replace broad SSH access with TCP `22` from the
   IAP TCP forwarding range `35.235.240.0/20`, or use a carefully restricted
   administrator IP range. Avoid locking yourself out; keep an active IAP
   session while changing this rule. The default network also has a broad RDP
   rule for TCP `3389`; remove it if this Linux VM does not need RDP.

## 2. Install server packages

Connect from a local terminal:

```sh
gcloud compute ssh apexmedsuite \
  --project=mystore-510802 \
  --zone=asia-east1-b \
  --tunnel-through-iap
```

On the VM, install the runtime and services:

```sh
sudo apt update
sudo apt install -y openjdk-17-jre-headless postgresql postgresql-contrib nginx rsync
sudo systemctl enable --now postgresql nginx
```

Confirm Java, PostgreSQL, and Nginx are active before continuing:

```sh
java -version
sudo systemctl --no-pager --full status postgresql nginx
```

## 3. Create a local-only PostgreSQL database

PostgreSQL should listen on localhost only. Do not add a public ingress rule for
5432. Create an app-specific role and database, then set its password at the
interactive prompt:

```sh
sudo -u postgres psql
```

At the `psql` prompt:

```sql
CREATE ROLE alammoba LOGIN;
CREATE DATABASE alammoba OWNER alammoba;
\password alammoba
\q
```

Use the same password later in the protected backend environment file. Verify
that PostgreSQL is not listening on a public address:

```sh
sudo ss -lntp | grep 5432
```

The expected listener is `127.0.0.1:5432` (and possibly `[::1]:5432`). On
first API startup, Flyway runs the schema migrations automatically. Back up
the database to a bucket or another off-VM location; a backup stored only on
the VM does not protect against VM/disk loss. A new database contains schema
but no published learning content; seed desired facts and quizzes through the
authenticated platform admin UI, then complete the normal source review,
approval, and publication workflow.

## 4. Build the approved application locally

From the repository root, first ensure you are on the approved commit. Run the
project quality gates before building release artifacts:

```sh
git status --short
git rev-parse HEAD
cd frontend
npm ci
npm test
VITE_API_BASE_URL=/api/v1 \
VITE_ADMIN_LOGIN_ENABLED=true \
VITE_ADMIN_GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID \
npm run build
cd ../backend
mvn clean verify
```

Check that the frontend build output exists at `frontend/dist/` and the
Spring Boot jar exists at `backend/target/alammoba-api-0.1.1-SNAPSHOT.jar`.
If the version changes, use the jar produced by the current `pom.xml` build.

The API is proxied same-origin, so keep `VITE_API_BASE_URL=/api/v1`; do not
embed a VM IP or secret in the frontend build. Frontend variables are public
after build. Only the Google web client ID belongs there, never database
credentials or bearer tokens.

Copy the artifacts to the VM from a local terminal (these commands are run
from the repository root):

```sh
gcloud compute ssh apexmedsuite --project=mystore-510802 --zone=asia-east1-b --tunnel-through-iap \
  --command='mkdir -p /tmp/alammoba-release'

gcloud compute scp backend/target/alammoba-api-0.1.1-SNAPSHOT.jar \
  apexmedsuite:/tmp/alammoba-release/alammoba-api.jar \
  --project=mystore-510802 --zone=asia-east1-b --tunnel-through-iap

gcloud compute scp --recurse frontend/dist \
  apexmedsuite:/tmp/alammoba-release \
  --project=mystore-510802 --zone=asia-east1-b --tunnel-through-iap
```

## 5. Install artifacts and configure the API

Back on the VM:

```sh
sudo install -d -o root -g root -m 0755 /opt/alammoba /var/www/alammoba
sudo install -o root -g root -m 0644 /tmp/alammoba-release/alammoba-api.jar /opt/alammoba/alammoba-api.jar
sudo rsync -a --delete /tmp/alammoba-release/dist/ /var/www/alammoba/
sudo install -d -o root -g root -m 0750 /etc/alammoba
sudo touch /etc/alammoba/api.env
sudo chown root:root /etc/alammoba/api.env
sudo chmod 600 /etc/alammoba/api.env
sudoedit /etc/alammoba/api.env
```

Enter the following in `api.env`, replacing placeholders. Do not put quotes
around values unless the value itself requires them:

```ini
PORT=8080
DB_URL=jdbc:postgresql://127.0.0.1:5432/alammoba
DB_USER=alammoba
DB_PASSWORD=YOUR_DB_PASSWORD
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
ADMIN_GOOGLE_LOGIN_ENABLED=true
PLATFORM_ADMIN_EMAIL=YOUR_ADMIN_GOOGLE_EMAIL
APP_ACCOUNT_REGISTRATION_ENABLED=false
CORS_ORIGIN=https://YOUR_DOMAIN
```

The admin UI build uses `VITE_ADMIN_LOGIN_ENABLED` and
`VITE_ADMIN_GOOGLE_CLIENT_ID`; the backend uses `ADMIN_GOOGLE_LOGIN_ENABLED`,
`GOOGLE_CLIENT_ID`, and (for first sign-in bootstrap)
`PLATFORM_ADMIN_EMAIL`. The bootstrap grants `SUPER_ADMIN` only to a Google
identity whose verified email exactly matches the configured email, on its
first admin sign-in. After successful bootstrap and sign-in verification,
remove `PLATFORM_ADMIN_EMAIL` from the server environment and restart the API.
Keep the email value private; never commit `api.env`.

Create a restricted systemd service:

```sh
sudo tee /etc/systemd/system/alammoba-api.service >/dev/null <<'EOF'
[Unit]
Description=Alam Mo Ba API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
EnvironmentFile=/etc/alammoba/api.env
WorkingDirectory=/opt/alammoba
ExecStart=/usr/bin/java -jar /opt/alammoba/alammoba-api.jar
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log /tmp

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now alammoba-api
sudo systemctl --no-pager --full status alammoba-api
sudo journalctl -u alammoba-api -n 100 --no-pager
```

If Spring cannot write to an expected path under those restrictions, investigate
the specific path and grant only the required access. Do not broadly disable
systemd hardening as a workaround.

## 6. Configure Nginx and HTTPS

Create `/etc/nginx/sites-available/alammoba`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name YOUR_DOMAIN;
    root /var/www/alammoba;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and validate it:

```sh
sudo ln -s /etc/nginx/sites-available/alammoba /etc/nginx/sites-enabled/alammoba
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

After DNS resolves to the static IP and port 80 is reachable, install a TLS
certificate:

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

Choose the HTTPS redirect option. Confirm automatic renewal is enabled with
`systemctl list-timers | grep certbot`. Then test `https://YOUR_DOMAIN` and
`https://YOUR_DOMAIN/api/v1/status` in a browser or with `curl`.

## 7. Configure Google sign-in

In Google Auth Platform / OAuth client configuration:

- Add `https://YOUR_DOMAIN` to **Authorized JavaScript origins**.
- Use the same Web client ID in the frontend build and backend environment.
- Ensure the consent screen and user audience are appropriate for the intended
  learners and administrators.

Rebuild and redeploy the frontend if the client ID or admin-login flag changes.
For the first admin sign-in, keep `PLATFORM_ADMIN_EMAIL` set to the intended
verified owner email, visit `https://YOUR_DOMAIN/admin`, and sign in with that
Google identity. Confirm `/api/v1/admin/me` reports `SUPER_ADMIN`; then remove
the bootstrap email from `/etc/alammoba/api.env` and restart the service:

```sh
sudoedit /etc/alammoba/api.env
sudo systemctl restart alammoba-api
```

Do not enable learner account registration until its privacy and retention
policy is approved. If enabled later, set
`APP_ACCOUNT_REGISTRATION_ENABLED=true` deliberately and restart the API.

## 8. Verify and operate

Check services and exposed listeners:

```sh
sudo systemctl is-active postgresql nginx alammoba-api
sudo ss -lntp
```

Expected public listeners are Nginx on `80`/`443`. PostgreSQL must be loopback
only, and Java should listen on `127.0.0.1:8080` or be blocked from the public
network by the cloud firewall. Verify the learner frontend, API-backed facts,
quiz submission, Google sign-in, admin authorization, logout, migrations,
backup/restore procedure, and both mobile/tablet desktop layouts.

Useful logs:

```sh
sudo journalctl -u alammoba-api -f
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
sudo -u postgres psql -d alammoba -c '\dt'
```

For each release, deploy only a tested commit: build artifacts, keep a copy of
the last known-good jar and frontend files, copy the new artifacts, restart the
API, and check logs and key flows. To roll back, restore the previous jar and
frontend build and restart Nginx/API. Take a PostgreSQL backup before schema
changes; Flyway migrations are automatic and older migrations should not be
edited after release.

## Cost and recovery notes

- A VM and persistent disk continue to incur costs while running, including
  during idle time. Check the Billing dashboard and create a budget alert; an
  alert is not a hard spending cap.
- The free-trial account normally stops resources when credit is exhausted or
  the 90-day trial ends unless upgraded. Do not treat that behavior as a backup
  or availability plan.
- Keep encrypted database backups outside this VM and periodically test restore.
- A single VM is not highly available. Cloud SQL, managed instance groups, or a
  second zone can be considered when reliability needs justify added cost.
