import os
import json
import base64
import csv
import hashlib
import hmac
import io
import secrets
from datetime import datetime
from datetime import timedelta, timezone
from typing import Literal, Optional
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Depends, Request, Response, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, Column, Integer, String, Float, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Database Setup
DB_PATH = os.getenv("DATABASE_PATH")
if not DB_PATH:
    # Docker supplies /app/data as a mounted volume.  A source checkout uses a
    # local, writable directory instead, so `uvicorn main:app` also works.
    docker_data_dir = "/app/data"
    DB_PATH = (
        os.path.join(docker_data_dir, "app.db")
        if os.path.isdir(docker_data_dir)
        else os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "app.db")
    )
if db_dir := os.path.dirname(DB_PATH):
    os.makedirs(db_dir, exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class EntryBase(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(String)
    notes = Column(String, nullable=True)
    record_uuid = Column(String, unique=True, index=True, nullable=False, default=lambda: str(uuid4()))

class InsulinDosage(EntryBase):
    __tablename__ = "insulin_dosage"
    units = Column(Float)
    insulin_type = Column(String)

class InsulinLevel(EntryBase):
    __tablename__ = "insulin_level"
    level = Column(Float)

class FoodDiary(EntryBase):
    __tablename__ = "food_diary"
    meal_name = Column(String)
    carbs = Column(Float, nullable=True)
    serving_size = Column(String, nullable=True)
    tags = Column(String, nullable=True)

class InsulinType(Base):
    __tablename__ = "insulin_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    record_uuid = Column(String, unique=True, index=True, nullable=False, default=lambda: str(uuid4()))

class CurrentDosage(Base):
    __tablename__ = "current_dosage"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    insulin_type = Column(String, nullable=False)
    dosage_units = Column(Float, nullable=False)
    record_uuid = Column(String, unique=True, index=True, nullable=False, default=lambda: str(uuid4()))

class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True)
    glucose_unit = Column(String, nullable=False, default="mg/dL")
    target_low = Column(Float, nullable=True)
    target_high = Column(Float, nullable=True)

class Reminder(Base):
    __tablename__ = "reminders"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    reminder_time = Column(String, nullable=False)
    days = Column(String, nullable=False, default="Mon,Tue,Wed,Thu,Fri,Sat,Sun")
    enabled = Column(Integer, nullable=False, default=1)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)

Base.metadata.create_all(bind=engine)

def migrate_legacy_database():
    """Add stable record identifiers to databases created before UUID imports."""
    tables = ("insulin_dosage", "insulin_level", "food_diary", "insulin_types", "current_dosage")
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in tables:
            columns = {column["name"] for column in inspector.get_columns(table)}
            if "record_uuid" not in columns:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN record_uuid VARCHAR"))
            rows = connection.execute(text(f"SELECT id FROM {table} WHERE record_uuid IS NULL")).fetchall()
            for row in rows:
                connection.execute(
                    text(f"UPDATE {table} SET record_uuid = :record_uuid WHERE id = :id"),
                    {"record_uuid": str(uuid4()), "id": row.id},
                )
            connection.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ux_{table}_record_uuid ON {table}(record_uuid)"))
        for table, additions in {"food_diary": {"carbs": "FLOAT", "serving_size": "VARCHAR", "tags": "VARCHAR"}, "app_settings": {"target_low": "FLOAT", "target_high": "FLOAT"}}.items():
            columns = {column["name"] for column in inspector.get_columns(table)}
            for column, column_type in additions.items():
                if column not in columns:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))

migrate_legacy_database()

def seed_default_insulin_types():
    db = SessionLocal()
    try:
        for name in ("Novorapid", "Humulin"):
            if not db.query(InsulinType).filter(InsulinType.name == name).first():
                db.add(InsulinType(name=name))
        db.commit()
    finally:
        db.close()

seed_default_insulin_types()

# Pydantic Schemas
class DosageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    record_uuid: Optional[str] = None
    timestamp: datetime
    units: float = Field(gt=0)
    insulin_type: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=1000)

class LevelSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    record_uuid: Optional[str] = None
    timestamp: datetime
    level: float = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=1000)

class FoodSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    record_uuid: Optional[str] = None
    timestamp: datetime
    meal_name: str = Field(min_length=1, max_length=200)
    carbs: Optional[float] = Field(default=None, ge=0)
    serving_size: Optional[str] = Field(default=None, max_length=100)
    tags: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)

class InsulinTypeSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    record_uuid: Optional[str] = None
    name: str = Field(min_length=1, max_length=100)

class CurrentDosageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    record_uuid: Optional[str] = None
    name: str = Field(min_length=1, max_length=100)
    insulin_type: str = Field(min_length=1, max_length=100)
    dosage_units: float = Field(gt=0)

class SettingsSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    glucose_unit: Literal["mg/dL", "mmol/L"]
    target_low: Optional[float] = Field(default=None, gt=0)
    target_high: Optional[float] = Field(default=None, gt=0)

class ReminderSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    title: str = Field(min_length=1, max_length=100)
    reminder_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    days: str = Field(min_length=3, max_length=40)
    enabled: bool = True

class BulkDeleteSchema(BaseModel):
    table: Literal["dosage", "levels", "food"]
    start: datetime
    end: datetime

class CredentialsSchema(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=10, max_length=256)

class PasswordChangeSchema(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)

# FastAPI App
app = FastAPI()
SESSION_SECRET = os.getenv("SESSION_SECRET", secrets.token_urlsafe(48)).encode()
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
SESSION_DURATION = timedelta(hours=8)
LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_ATTEMPTS = 5
failed_logins: dict[str, list[datetime]] = {}

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$" + base64.b64encode(salt + digest).decode()

def password_matches(password: str, encoded: str) -> bool:
    try:
        _, payload = encoded.split("$", 1)
        raw = base64.b64decode(payload)
        return hmac.compare_digest(hashlib.scrypt(password.encode(), salt=raw[:16], n=2**14, r=8, p=1), raw[16:])
    except (ValueError, TypeError):
        return False

def make_session(username: str) -> str:
    expires = int((datetime.now(timezone.utc) + SESSION_DURATION).timestamp())
    payload = f"{username}:{expires}".encode()
    signature = hmac.new(SESSION_SECRET, payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + b"." + signature).decode()

def session_username(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode())
        payload, signature = raw.rsplit(b".", 1)
        if not hmac.compare_digest(hmac.new(SESSION_SECRET, payload, hashlib.sha256).digest(), signature):
            return None
        username, expires = payload.decode().rsplit(":", 1)
        return username if int(expires) > int(datetime.now(timezone.utc).timestamp()) else None
    except (ValueError, UnicodeDecodeError):
        return None

def set_session(response: Response, username: str):
    response.set_cookie("sugarscout_session", make_session(username), httponly=True, secure=SESSION_COOKIE_SECURE, samesite="strict", max_age=int(SESSION_DURATION.total_seconds()), path="/")

@app.middleware("http")
async def protect_api(request: Request, call_next):
    public_paths = {"/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/logout"}
    if request.url.path.startswith("/api/") and request.url.path not in public_paths:
        if not session_username(request.cookies.get("sugarscout_session")):
            return JSONResponse({"detail": "Authentication required"}, status_code=401)
    return await call_next(request)

@app.get("/api/auth/status")
def auth_status(request: Request, db: Session = Depends(get_db)):
    return {"setup_required": db.query(User).count() == 0, "authenticated": bool(session_username(request.cookies.get("sugarscout_session")))}

@app.post("/api/auth/setup")
def setup_auth(data: CredentialsSchema, response: Response, db: Session = Depends(get_db)):
    if db.query(User).count():
        raise HTTPException(409, "Initial setup has already been completed")
    db.add(User(username=data.username, password_hash=password_hash(data.password)))
    db.commit()
    set_session(response, data.username)
    return {"status": "created"}

