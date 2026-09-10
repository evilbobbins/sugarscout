import os
import json
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Database Setup
DB_PATH = "/app/data/app.db"
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class EntryBase(Base):
    __abstract__ = True
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(String)
    notes = Column(String, nullable=True)

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

class InsulinType(Base):
    __tablename__ = "insulin_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

class CurrentDosage(Base):
    __tablename__ = "current_dosage"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    insulin_type = Column(String, nullable=False)
    dosage_units = Column(Float, nullable=False)

Base.metadata.create_all(bind=engine)

# Pydantic Schemas
class DosageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    timestamp: datetime
    units: float
    insulin_type: str
    notes: Optional[str] = None

class LevelSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    timestamp: datetime
    level: float
    notes: Optional[str] = None

class FoodSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    timestamp: datetime
    meal_name: str
    notes: Optional[str] = None

class InsulinTypeSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    name: str

class CurrentDosageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: Optional[int] = None
    name: str
    insulin_type: str
    dosage_units: float

# FastAPI App
app = FastAPI()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def update_db_item(db, model, id, data):
    item = db.query(model).filter(model.id == id).first()
    if not item: raise HTTPException(404, "Item not found")
    item_data = data.model_dump(exclude={'id'}, exclude_unset=True)
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
    item_data = data.model_dump(exclude={'id'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
    item = InsulinDosage(**item_data); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/dosage/{id}", response_model=DosageSchema)
def update_dosage(id: int, data: DosageSchema, db: Session = Depends(get_db)): return update_db_item(db, InsulinDosage, id, data)

# --- LEVELS ---
@app.get("/api/levels", response_model=list[LevelSchema])
def get_levels(db: Session = Depends(get_db)): return db.query(InsulinLevel).order_by(InsulinLevel.timestamp.desc()).all()
@app.post("/api/levels", response_model=LevelSchema)
def add_level(data: LevelSchema, db: Session = Depends(get_db)):
    item_data = data.model_dump(exclude={'id'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
    item = InsulinLevel(**item_data); db.add(item); db.commit(); db.refresh(item); return item
@app.put("/api/levels/{id}", response_model=LevelSchema)
def update_level(id: int, data: LevelSchema, db: Session = Depends(get_db)): return update_db_item(db, InsulinLevel, id, data)

# --- FOOD ---
@app.get("/api/food", response_model=list[FoodSchema])
def get_food(db: Session = Depends(get_db)): return db.query(FoodDiary).order_by(FoodDiary.timestamp.desc()).all()
@app.post("/api/food", response_model=FoodSchema)
def add_food(data: FoodSchema, db: Session = Depends(get_db)):
    item_data = data.model_dump(exclude={'id'}, exclude_unset=True); item_data['timestamp'] = data.timestamp.isoformat()
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

@app.post("/api/import")
async def import_data(file: UploadFile = File(...), mode: str = "merge", db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        data = json.loads(contents.decode('utf-8'))
        if "version" not in data: raise HTTPException(400, "Invalid import file")
        if mode == "replace":
            db.query(InsulinDosage).delete(); db.query(InsulinLevel).delete()
            db.query(FoodDiary).delete(); db.query(InsulinType).delete()
            db.query(CurrentDosage).delete(); db.commit()
        
        if "insulin_types" in data:
            for item in data["insulin_types"]:
                if not db.query(InsulinType).filter(InsulinType.name == item["name"]).first():
                    db.add(InsulinType(name=item["name"]))
            db.commit()
        if "insulin_dosage" in data:
            for item in data["insulin_dosage"]:
                db.add(InsulinDosage(timestamp=item.get("timestamp"), units=item.get("units", 0), insulin_type=item.get("insulin_type", ""), notes=item.get("notes")))
            db.commit()
        if "insulin_levels" in data:
            for item in data["insulin_levels"]:
                db.add(InsulinLevel(timestamp=item.get("timestamp"), level=item.get("level", 0), notes=item.get("notes")))
            db.commit()
        if "food_diary" in data:
            for item in data["food_diary"]:
                db.add(FoodDiary(timestamp=item.get("timestamp"), meal_name=item.get("meal_name", ""), notes=item.get("notes")))
            db.commit()
        if "current_dosage" in data:
            for item in data["current_dosage"]:
                db.add(CurrentDosage(name=item.get("name", ""), insulin_type=item.get("insulin_type", ""), dosage_units=item.get("dosage_units", 0)))
            db.commit()
        return {"status": "success", "message": f"Data imported successfully in {mode} mode"}
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

# Serve React Frontend
if os.path.exists("./static"):
    app.mount("/assets", StaticFiles(directory="./static/assets"), name="static-assets")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = f"./static/{full_path}"
        if os.path.exists(file_path) and os.path.isfile(file_path): return FileResponse(file_path)
        return FileResponse("./static/index.html")