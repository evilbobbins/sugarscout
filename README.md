# SugarScout

SugarScout is a private, single-user insulin, blood-glucose, food, and carbohydrate tracker for self-hosting on a trusted home network. It runs as one Docker container backed by a persistent SQLite database.

> **Important:** SugarScout is a personal journal, not a medical device. It does not provide dosing advice, clinical alerts, diagnosis, or emergency guidance. Always follow your healthcare team's instructions.

## Features

### Fast daily logging

- Insulin entries with type, units, timestamp, and notes.
- Default insulin types: **Novorapid** and **Humulin**; add your own in Admin Settings.
- Current-regimen presets: confirm once to log a scheduled dose at the current time, without opening the manual form.
- Collapsed manual insulin form for exceptional or adjusted doses.
- Blood-glucose tracking with configurable `mg/dL` or `mmol/L` display units.
- Food and carbohydrate entries: meal, carbohydrate grams, serving size, tags, and notes.
- Reuse a prior food entry to log a commonly eaten meal again at the current time.
- Collapsed, searchable entry history on every logging page.

### Overview and insights

- Daily summary of insulin, carbohydrate total, and glucose-check count.
- Unified recent-activity timeline.
- Current regimen view with total daily units.
- Glucose and insulin charts with 1-day, 1-week, 1-month, and all-time ranges.
- Personal glucose target range displayed as a non-diagnostic status and chart band.

### Reminders, backups, and management

- Daily browser reminders while SugarScout is open; notification permission is requested in Admin Settings.
- JSON backup and restore with **Merge** and **Replace** modes.
- Stable UUIDs in new backups make repeat merges idempotent without collapsing intentionally identical entries.
- CSV export for spreadsheet or clinician-friendly review.
- Bulk-delete insulin, glucose, or food entries by date range.
- Insulin types, regimen, glucose unit/targets, reminders, and password management in Admin Settings.

### Privacy and access

- First-run local-account setup with a 10-character minimum password.
- Passwords stored only as salted `scrypt` hashes.
- Signed, `HttpOnly`, same-site session cookies; rate-limited login attempts and an optional 30-day “Remember me” session on the same device.
- The Compose configuration exposes port 8000 so devices on the same trusted home network can connect.
- Accessible focus treatment and reduced-motion support.

## Run with Docker Compose

### Requirements

- Docker Desktop or Docker Engine with Compose.
- A trusted home network if accessing from other devices.

```sh
git clone https://github.com/evilbobbins/sugarscout.git
cd sugarscout
docker compose up -d --build
```

Open `http://localhost:8000` on the host, or `http://<host-lan-ip>:8000` on another device. On the first visit, create the local account.

Generate a session secret with a password manager or:

```sh
openssl rand -base64 48
```

By default, SugarScout generates a session secret once and stores it in the persistent data directory, so remembered sessions survive container restarts. To manage the secret yourself, set `SESSION_SECRET` when starting the container. The database persists at `./data/app.db`.

### Run the published image

The Docker Hub image is published for `linux/amd64`:

```sh
docker run -d --name sugarscout \
  -p 8000:8000 \
  -v sugarscout-data:/app/data \
  --restart unless-stopped \
  evilbobbins/sugarscout:latest
```

For a reproducible release, use the Git commit tag instead of `latest`, for example `evilbobbins/sugarscout:b740fba`.

### Network and PWA note

The default home-network URL uses HTTP. Login and health data are therefore not encrypted in transit; keep the app on a trusted local network and do not port-forward it to the internet.

SugarScout includes a web-app manifest and offline app shell. Browsers require HTTPS before a phone can install the app or run its service worker on a LAN URL. `localhost` is the usual exception.

## Account recovery

While signed in, use **Admin Settings → Change Password**.

If you are locked out, this command removes only the local login account. It does **not** delete insulin, glucose, food, reminder, or backup data. Restart or refresh SugarScout afterward and create a new account.

```sh
docker compose exec glucotrack python reset_account.py --reset-account
```

## Data, import, and migration behavior

- SQLite schema changes are applied automatically on startup.
- Existing records receive UUIDs during migration; no tracked health entries are removed by that migration.
- JSON **Merge** adds records not already identified by UUID. Older backups without UUIDs use a value-based compatibility fallback.
- JSON **Replace** clears the tracked data tables before importing the backup. Export a backup first.
- Insulin types supplied by the application are seeded only when missing; user-created types are preserved.

## API summary

All tracker endpoints require an authenticated browser session.

| Area | Endpoints |
| --- | --- |
| Authentication | `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/change-password` |
| Tracking | `GET/POST/PUT /api/dosage`, `/api/levels`, `/api/food`; `DELETE /api/{table}/{id}` |
| Configuration | `/api/insulin_types`, `/api/current_dosage`, `/api/settings`, `/api/reminders` |
| Data tools | `GET /api/export`, `GET /api/export.csv`, `POST /api/import?mode=merge|replace`, `POST /api/delete-by-date` |

## Development and tests

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| Storage | SQLite |
| Packaging | Docker, Docker Compose |

Build locally:

```sh
docker compose build
```

Run the backend regression tests in an isolated temporary database:

```sh
docker run --rm -e DATABASE_PATH=/tmp/sugarscout-test.db \
  --entrypoint sh sugarscout-glucotrack \
  -c 'cd /app && python -m unittest discover -s tests'
```

## Project layout

```text
backend/
  main.py              FastAPI application, models, migrations, and routes
  reset_account.py     Local account-recovery utility
  tests/               Regression tests
frontend/
  public/              Logo, PWA manifest, and service worker
  src/                 React interface and styles
Dockerfile              Production multi-stage build
docker-compose.yml     Local deployment and persistent database mount
```