@app.post("/api/auth/login")
def login(data: CredentialsSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    address = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    attempts = [attempt for attempt in failed_logins.get(address, []) if now - attempt < LOGIN_WINDOW]
    if len(attempts) >= LOGIN_ATTEMPTS:
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not password_matches(data.password, user.password_hash):
        failed_logins[address] = attempts + [now]
        raise HTTPException(401, "Invalid username or password")
    failed_logins.pop(address, None)
    set_session(response, user.username)
    return {"status": "authenticated"}

@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("sugarscout_session", path="/")
    return {"status": "logged_out"}

@app.post("/api/auth/change-password")
def change_password(data: PasswordChangeSchema, request: Request, db: Session = Depends(get_db)):
    username = session_username(request.cookies.get("sugarscout_session"))
    user = db.query(User).filter(User.username == username).first() if username else None
    if not user:
        raise HTTPException(401, "Authentication required")
    if not password_matches(data.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    user.password_hash = password_hash(data.new_password)
    db.commit()
    return {"status": "password_changed"}

def update_db_item(db, model, id, data):
    item = db.query(model).filter(model.id == id).first()
    if not item: raise HTTPException(404, "Item not found")
    item_data = data.model_dump(exclude={'id', 'record_uuid'}, exclude_unset=True)
    item_data['timestamp'] = data.timestamp.isoformat()
    for key, value in item_data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item

# --- DOSAGE ---
@app.get("/api/dosage", response_model=list[DosageSchema])
def get_dosage(db: Session = Depends(get_db)): return db.query(InsulinDosage).order_by(InsulinDosage.timestamp.desc()).all()
@app.post("/api/dosage", response_model=DosageSchema)
def add_dosage(data: DosageSchema, db: Session = Depends(get_db)):
    item_data = data.model_dump(exclude={'id', 'record_uuid'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
    item = InsulinDosage(**item_data); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/dosage/{id}", response_model=DosageSchema)
def update_dosage(id: int, data: DosageSchema, db: Session = Depends(get_db)): return update_db_item(db, InsulinDosage, id, data)

# --- LEVELS ---
@app.get("/api/levels", response_model=list[LevelSchema])
def get_levels(db: Session = Depends(get_db)): return db.query(InsulinLevel).order_by(InsulinLevel.timestamp.desc()).all()
@app.post("/api/levels", response_model=LevelSchema)
def add_level(data: LevelSchema, db: Session = Depends(get_db)):
    item_data = data.model_dump(exclude={'id', 'record_uuid'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
    item = InsulinLevel(**item_data); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/levels/{id}", response_model=LevelSchema)
def update_level(id: int, data: LevelSchema, db: Session = Depends(get_db)): return update_db_item(db, InsulinLevel, id, data)

# --- FOOD ---
@app.get("/api/food", response_model=list[FoodSchema])
def get_food(db: Session = Depends(get_db)): return db.query(FoodDiary).order_by(FoodDiary.timestamp.desc()).all()
@app.post("/api/food", response_model=FoodSchema)
def add_food(data: FoodSchema, db: Session = Depends(get_db)):
    item_data = data.model_dump(exclude={'id', 'record_uuid'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
    item = FoodDiary(**item_data); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/food/{id}", response_model=FoodSchema)
def update_food(id: int, data: FoodSchema, db: Session = Depends(get_db)): return update_db_item(db, FoodDiary, id, data)

# --- INSULIN TYPES ---
@app.get("/api/insulin_types", response_model=list[InsulinTypeSchema])
def get_insulin_types(db: Session = Depends(get_db)): return db.query(InsulinType).order_by(InsulinType.name).all()
@app.post("/api/insulin_types", response_model=InsulinTypeSchema)
def add_insulin_type(data: InsulinTypeSchema, db: Session = Depends(get_db)):
    if db.query(InsulinType).filter(InsulinType.name == data.name).first(): raise HTTPException(400, "Type already exists")
    item = InsulinType(name=data.name); db.add(item); db.commit(); db.refresh(item); return item
@app.delete("/api/insulin_types/{id}")
def delete_insulin_type(id: int, db: Session = Depends(get_db)):
    item = db.query(InsulinType).filter(InsulinType.id == id).first()
    if not item: raise HTTPException(404, "Not found")
    db.delete(item); db.commit(); return {"status": "deleted"}

# --- CURRENT DOSAGE (REGIMEN) ---
@app.get("/api/current_dosage", response_model=list[CurrentDosageSchema])
def get_current_dosage(db: Session = Depends(get_db)): return db.query(CurrentDosage).all()
@app.post("/api/current_dosage", response_model=CurrentDosageSchema)
def add_current_dosage(data: CurrentDosageSchema, db: Session = Depends(get_db)):
    item = CurrentDosage(name=data.name, insulin_type=data.insulin_type, dosage_units=data.dosage_units)
    db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/current_dosage/{id}", response_model=CurrentDosageSchema)
def update_current_dosage(id: int, data: CurrentDosageSchema, db: Session = Depends(get_db)):
    item = db.query(CurrentDosage).filter(CurrentDosage.id == id).first()
    if not item: raise HTTPException(404, "Not found")
    item.name = data.name
    item.insulin_type = data.insulin_type
    item.dosage_units = data.dosage_units
    db.commit()
    db.refresh(item)
    return item
@app.delete("/api/current_dosage/{id}")
def delete_current_dosage(id: int, db: Session = Depends(get_db)):
    item = db.query(CurrentDosage).filter(CurrentDosage.id == id).first()
    if not item: raise HTTPException(404, "Not found")
    db.delete(item); db.commit(); return {"status": "deleted"}

# --- SETTINGS ---
@app.get("/api/settings", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    settings = db.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1, glucose_unit="mg/dL")
        db.add(settings); db.commit(); db.refresh(settings)
    return settings

@app.put("/api/settings", response_model=SettingsSchema)
def update_settings(data: SettingsSchema, db: Session = Depends(get_db)):
    if data.target_low and data.target_high and data.target_low >= data.target_high:
        raise HTTPException(422, "The lower target must be below the upper target")
    settings = db.get(AppSettings, 1) or AppSettings(id=1)
    settings.glucose_unit = data.glucose_unit
    settings.target_low = data.target_low
    settings.target_high = data.target_high
    db.add(settings); db.commit(); db.refresh(settings)
    return settings

# --- REMINDERS ---
@app.get("/api/reminders", response_model=list[ReminderSchema])
def get_reminders(db: Session = Depends(get_db)): return db.query(Reminder).order_by(Reminder.reminder_time).all()
@app.post("/api/reminders", response_model=ReminderSchema)
def add_reminder(data: ReminderSchema, db: Session = Depends(get_db)):
    item = Reminder(**data.model_dump(exclude={"id"})); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/reminders/{id}", response_model=ReminderSchema)
def update_reminder(id: int, data: ReminderSchema, db: Session = Depends(get_db)):
    item = db.get(Reminder, id)
    if not item: raise HTTPException(404, "Reminder not found")
    for key, value in data.model_dump(exclude={"id"}).items(): setattr(item, key, value)
    db.commit(); db.refresh(item); return item
@app.delete("/api/reminders/{id}")
def delete_reminder(id: int, db: Session = Depends(get_db)):
    item = db.get(Reminder, id)
    if not item: raise HTTPException(404, "Reminder not found")
    db.delete(item); db.commit(); return {"status": "deleted"}

# --- EXPORT / IMPORT ---
# FIXED: Updated to use Pydantic v2 syntax (model_validate and model_dump)
@app.get("/api/export")
def export_data(db: Session = Depends(get_db)):
    try:
        # Helper function to safely serialize SQLAlchemy models to JSON-compatible dicts
        def to_json_dict(schema, items):
            return [schema.model_validate(item).model_dump(mode='json') for item in items]

        data = {
            "export_date": datetime.utcnow().isoformat(),
            "version": "1.0",
            "insulin_dosage": to_json_dict(DosageSchema, db.query(InsulinDosage).all()),
            "insulin_levels": to_json_dict(LevelSchema, db.query(InsulinLevel).all()),
            "food_diary": to_json_dict(FoodSchema, db.query(FoodDiary).all()),
            "insulin_types": to_json_dict(InsulinTypeSchema, db.query(InsulinType).all()),
            "current_dosage": to_json_dict(CurrentDosageSchema, db.query(CurrentDosage).all())
        }
        return JSONResponse(content=data, media_type="application/json")
    except Exception as e:
        raise HTTPException(500, f"Export failed: {str(e)}")

@app.get("/api/export.csv")
def export_csv(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["type", "timestamp", "value", "detail", "carbs", "serving_size", "tags", "notes"])
    for item in db.query(InsulinDosage).all(): writer.writerow(["insulin", item.timestamp, item.units, item.insulin_type, "", "", "", item.notes or ""])
    for item in db.query(InsulinLevel).all(): writer.writerow(["blood_glucose", item.timestamp, item.level, "", "", "", "", item.notes or ""])
    for item in db.query(FoodDiary).all(): writer.writerow(["food", item.timestamp, "", item.meal_name, item.carbs or "", item.serving_size or "", item.tags or "", item.notes or ""])
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=sugarscout_export.csv"})

@app.post("/api/import")
async def import_data(file: UploadFile = File(...), mode: str = "merge", db: Session = Depends(get_db)):
    try:
        if mode not in {"merge", "replace"}:
            raise HTTPException(400, "mode must be 'merge' or 'replace'")
        contents = await file.read()
        data = json.loads(contents.decode('utf-8'))
        if "version" not in data: raise HTTPException(400, "Invalid import file")
        if mode == "replace":
            db.query(InsulinDosage).delete(); db.query(InsulinLevel).delete()
            db.query(FoodDiary).delete(); db.query(InsulinType).delete()
            db.query(CurrentDosage).delete(); db.commit()
        
        added = 0
        skipped = 0
        def add_from_backup(model, item, values):
            nonlocal added, skipped
            source_uuid = item.get("record_uuid")
            # New backups have a stable identity.  Legacy backups retain the
            # previous value-based fallback for safe, idempotent imports.
            existing = (
                db.query(model).filter_by(record_uuid=source_uuid).first()
                if source_uuid else db.query(model).filter_by(**values).first()
            )
            if model is InsulinType and not existing:
                existing = db.query(InsulinType).filter_by(name=values["name"]).first()
            if mode == "merge" and existing:
                skipped += 1
                return
            db.add(model(**values, record_uuid=source_uuid or str(uuid4())))
            added += 1

        for item in data.get("insulin_types", []):
            add_from_backup(InsulinType, item, {"name": item.get("name", "")})
        for item in data.get("insulin_dosage", []):
            add_from_backup(InsulinDosage, item, {"timestamp": item.get("timestamp"), "units": item.get("units", 0), "insulin_type": item.get("insulin_type", ""), "notes": item.get("notes")})
        for item in data.get("insulin_levels", []):
            add_from_backup(InsulinLevel, item, {"timestamp": item.get("timestamp"), "level": item.get("level", 0), "notes": item.get("notes")})
        for item in data.get("food_diary", []):
            add_from_backup(FoodDiary, item, {"timestamp": item.get("timestamp"), "meal_name": item.get("meal_name", ""), "carbs": item.get("carbs"), "serving_size": item.get("serving_size"), "tags": item.get("tags"), "notes": item.get("notes")})
        for item in data.get("current_dosage", []):
            add_from_backup(CurrentDosage, item, {"name": item.get("name", ""), "insulin_type": item.get("insulin_type", ""), "dosage_units": item.get("dosage_units", 0)})
        db.commit()
        return {"status": "success", "message": f"Data imported successfully in {mode} mode", "added": added, "skipped": skipped}
    except HTTPException:
        raise
    except json.JSONDecodeError: raise HTTPException(400, "Invalid JSON file")
    except Exception as e: db.rollback(); raise HTTPException(500, f"Import failed: {str(e)}")

# --- DELETE (General) ---
@app.delete("/api/{table}/{id}")
def delete_entry(table: str, id: int, db: Session = Depends(get_db)):
    models = {"dosage": InsulinDosage, "levels": InsulinLevel, "food": FoodDiary}
    if table not in models: raise HTTPException(400, "Invalid table")
    item = db.query(models[table]).filter(models[table].id == id).first()
    if not item: raise HTTPException(404, "Item not found")
    db.delete(item); db.commit(); return {"status": "deleted"}

@app.post("/api/delete-by-date")
def delete_by_date(data: BulkDeleteSchema, db: Session = Depends(get_db)):
    if data.start > data.end: raise HTTPException(422, "Start must be before end")
    model = {"dosage": InsulinDosage, "levels": InsulinLevel, "food": FoodDiary}[data.table]
    deleted = db.query(model).filter(model.timestamp >= data.start.isoformat(), model.timestamp <= data.end.isoformat()).delete()
    db.commit(); return {"status": "deleted", "count": deleted}

# Serve React Frontend
if os.path.exists("./static"):
    app.mount("/assets", StaticFiles(directory="./static/assets"), name="static-assets")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = f"./static/{full_path}"
        if os.path.exists(file_path) and os.path.isfile(file_path): return FileResponse(file_path)
        return FileResponse("./static/index.html")
