# SugarScout: Insulin & Food Tracker

**SugarScout** is a modern, mobile-first web application designed to help individuals track their insulin dosages, blood glucose levels, and daily food intake. It features a vibrant, glassmorphic UI, interactive analytics, and a robust backend with persistent data storage, making it perfect for self-hosting via Docker.

---

## 🚀 Core Features

### 📊 Tracking & Logging
- **Insulin Dosage Log**: Record administered insulin with specific types (via dropdown), units (supports decimals like `6.1`), date, time, and notes.
- **Blood Glucose Levels**: Track blood sugar readings with precise decimal inputs and timestamps.
- **Food Diary**: Log daily meals and meals with optional notes.
- **Current Regimen**: View and manage your prescribed daily insulin routine (e.g., "Breakfast - 10 Units", "Bedtime - 15 Units").

### 📈 Analytics & Visualization
- **Interactive Graphs**: Visualize insulin levels (Line Chart) and logged dosages (Bar Chart).
- **Time-Scale Filtering**: Toggle graph views between 1 Day, 1 Week, 1 Month, or All Time.
- **Smart Scaling**: Y-axes automatically adjust to properly display decimal values.

### ️ Administration & Customization
- **Insulin Type Manager**: Create and manage a master list of insulin types (e.g., Novorapid, Lantus) which populate the dropdown menus across the app.
- **Regimen Setup**: Easily add, view, and remove prescribed daily dosages linked to specific insulin types.

### 💾 Data Management
- **Export/Backup**: Download all app data (logs, regimen, settings) as a timestamped JSON file.
- **Import/Restore**: Restore data from a backup file with two modes:
  - **Merge**: Adds imported data to existing records.
  - **Replace**: ️ Deletes ALL existing data before importing (complete restore).

### 🎨 UI/UX Design
- **Glassmorphism Theme**: Translucent, frosted-glass cards and navigation over a smooth, animated candy-gradient background.
- **Mobile-First**: Bottom navigation bar for mobile devices, expanding to a sidebar for desktop screens.
- **Native Inputs**: Utilizes native HTML5 date/time pickers and decimal numeric keyboards on mobile devices.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React (Vite) | Component-based UI rendering |
| **Styling** | Tailwind CSS | Utility-first CSS for the glassmorphic design |
| **Charts** | Recharts | SVG-based interactive data visualization |
| **Backend** | FastAPI (Python) | High-performance REST API |
| **Database** | SQLite | Lightweight, persistent relational database |
| **ORM** | SQLAlchemy | Database modeling and query management |
| **Container**| Docker / Compose | Easy deployment and persistent volume mapping |

## Running locally

Start the application with Docker Compose:

```sh
docker compose up -d --build
```

Open `http://localhost:8000`. On the first visit, create the single local
account. Passwords must be at least 10 characters and are stored as salted
scrypt hashes, never as plaintext. The container listens on port 8000 on the
home network; open `http://<computer-ip-address>:8000` from another device.
Keep it on a trusted network only: HTTP does not encrypt traffic between the
device and SugarScout. Add HTTPS before exposing it beyond your home network.

To keep active sessions after container restarts, set a long random value for
`SESSION_SECRET` in your environment before starting Compose. Without it,
sessions are safely invalidated on restart and you simply sign in again.

```sh
SESSION_SECRET="replace-with-a-long-random-secret" docker compose up -d
```

The SQLite database is retained in `./data`. Back up the data from the Admin
screen before moving or rebuilding your host.

### Password recovery

While signed in, use **Admin Settings → Change Password**. If you are locked
out, the following command removes only the local login account; it does not
delete tracker entries or backups. Restart the app if it is running, then open
SugarScout and create a new account.

```sh
docker compose exec glucotrack python reset_account.py --reset-account
```

## Validation and tests

The app validates positive insulin and glucose values, required entry names,
and supported glucose units. Database upgrades add stable record UUIDs to
existing rows automatically; new backups use these UUIDs, so merging the same
backup is idempotent without treating two intentionally identical readings as
the same record.

Run the backend regression checks in Docker:

```sh
docker compose build
docker run --rm -e DATABASE_PATH=/tmp/sugarscout-test.db --entrypoint sh sugarscout-glucotrack -c 'cd /app && python -m unittest discover -s tests'
```

---

## 🗄️ Database Schema

The application uses SQLite with the following relational models:

1. **`insulin_dosage`**: Logs of administered insulin.
   - `id`, `timestamp`, `units` (Float), `insulin_type` (String), `notes`
2. **`insulin_level`**: Logs of blood glucose readings.
   - `id`, `timestamp`, `level` (Float), `notes`
3. **`food_diary`**: Logs of meals consumed.
   - `id`, `timestamp`, `meal_name` (String), `notes`
4. **`insulin_types`**: Master list for dropdowns.
   - `id`, `name` (String, Unique)
5. **`current_dosage`**: Prescribed daily regimen.
   - `id`, `name` (String), `insulin_type` (String), `dosage_units` (Float)

---

## 🌐 API Endpoints Overview

### Data Logging
- `GET/POST/PUT /api/dosage` - Manage insulin dosage logs.
- `GET/POST/PUT /api/levels` - Manage blood glucose logs.
- `GET/POST/PUT /api/food` - Manage food diary logs.
- `DELETE /api/{table}/{id}` - Generic delete endpoint for logs.

### Administration
- `GET/POST/DELETE /api/insulin_types` - Manage insulin type master list.
- `GET/POST/DELETE /api/current_dosage` - Manage daily prescribed regimen.

### Data Management
- `GET /api/export` - Exports entire database to JSON.
- `POST /api/import?mode={merge|replace}` - Imports JSON backup file.

---

## 📂 Project Structure
```yaml
sugarscout/
│
├── 📁 backend/
│   │
│   ├── 📄 main.py # FastAPI application, DB models, and routes
│   └── 📄 requirements.txt # Python dependencies
│
├──  📁 frontend/
│    │
│    ├── 📁 public/
│    ├── 📁 src/
│    │
│    │   ├── 📄 App.jsx # Main React application and UI components
│    │   ├── 📄 main.jsx # React entry point
│    │   └── 📄 index.css # Tailwind directives and custom animations
│    │
│    ├── 📄 index.html # HTML shell
│    ├── 📄 package.json # Node dependencies
│    ├── 📄 tailwind.config.js # Tailwind configuration
│    └── 📄 vite.config.js # Vite build configuration
│
├── 📁 data/ # Persistent Docker volume mount (SQLite DB)
│
├── 📄 docker-compose.yml # Docker orchestration
└── 📄 Dockerfile # Multi-stage build (Node -> Python)
```
