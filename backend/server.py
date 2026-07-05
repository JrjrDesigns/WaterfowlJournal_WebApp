from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import requests
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080  # 7 days

# Placeholder API keys
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "YOUR_OPENWEATHER_API_KEY_HERE")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "YOUR_STRIPE_SECRET_KEY_HERE")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ MODELS ============

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class User(BaseModel):
    id: str
    email: str
    name: str
    subscription_status: str = "free"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LocationCreate(BaseModel):
    name: str
    location_type: str  # marsh, cut-corn, swamp, flooded-timber, creek, river, lakeshore, open-water, coastal, field, reservoir, pothole, beaver-pond
    center: Dict[str, float]  # {"lat": 0.0, "lng": 0.0}
    photo_base64: Optional[str] = None

class Location(BaseModel):
    id: str
    user_id: str
    name: str
    location_type: str
    center: Dict[str, float]
    photo_base64: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BlindCreate(BaseModel):
    name: str
    location_id: str
    lat: float
    lng: float
    blind_type: str = "ground"  # ground, pit, panel, a-frame, layout, boat
    notes: str = ""

class Blind(BaseModel):
    id: str
    user_id: str
    location_id: str
    name: str
    lat: float
    lng: float
    blind_type: str = "ground"
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HarvestData(BaseModel):
    species_name: str
    count: int = 0
    missed: int = 0
    shot_not_recovered: int = 0
    seen: int = 0

class HuntCreate(BaseModel):
    name: str
    blind_id: Optional[str] = None
    blind_name: Optional[str] = None
    date: str
    location: Dict[str, float]
    notes: str = ""
    photos: List[str] = []
    harvests: List[HarvestData] = []
    is_morning: bool = False
    is_evening: bool = False

class Hunt(BaseModel):
    id: str
    user_id: str
    name: str
    blind_id: Optional[str] = None
    blind_name: str
    location_type: Optional[str] = None
    date: str
    location: Dict[str, float]
    weather_data: Optional[Dict[str, Any]] = None
    notes: str = ""
    photos: List[str] = []
    harvests: List[HarvestData] = []
    is_morning: bool = False
    is_evening: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Statistics(BaseModel):
    total_hunts: int
    total_harvested: int
    total_missed: int
    total_shot_not_recovered: int
    ducks_total: int
    geese_total: int
    others_total: int
    by_species: Dict[str, Dict[str, int]]

# ============ HELPER FUNCTIONS ============

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise credentials_exception
    return user

def _deg_to_cardinal(deg: float) -> str:
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[round(deg / 45) % 8]

def _moon_phase(date_str: str) -> dict:
    import math
    from datetime import date as date_type
    hunt_date = date_type.fromisoformat(date_str)
    known_new_moon = date_type(2000, 1, 6)
    days_since = (hunt_date - known_new_moon).days
    lunar_cycle = 29.53058867
    phase = (days_since % lunar_cycle) / lunar_cycle
    if phase < 0.033 or phase >= 0.967:
        name = "New Moon"
    elif phase < 0.192:
        name = "Waxing Crescent"
    elif phase < 0.258:
        name = "First Quarter"
    elif phase < 0.467:
        name = "Waxing Gibbous"
    elif phase < 0.533:
        name = "Full Moon"
    elif phase < 0.692:
        name = "Waning Gibbous"
    elif phase < 0.758:
        name = "Last Quarter"
    else:
        name = "Waning Crescent"
    illumination = round((1 - math.cos(2 * math.pi * phase)) / 2 * 100)
    return {"phase": round(phase, 4), "name": name, "illumination": illumination}

def _filter_wind_window(times, speeds, directions, start_hour: int, end_hour: int) -> list:
    result = []
    for t, sp, di in zip(times, speeds, directions):
        h = int(t[11:13])  # "YYYY-MM-DDTHH:MM" → hour int
        if start_hour <= h <= end_hour:
            result.append({
                "time": t[11:16],
                "speed": round(sp, 1) if sp is not None else 0,
                "direction": round(di) if di is not None else 0,
                "cardinal": _deg_to_cardinal(di) if di is not None else "N"
            })
    return result

def fetch_weather_data(lat: float, lng: float, date_str: str, is_morning: bool = False, is_evening: bool = False):
    """Fetch weather data from Open-Meteo API (free, supports historical data)"""
    try:
        from datetime import datetime, timedelta

        hunt_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        today = datetime.now().date()
        days_difference = (hunt_date - today).days

        if days_difference < 0:
            url = "https://archive-api.open-meteo.com/v1/archive"
        else:
            url = "https://api.open-meteo.com/v1/forecast"

        params = {
            "latitude": lat,
            "longitude": lng,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode,sunrise,sunset",
            "hourly": "windspeed_10m,winddirection_10m",
            "temperature_unit": "fahrenheit",
            "windspeed_unit": "mph",
            "timezone": "auto",
            "start_date": date_str,
            "end_date": date_str
        }

        response = requests.get(url, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            daily = data.get("daily", {})
            hourly = data.get("hourly", {})

            weather_codes = {
                0: "Clear sky",
                1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
                45: "Foggy", 48: "Depositing rime fog",
                51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
                61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
                71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
                77: "Snow grains",
                80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
                85: "Slight snow showers", 86: "Heavy snow showers",
                95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
            }

            temp_max = daily.get("temperature_2m_max", [None])[0]
            temp_min = daily.get("temperature_2m_min", [None])[0]
            precipitation = daily.get("precipitation_sum", [0])[0]
            wind_speed = daily.get("windspeed_10m_max", [0])[0]
            weather_code = daily.get("weathercode", [0])[0]
            sunrise_str = (daily.get("sunrise", [""])[0] or "")
            sunset_str = (daily.get("sunset", [""])[0] or "")

            avg_temp = round((temp_max + temp_min) / 2, 1) if temp_max and temp_min else None
            condition = weather_codes.get(weather_code, "Unknown")

            # Parse sunrise/sunset hours for wind windows
            sunrise_hour = int(sunrise_str[11:13]) if len(sunrise_str) >= 13 else 6
            sunset_hour = int(sunset_str[11:13]) if len(sunset_str) >= 13 else 19
            evening_start = max(sunrise_hour, sunset_hour - 5)

            times = hourly.get("time", [])
            speeds = hourly.get("windspeed_10m", [])
            directions = hourly.get("winddirection_10m", [])

            wind_morning = _filter_wind_window(times, speeds, directions, sunrise_hour, 12)
            wind_evening = _filter_wind_window(times, speeds, directions, evening_start, sunset_hour)

            moon = _moon_phase(date_str)
            return {
                "temp": avg_temp or 0,
                "temp_max": temp_max or 0,
                "temp_min": temp_min or 0,
                "condition": condition,
                "weather_code": weather_code,
                "wind_speed": wind_speed or 0,
                "precipitation": precipitation or 0,
                "description": f"{condition}, {precipitation}\" precip" if precipitation else condition,
                "sunrise": sunrise_str[11:16] if len(sunrise_str) >= 16 else "",
                "sunset": sunset_str[11:16] if len(sunset_str) >= 16 else "",
                "wind_morning": wind_morning,
                "wind_evening": wind_evening,
                "moon_phase": moon["phase"],
                "moon_phase_name": moon["name"],
                "moon_illumination": moon["illumination"],
            }
        else:
            logger.error(f"Open-Meteo API error: {response.status_code} - {response.text}")

    except Exception as e:
        logger.error(f"Open-Meteo API error: {e}")

    moon = _moon_phase(date_str)
    return {
        "temp": 0,
        "temp_max": 0,
        "temp_min": 0,
        "condition": "Unknown",
        "weather_code": 0,
        "wind_speed": 0,
        "precipitation": 0,
        "description": "Weather data unavailable",
        "sunrise": "",
        "sunset": "",
        "wind_morning": [],
        "wind_evening": [],
        "moon_phase": moon["phase"],
        "moon_phase_name": moon["name"],
        "moon_illumination": moon["illumination"],
    }

# ============ AUTH ROUTES ============

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user_doc = {
        "email": user_data.email,
        "password_hash": hashed_password,
        "name": user_data.name,
        "subscription_status": "free",
        "created_at": datetime.utcnow()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create token
    access_token = create_access_token(data={"sub": user_id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "subscription_status": "free"
        }
    }

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "name": user["name"],
            "subscription_status": user.get("subscription_status", "free")
        }
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "name": current_user["name"],
        "subscription_status": current_user.get("subscription_status", "free"),
        "created_at": current_user.get("created_at", datetime.utcnow())
    }

# ============ LOCATIONS ROUTES ============

@api_router.get("/locations", response_model=List[Location])
async def get_locations(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    locations = await db.locations.find({"user_id": user_id}).sort("name", 1).to_list(1000)
    return [
        {
            "id": str(loc["_id"]),
            "user_id": loc["user_id"],
            "name": loc["name"],
            "location_type": loc["location_type"],
            "center": loc["center"],
            "photo_base64": loc.get("photo_base64"),
            "created_at": loc.get("created_at", datetime.utcnow())
        }
        for loc in locations
    ]

@api_router.post("/locations", response_model=Location)
async def create_location(loc_data: LocationCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    doc = {
        "user_id": user_id,
        "name": loc_data.name,
        "location_type": loc_data.location_type,
        "center": loc_data.center,
        "photo_base64": loc_data.photo_base64,
        "created_at": datetime.utcnow()
    }
    result = await db.locations.insert_one(doc)
    return {
        "id": str(result.inserted_id),
        "user_id": user_id,
        "created_at": datetime.utcnow(),
        **loc_data.dict()
    }

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    result = await db.locations.delete_one({"_id": ObjectId(location_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.blinds.delete_many({"location_id": location_id, "user_id": user_id})
    return {"message": "Location deleted"}

# ============ BLINDS ROUTES ============

@api_router.get("/locations/{location_id}/blinds", response_model=List[Blind])
async def get_blinds_for_location(location_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    blinds = await db.blinds.find({"location_id": location_id, "user_id": user_id}).to_list(1000)
    return [_blind_doc(b) for b in blinds]

@api_router.post("/locations/{location_id}/blinds", response_model=Blind)
async def create_blind(location_id: str, blind_data: BlindCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    loc = await db.locations.find_one({"_id": ObjectId(location_id), "user_id": user_id})
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    doc = {
        "user_id": user_id,
        "location_id": location_id,
        "name": blind_data.name,
        "lat": blind_data.lat,
        "lng": blind_data.lng,
        "blind_type": blind_data.blind_type,
        "notes": blind_data.notes,
        "created_at": datetime.utcnow()
    }
    result = await db.blinds.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return _blind_doc(doc)

@api_router.delete("/blinds/{blind_id}")
async def delete_blind(blind_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    result = await db.blinds.delete_one({"_id": ObjectId(blind_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blind not found")
    return {"message": "Blind deleted"}

@api_router.get("/blinds", response_model=List[Blind])
async def get_all_blinds(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    blinds = await db.blinds.find({"user_id": user_id}).to_list(1000)
    return [_blind_doc(b) for b in blinds]

def _blind_doc(b: dict) -> dict:
    return {
        "id": b.get("id") or str(b["_id"]),
        "user_id": b["user_id"],
        "location_id": b["location_id"],
        "name": b["name"],
        "lat": b["lat"],
        "lng": b["lng"],
        "blind_type": b.get("blind_type", "ground"),
        "notes": b.get("notes", ""),
        "created_at": b.get("created_at", datetime.utcnow())
    }

# ============ HUNTS ROUTES ============

@api_router.get("/hunts", response_model=List[Hunt])
async def get_hunts(year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    
    # Build query filter
    query_filter = {"user_id": user_id}
    
    # Add year filter if provided
    if year:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        query_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    hunts = await db.hunts.find(query_filter).sort("date", -1).to_list(1000)
    
    result = []
    for hunt in hunts:
        # Transform harvest data to match new schema
        transformed_harvests = []
        for harvest in hunt.get("harvests", []):
            transformed_harvests.append({
                "species_name": harvest.get("species_name") or harvest.get("species", "Unknown"),
                "count": harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0),
                "missed": harvest.get("missed", 0),
                "shot_not_recovered": harvest.get("shot_not_recovered", 0),
                "seen": harvest.get("seen", 0)
            })
        
        result.append({
            "id": str(hunt["_id"]),
            "user_id": hunt["user_id"],
            "name": hunt.get("name", "Untitled Hunt"),
            "blind_id": hunt.get("blind_id"),
            "blind_name": hunt["blind_name"],
            "location_type": hunt.get("location_type"),
            "date": hunt["date"],
            "location": hunt["location"],
            "weather_data": hunt.get("weather_data"),
            "notes": hunt.get("notes", ""),
            "photos": hunt.get("photos", []),
            "harvests": transformed_harvests,
            "is_morning": hunt.get("is_morning", False),
            "is_evening": hunt.get("is_evening", False),
            "created_at": hunt.get("created_at", datetime.utcnow())
        })
    
    return result

@api_router.get("/hunts/years")
async def get_hunt_years(current_user: dict = Depends(get_current_user)):
    """Get list of years that have hunts"""
    user_id = str(current_user["_id"])
    
    # Get all hunts and extract unique years
    hunts = await db.hunts.find({"user_id": user_id}).to_list(10000)
    years = set()
    
    for hunt in hunts:
        try:
            year = int(hunt["date"].split("-")[0])
            years.add(year)
        except:
            pass
    
    return {"years": sorted(list(years), reverse=True)}

@api_router.post("/hunts", response_model=Hunt)
async def create_hunt(hunt_data: HuntCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    
    blind_name = hunt_data.blind_name or "Unknown Location"
    blind_id = hunt_data.blind_id
    location_type = None

    if hunt_data.blind_id:
        blind = await db.blinds.find_one({"_id": ObjectId(hunt_data.blind_id), "user_id": user_id})
        if blind:
            blind_name = blind["name"]
            loc = await db.locations.find_one({"_id": ObjectId(blind["location_id"])})
            if loc:
                location_type = loc.get("location_type")
    
    # Fetch weather data
    weather_data = fetch_weather_data(
        hunt_data.location["lat"],
        hunt_data.location["lng"],
        hunt_data.date,
        is_morning=hunt_data.is_morning,
        is_evening=hunt_data.is_evening,
    )

    hunt_doc = {
        "user_id": user_id,
        "name": hunt_data.name,
        "blind_id": blind_id,
        "blind_name": blind_name,
        "location_type": location_type,
        "date": hunt_data.date,
        "location": hunt_data.location,
        "weather_data": weather_data,
        "notes": hunt_data.notes,
        "photos": hunt_data.photos,
        "harvests": [h.dict() for h in hunt_data.harvests],
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "created_at": datetime.utcnow()
    }
    result = await db.hunts.insert_one(hunt_doc)
    hunt_id = str(result.inserted_id)

    return {
        "id": hunt_id,
        "user_id": user_id,
        "name": hunt_data.name,
        "blind_id": blind_id,
        "blind_name": blind_name,
        "location_type": location_type,
        "date": hunt_data.date,
        "location": hunt_data.location,
        "weather_data": weather_data,
        "notes": hunt_data.notes,
        "photos": hunt_data.photos,
        "harvests": hunt_data.harvests,
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "created_at": datetime.utcnow()
    }

@api_router.put("/hunts/{hunt_id}", response_model=Hunt)
async def update_hunt(hunt_id: str, hunt_data: HuntCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    existing = await db.hunts.find_one({"_id": ObjectId(hunt_id), "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Hunt not found")

    blind_name = hunt_data.blind_name or existing.get("blind_name", "Unknown Location")
    blind_id = hunt_data.blind_id
    location_type = existing.get("location_type")

    if hunt_data.blind_id:
        blind = await db.blinds.find_one({"_id": ObjectId(hunt_data.blind_id), "user_id": user_id})
        if blind:
            blind_name = blind["name"]
            loc = await db.locations.find_one({"_id": ObjectId(blind["location_id"])})
            if loc:
                location_type = loc.get("location_type")

    weather_data = fetch_weather_data(
        hunt_data.location["lat"],
        hunt_data.location["lng"],
        hunt_data.date,
        is_morning=hunt_data.is_morning,
        is_evening=hunt_data.is_evening,
    )

    await db.hunts.update_one({"_id": ObjectId(hunt_id)}, {"$set": {
        "name": hunt_data.name,
        "blind_id": blind_id,
        "blind_name": blind_name,
        "location_type": location_type,
        "date": hunt_data.date,
        "location": hunt_data.location,
        "weather_data": weather_data,
        "notes": hunt_data.notes,
        "photos": hunt_data.photos,
        "harvests": [h.dict() for h in hunt_data.harvests],
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
    }})

    return {
        "id": hunt_id,
        "user_id": user_id,
        "name": hunt_data.name,
        "blind_id": blind_id,
        "blind_name": blind_name,
        "location_type": location_type,
        "date": hunt_data.date,
        "location": hunt_data.location,
        "weather_data": weather_data,
        "notes": hunt_data.notes,
        "photos": hunt_data.photos,
        "harvests": hunt_data.harvests,
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "created_at": existing.get("created_at", datetime.utcnow()),
    }

@api_router.get("/hunts/{hunt_id}", response_model=Hunt)
async def get_hunt(hunt_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    hunt = await db.hunts.find_one({"_id": ObjectId(hunt_id), "user_id": user_id})
    if not hunt:
        raise HTTPException(status_code=404, detail="Hunt not found")
    
    # Transform harvest data to match new schema
    transformed_harvests = []
    for harvest in hunt.get("harvests", []):
        transformed_harvests.append({
            "species_name": harvest.get("species_name") or harvest.get("species", "Unknown"),
            "count": harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0),
            "missed": harvest.get("missed", 0),
            "shot_not_recovered": harvest.get("shot_not_recovered", 0)
        })
    
    return {
        "id": str(hunt["_id"]),
        "user_id": hunt["user_id"],
        "name": hunt.get("name", "Untitled Hunt"),
        "blind_id": hunt.get("blind_id"),
        "blind_name": hunt["blind_name"],
        "location_type": hunt.get("location_type"),
        "date": hunt["date"],
        "location": hunt["location"],
        "weather_data": hunt.get("weather_data"),
        "notes": hunt.get("notes", ""),
        "photos": hunt.get("photos", []),
        "harvests": transformed_harvests,
        "is_morning": hunt.get("is_morning", False),
        "is_evening": hunt.get("is_evening", False),
        "created_at": hunt.get("created_at", datetime.utcnow())
    }

@api_router.delete("/hunts/{hunt_id}")
async def delete_hunt(hunt_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    result = await db.hunts.delete_one({"_id": ObjectId(hunt_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hunt not found")
    return {"message": "Hunt deleted successfully"}

# ============ STATISTICS ROUTES ============

SPECIES_CATEGORIES = {
    "ducks": ["Mallard", "Teal", "Wood Duck", "Pintail", "Widgeon", "Gadwall", "Canvasback", "Redhead", "Shoveler"],
    "geese": ["Canada Goose", "Snow Goose", "Specklebelly", "White-fronted Goose"],
    "others": ["Coot", "Rail", "Snipe", "Dove", "Other"]
}

def _temp_bucket(t: float) -> str:
    if t <= 20: return "≤20°"
    if t <= 32: return "21–32°"
    if t <= 45: return "33–45°"
    if t <= 60: return "46–60°"
    return "60°+"

def _wind_bucket(w: float) -> str:
    if w <= 5: return "Calm (≤5)"
    if w <= 12: return "Light (6–12)"
    if w <= 20: return "Moderate (13–20)"
    if w <= 30: return "Strong (21–30)"
    return "Very strong (31+)"

def _sky_category(code) -> str:
    if code is None: return "Unknown"
    if code <= 1: return "Clear"
    if code <= 3: return "Cloudy"
    if code <= 48: return "Fog"
    if code <= 67 or 80 <= code <= 82: return "Rain"
    if 71 <= code <= 77 or code in (85, 86): return "Snow"
    if code >= 95: return "Storm"
    return "Unknown"

MOON_ORDER = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
              "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]
TEMP_ORDER = ["≤20°", "21–32°", "33–45°", "46–60°", "60°+"]
WIND_ORDER = ["Calm (≤5)", "Light (6–12)", "Moderate (13–20)", "Strong (21–30)", "Very strong (31+)"]
DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

@api_router.get("/statistics")
async def get_statistics(year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])

    query_filter = {"user_id": user_id}
    if year:
        query_filter["date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}

    hunts = await db.hunts.find(query_filter).to_list(10000)

    # Resolve blind → location name once
    blinds = await db.blinds.find({"user_id": user_id}).to_list(1000)
    locations = await db.locations.find({"user_id": user_id}).to_list(1000)
    loc_names = {str(l["_id"]): l.get("name", "Unknown") for l in locations}
    blind_to_loc = {str(b["_id"]): loc_names.get(str(b.get("location_id")), "Unknown") for b in blinds}

    total_hunts = len(hunts)
    total_harvested = 0
    total_missed = 0
    total_shot_not_recovered = 0
    total_seen = 0
    ducks_total = 0
    geese_total = 0
    others_total = 0
    by_species = {}

    hunts_with_birds = 0
    by_blind = {}          # name -> {hunts, harvested}
    by_location = {}       # name -> {hunts, harvested}
    by_location_type = {}  # type -> {hunts, harvested}
    time_split = {"morning": {"hunts": 0, "harvested": 0}, "evening": {"hunts": 0, "harvested": 0}}
    by_month = {}          # "YYYY-MM" -> {hunts, harvested}
    by_dow = {d: {"hunts": 0, "harvested": 0} for d in DOW_NAMES}
    by_moon = {}
    by_sky = {}
    by_temp = {}
    by_wind = {}
    best_day = None        # {date, name, harvested}
    species_by_location = {}  # location -> {species: harvested}

    for hunt in sorted(hunts, key=lambda h: h.get("date", "")):
        hunt_harvested = 0
        for harvest in hunt.get("harvests", []):
            species = harvest.get("species_name") or harvest.get("species", "Unknown")
            count = harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0)
            missed = harvest.get("missed", 0)
            shot_not_recovered = harvest.get("shot_not_recovered", 0)
            seen = harvest.get("seen", 0)

            total_harvested += count
            total_missed += missed
            total_shot_not_recovered += shot_not_recovered
            total_seen += seen
            hunt_harvested += count

            if species in SPECIES_CATEGORIES["ducks"]:
                ducks_total += count
            elif species in SPECIES_CATEGORIES["geese"]:
                geese_total += count
            else:
                others_total += count

            if species not in by_species:
                by_species[species] = {"harvested": 0, "missed": 0, "shot_not_recovered": 0, "seen": 0}
            by_species[species]["harvested"] += count
            by_species[species]["missed"] += missed
            by_species[species]["shot_not_recovered"] += shot_not_recovered
            by_species[species]["seen"] = by_species[species].get("seen", 0) + seen

        if hunt_harvested > 0:
            hunts_with_birds += 1

        if best_day is None or hunt_harvested > best_day["harvested"]:
            best_day = {"date": hunt.get("date"), "name": hunt.get("name", ""), "harvested": hunt_harvested}

        def bump(d, key):
            if key not in d:
                d[key] = {"hunts": 0, "harvested": 0}
            d[key]["hunts"] += 1
            d[key]["harvested"] += hunt_harvested

        blind_name = hunt.get("blind_name") or "Unknown"
        bump(by_blind, blind_name)

        loc_name = blind_to_loc.get(str(hunt.get("blind_id")), "Unknown")
        bump(by_location, loc_name)
        if loc_name != "Unknown":
            sp_map = species_by_location.setdefault(loc_name, {})
            for harvest in hunt.get("harvests", []):
                sp = harvest.get("species_name") or harvest.get("species", "Unknown")
                c = harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0)
                if c:
                    sp_map[sp] = sp_map.get(sp, 0) + c

        if hunt.get("location_type"):
            bump(by_location_type, hunt["location_type"])

        if hunt.get("is_morning"):
            time_split["morning"]["hunts"] += 1
            time_split["morning"]["harvested"] += hunt_harvested
        if hunt.get("is_evening"):
            time_split["evening"]["hunts"] += 1
            time_split["evening"]["harvested"] += hunt_harvested

        date_str = hunt.get("date", "")
        if len(date_str) >= 7:
            bump(by_month, date_str[:7])
        try:
            dow = DOW_NAMES[datetime.strptime(date_str, "%Y-%m-%d").weekday()]
            bump(by_dow, dow)
        except (ValueError, TypeError):
            pass

        wd = hunt.get("weather_data") or {}
        moon_name = wd.get("moon_phase_name")
        if not moon_name and date_str:
            try:
                moon_name = _moon_phase(date_str)["name"]
            except ValueError:
                moon_name = None
        if moon_name:
            bump(by_moon, moon_name)

        if wd.get("condition") not in (None, "Unknown"):
            bump(by_sky, _sky_category(wd.get("weather_code")))
            if wd.get("temp") is not None:
                bump(by_temp, _temp_bucket(wd["temp"]))
            if wd.get("wind_speed") is not None:
                bump(by_wind, _wind_bucket(wd["wind_speed"]))

    def top_by(d, key):
        if not d:
            return None
        name, v = max(d.items(), key=lambda kv: kv[1][key])
        return {"name": name, **v}

    def ordered(d, order):
        return [{"name": k, **d[k]} for k in order if k in d]

    total_shots = total_harvested + total_missed + total_shot_not_recovered

    return {
        "total_hunts": total_hunts,
        "total_harvested": total_harvested,
        "total_missed": total_missed,
        "total_shot_not_recovered": total_shot_not_recovered,
        "total_seen": total_seen,
        "ducks_total": ducks_total,
        "geese_total": geese_total,
        "others_total": others_total,
        "by_species": by_species,
        "success_rate": round(hunts_with_birds / total_hunts * 100, 1) if total_hunts else 0,
        "avg_birds_per_hunt": round(total_harvested / total_hunts, 1) if total_hunts else 0,
        "shot_efficiency": round(total_harvested / total_shots * 100, 1) if total_shots else 0,
        "best_blind": top_by(by_blind, "harvested"),
        "most_used_blind": top_by(by_blind, "hunts"),
        "best_location": top_by({k: v for k, v in by_location.items() if k != "Unknown"}, "harvested"),
        "best_location_type": top_by(by_location_type, "harvested"),
        "best_day": best_day if best_day and best_day["harvested"] > 0 else None,
        "time_split": time_split,
        "by_month": [{"month": k, **v} for k, v in sorted(by_month.items())],
        "by_day_of_week": [{"name": d, **by_dow[d]} for d in DOW_NAMES if by_dow[d]["hunts"] > 0],
        "by_moon_phase": ordered(by_moon, MOON_ORDER),
        "by_sky": [{"name": k, **v} for k, v in sorted(by_sky.items(), key=lambda kv: -kv[1]["harvested"])],
        "by_temp": ordered(by_temp, TEMP_ORDER),
        "by_wind": ordered(by_wind, WIND_ORDER),
        "species_by_location": species_by_location,
    }

# ============ FORECAST ROUTES ============
#
# Tunable model constants — adjust these to change how days are scored.
# Migration index: cold-front proxy (temp drop + N wind + falling pressure).
MIG_TEMP_DROP_STRONG = 15.0   # °F drop vs prior day → full temp points
MIG_TEMP_DROP_MOD = 8.0       # °F drop → partial temp points
MIG_TEMP_PTS = 40
MIG_WIND_PTS = 30
MIG_PRESSURE_PTS = 30
MIG_PRESSURE_FALL = 2.0       # hPa daily-mean drop counts as "falling"
# Hunt Score blend weights (must sum to 1.0)
SCORE_W_HISTORY = 0.5
SCORE_W_MIGRATION = 0.3
SCORE_W_BASE = 0.2
HISTORY_MIN_HUNTS = 5         # below this, lean on generic prior instead of history

NORTH_CARDINALS = {"N", "NE", "NW"}

SNOW_CODES = {71, 73, 75, 77, 85, 86}
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82}
STORM_CODES = {95, 96, 99}
FREEZE_TEMP = 20              # °F daily low → freeze-up driver
# Score bonuses for notable weather events (capped so they can't run away).
EVENT_BONUS = {"strong_front": 12, "cold_front": 8, "snow": 10, "rain": 4, "freeze": 6, "storm": 4}
EVENT_BONUS_CAP = 18


def _weather_events(temp_max, prev_temp_max, temp_min, weather_code, precip):
    """Human-readable weather-event tags + a capped score bonus for prime movers."""
    events = []
    if prev_temp_max is not None and temp_max is not None:
        drop = prev_temp_max - temp_max
        if drop >= MIG_TEMP_DROP_STRONG:
            events.append({"type": "strong_front", "label": "Strong front"})
        elif drop >= MIG_TEMP_DROP_MOD:
            events.append({"type": "cold_front", "label": "Cold front"})
    if weather_code in SNOW_CODES:
        events.append({"type": "snow", "label": "Snow"})
    elif weather_code in STORM_CODES:
        events.append({"type": "storm", "label": "Storm"})
    elif weather_code in RAIN_CODES or (precip or 0) >= 0.1:
        events.append({"type": "rain", "label": "Rain"})
    if temp_min is not None and temp_min <= FREEZE_TEMP:
        events.append({"type": "freeze", "label": "Freeze"})
    bonus = min(EVENT_BONUS_CAP, sum(EVENT_BONUS.get(e["type"], 0) for e in events))
    return {"events": events, "bonus": bonus}


# --- Freeze-up model -------------------------------------------------------
# Sustained sub-freezing weather locks still water while moving water stays
# open, concentrating birds. We look at a trailing window of daily highs.
FREEZE_LOOKBACK = 5          # past days to fetch for trailing freeze analysis
FREEZE_WINDOW = 5           # days (incl. current) considered for lock state
FREEZE_HIGH_TEMP = 32       # a day whose HIGH stays ≤ this never thawed
FREEZE_LOCKED_DAYS = 4      # ≥ this many frozen days in window → still water locked
FREEZE_PARTIAL_DAYS = 2     # ≥ this many → water starting to lock

# Location types grouped by how freeze-up affects them.
MOVING_WATER = {"creek", "river"}
BIG_OPEN_WATER = {"open-water", "reservoir", "lakeshore", "coastal"}
# cut-corn is typically flooded corn — shallow still water that locks like a marsh.
SHALLOW_STILL_WATER = {"marsh", "swamp", "flooded-timber", "pothole", "beaver-pond", "cut-corn"}
# dry fields ("field") are dry ground — freeze-up doesn't lock them.

# Score adjustments by (freeze state, water group).
FREEZE_ADJUST = {
    "locked": {"moving": 22, "big_open": 6, "shallow": -32, "field": 0},
    "freezing": {"moving": 10, "big_open": 2, "shallow": -14, "field": 0},
}


def _freeze_state(trailing_highs):
    """Given recent daily highs (incl. current day, oldest→newest), classify lock state."""
    highs = [h for h in trailing_highs if h is not None]
    if not highs:
        return "open"
    frozen_days = sum(1 for h in highs if h <= FREEZE_HIGH_TEMP)
    if frozen_days >= FREEZE_LOCKED_DAYS:
        return "locked"
    if frozen_days >= FREEZE_PARTIAL_DAYS:
        return "freezing"
    return "open"


def _water_group(location_type):
    if location_type in MOVING_WATER:
        return "moving"
    if location_type in BIG_OPEN_WATER:
        return "big_open"
    if location_type in SHALLOW_STILL_WATER:
        return "shallow"
    return "field"


def _freeze_adjustment(location_type, freeze_state):
    """Score delta + descriptive event for how freeze-up affects this water type."""
    if freeze_state == "open":
        return {"delta": 0, "event": None}
    group = _water_group(location_type)
    delta = FREEZE_ADJUST.get(freeze_state, {}).get(group, 0)
    event = None
    if group == "moving" and delta > 0:
        event = {"type": "open_water", "label": "Open water"}
    elif group == "big_open" and freeze_state == "locked":
        event = {"type": "open_water", "label": "Holds open"}
    elif group == "shallow" and delta < 0:
        event = {"type": "iced", "label": "Likely iced"}
    return {"delta": delta, "event": event}


def _pressure_trend(delta: float) -> str:
    if delta <= -MIG_PRESSURE_FALL:
        return "falling"
    if delta >= MIG_PRESSURE_FALL:
        return "rising"
    return "steady"


def _migration_index(temp_max, prev_temp_max, wind_cardinal, pressure_delta):
    pts = 0
    factors = []
    if prev_temp_max is not None and temp_max is not None:
        drop = prev_temp_max - temp_max
        if drop >= MIG_TEMP_DROP_STRONG:
            pts += MIG_TEMP_PTS
            factors.append(f"{round(drop)}° temp drop")
        elif drop >= MIG_TEMP_DROP_MOD:
            pts += int(MIG_TEMP_PTS * 0.6)
            factors.append(f"{round(drop)}° temp drop")
    if wind_cardinal in NORTH_CARDINALS:
        pts += MIG_WIND_PTS
        factors.append(f"{wind_cardinal} wind")
    if pressure_delta is not None and pressure_delta <= -MIG_PRESSURE_FALL:
        pts += MIG_PRESSURE_PTS
        factors.append("falling pressure")
    level = "high" if pts > 65 else "med" if pts >= 35 else "low"
    return {"score": pts, "level": level, "factors": factors}


def _base_conditions_score(wind_speed, weather_code, temp_max):
    """Generic duck-hunting prior, 0–100. Wind + overcast + cold + light precip = good."""
    score = 40.0
    if wind_speed is not None:
        if 10 <= wind_speed <= 25:
            score += 25
        elif 6 <= wind_speed < 10 or 25 < wind_speed <= 32:
            score += 12
        elif wind_speed <= 3:
            score -= 15  # dead-calm bluebird
    if weather_code is not None:
        if weather_code in (2, 3, 45, 48):       # cloudy / overcast / fog
            score += 15
        elif weather_code in (51, 53, 61, 63, 71, 73, 80, 85):  # light precip / snow
            score += 20
        elif weather_code <= 1:                   # clear
            score -= 10
    if temp_max is not None:
        if temp_max <= 40:
            score += 10
        elif temp_max >= 65:
            score -= 10
    return max(0, min(100, score))


async def _user_condition_profile(user_id: str):
    """Avg birds/hunt per condition bucket from the user's full history."""
    hunts = await db.hunts.find({"user_id": user_id}).to_list(10000)
    buckets = {"wind": {}, "temp": {}, "sky": {}, "moon": {}}
    total_birds = 0
    sample = 0
    for hunt in hunts:
        birds = sum(
            (h.get("count") if h.get("count") is not None else h.get("harvested", 0))
            for h in hunt.get("harvests", [])
        )
        total_birds += birds
        sample += 1
        wd = hunt.get("weather_data") or {}

        def add(cat, key):
            if key is None:
                return
            b = buckets[cat].setdefault(key, {"birds": 0, "hunts": 0})
            b["birds"] += birds
            b["hunts"] += 1

        if wd.get("condition") not in (None, "Unknown"):
            if wd.get("wind_speed") is not None:
                add("wind", _wind_bucket(wd["wind_speed"]))
            if wd.get("temp") is not None:
                add("temp", _temp_bucket(wd["temp"]))
            add("sky", _sky_category(wd.get("weather_code")))
        moon_name = wd.get("moon_phase_name")
        if not moon_name and hunt.get("date"):
            try:
                moon_name = _moon_phase(hunt["date"])["name"]
            except ValueError:
                moon_name = None
        add("moon", moon_name)

    overall_avg = (total_birds / sample) if sample else 0
    avgs = {cat: {k: v["birds"] / v["hunts"] for k, v in d.items() if v["hunts"] > 0}
            for cat, d in buckets.items()}
    return {"avgs": avgs, "overall_avg": overall_avg, "sample": sample}


def _history_match_score(profile, wind_speed, temp, weather_code, moon_name):
    """0–100: how much this day's buckets resemble the user's productive conditions."""
    overall = profile["overall_avg"]
    if overall <= 0:
        return None
    avgs = profile["avgs"]
    lookups = [
        avgs["wind"].get(_wind_bucket(wind_speed)) if wind_speed is not None else None,
        avgs["temp"].get(_temp_bucket(temp)) if temp is not None else None,
        avgs["sky"].get(_sky_category(weather_code)) if weather_code is not None else None,
        avgs["moon"].get(moon_name) if moon_name else None,
    ]
    ratios = [v / overall for v in lookups if v is not None]
    if not ratios:
        return None
    # ratio 1.0 = average day → 50; 2x average → 100; 0 → 0
    return max(0, min(100, (sum(ratios) / len(ratios)) * 50))


def fetch_forecast_data(lat: float, lng: float, days: int = 7):
    """Fetch multi-day forecast from Open-Meteo. Returns list of per-day dicts."""
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lng,
            "daily": ",".join([
                "temperature_2m_max", "temperature_2m_min", "weathercode",
                "windspeed_10m_max", "winddirection_10m_dominant",
                "precipitation_sum", "precipitation_probability_max",
                "sunrise", "sunset",
            ]),
            "hourly": "surface_pressure",
            "temperature_unit": "fahrenheit",
            "windspeed_unit": "mph",
            "timezone": "auto",
            "forecast_days": days,
            "past_days": FREEZE_LOOKBACK,
        }
        resp = requests.get(url, params=params, timeout=12)
        if resp.status_code != 200:
            logger.error(f"Open-Meteo forecast error: {resp.status_code} - {resp.text}")
            return []
        data = resp.json()
        daily = data.get("daily", {})
        hourly = data.get("hourly", {})

        # Daily-mean surface pressure for trend
        press_by_day = {}
        for t, p in zip(hourly.get("time", []), hourly.get("surface_pressure", [])):
            if p is None:
                continue
            d = t[:10]
            press_by_day.setdefault(d, []).append(p)
        day_mean_press = {d: sum(v) / len(v) for d, v in press_by_day.items() if v}

        weather_codes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
            61: "Slight rain", 63: "Rain", 65: "Heavy rain", 71: "Slight snow", 73: "Snow",
            75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
            82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
            95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
        }

        dates = daily.get("time", [])
        highs_raw = daily.get("temperature_2m_max", [])
        today = datetime.now().date().isoformat()
        out = []
        prev_temp = None
        for i, d in enumerate(dates):
            def g(key, default=None):
                arr = daily.get(key, [])
                return arr[i] if i < len(arr) else default
            temp_max = g("temperature_2m_max")
            temp_min = g("temperature_2m_min")
            code = g("weathercode", 0)
            wind_max = g("windspeed_10m_max", 0) or 0
            wind_dir = g("winddirection_10m_dominant", 0) or 0
            sunrise = g("sunrise", "") or ""
            sunset = g("sunset", "") or ""
            mean_p = day_mean_press.get(d)
            prev_p = day_mean_press.get(dates[i - 1]) if i > 0 else None
            press_delta = (mean_p - prev_p) if (mean_p is not None and prev_p is not None) else None

            # Trailing window of daily highs (incl. today) for freeze-up state
            window = highs_raw[max(0, i - FREEZE_WINDOW + 1): i + 1]
            freeze_state = _freeze_state(window)

            # Only surface today onward; past days exist solely to seed the window
            if d >= today:
                out.append({
                    "date": d,
                    "temp_max": round(temp_max) if temp_max is not None else None,
                    "temp_min": round(temp_min) if temp_min is not None else None,
                    "weather_code": code,
                    "condition": weather_codes.get(code, "Unknown"),
                    "precipitation": round(g("precipitation_sum", 0) or 0, 2),
                    "precip_prob": g("precipitation_probability_max", 0) or 0,
                    "wind_speed": round(wind_max, 1),
                    "wind_direction": round(wind_dir),
                    "wind_cardinal": _deg_to_cardinal(wind_dir),
                    "pressure_trend": _pressure_trend(press_delta) if press_delta is not None else "steady",
                    "freeze_state": freeze_state,
                    "sunrise": sunrise[11:16] if len(sunrise) >= 16 else "",
                    "sunset": sunset[11:16] if len(sunset) >= 16 else "",
                    "_prev_temp": prev_temp,
                    "_press_delta": press_delta,
                })
            prev_temp = temp_max
        return out
    except Exception as e:
        logger.error(f"Open-Meteo forecast error: {e}")
        return []


@api_router.get("/forecast")
async def get_forecast(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    locations = await db.locations.find({"user_id": user_id}).sort("name", 1).to_list(1000)
    profile = await _user_condition_profile(user_id)
    use_history = profile["sample"] >= HISTORY_MIN_HUNTS

    results = []
    best_bets = []
    for loc in locations:
        center = loc.get("center") or {}
        lat, lng = center.get("lat"), center.get("lng")
        if lat is None or lng is None:
            continue
        days = fetch_forecast_data(lat, lng, 7)
        loc_days = []
        for day in days:
            prev_temp = day.pop("_prev_temp")
            press_delta = day.pop("_press_delta")
            moon = _moon_phase(day["date"])
            mig = _migration_index(day["temp_max"], prev_temp, day["wind_cardinal"], press_delta)
            evt = _weather_events(day["temp_max"], prev_temp, day["temp_min"],
                                  day["weather_code"], day["precipitation"])
            base = _base_conditions_score(day["wind_speed"], day["weather_code"], day["temp_max"])
            hist = _history_match_score(profile, day["wind_speed"], day["temp_max"],
                                        day["weather_code"], moon["name"]) if use_history else None

            if hist is not None:
                score = (SCORE_W_HISTORY * hist
                         + SCORE_W_MIGRATION * mig["score"]
                         + SCORE_W_BASE * base)
            else:
                # No usable history: reweight migration + base to fill history's share
                score = (0.55 * base + 0.45 * mig["score"])
            score = min(100, score + evt["bonus"])

            # Freeze-up: still water locks, moving/big water concentrates birds
            fz = _freeze_adjustment(loc.get("location_type"), day["freeze_state"])
            score = max(0, min(100, score + fz["delta"]))
            events = evt["events"] + ([fz["event"]] if fz["event"] else [])

            # Narrative: lead with weather/water events, then wind / pressure / history.
            factors = [e["label"] for e in events]
            if day["wind_cardinal"] in NORTH_CARDINALS:
                factors.append(f"{day['wind_cardinal']} wind")
            if press_delta is not None and press_delta <= -MIG_PRESSURE_FALL:
                factors.append("falling pressure")
            if hist is not None and hist >= 65:
                factors.append("matches your best hunts")
            if not factors and base >= 65:
                factors.append("solid conditions")

            enriched = {
                **day,
                "moon_phase": moon["phase"],
                "moon_phase_name": moon["name"],
                "moon_illumination": moon["illumination"],
                "migration": mig,
                "events": events,
                "hunt_score": round(score),
                "factors": factors[:3],
            }
            loc_days.append(enriched)
            best_bets.append({
                "location_id": str(loc["_id"]),
                "location_name": loc["name"],
                "location_type": loc.get("location_type"),
                "date": day["date"],
                "hunt_score": round(score),
                "wind_cardinal": day["wind_cardinal"],
                "wind_speed": day["wind_speed"],
                "temp_max": day["temp_max"],
                "weather_code": day["weather_code"],
                "events": events,
                "factors": factors[:3],
            })

        results.append({
            "location_id": str(loc["_id"]),
            "location_name": loc["name"],
            "location_type": loc.get("location_type"),
            "days": loc_days,
        })

    best_bets.sort(key=lambda b: b["hunt_score"], reverse=True)
    return {
        "locations": results,
        "best_bets": best_bets[:5],
        "uses_history": use_history,
        "history_sample": profile["sample"],
    }

# ============ UTILITY ROUTES ============

@api_router.get("/species")
async def get_species_list():
    """Get list of available waterfowl species"""
    return {
        "ducks": SPECIES_CATEGORIES["ducks"],
        "geese": SPECIES_CATEGORIES["geese"],
        "others": SPECIES_CATEGORIES["others"]
    }

@api_router.get("/")
async def root():
    return {"message": "Waterfowl Hunting Journal API", "version": "1.0.0"}

# ============ SUBSCRIPTION ROUTES ============

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.environ.get("STRIPE_PRO_PRICE_ID", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

@api_router.get("/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    status = current_user.get("subscription_status", "free")
    stripe_customer_id = current_user.get("stripe_customer_id")
    return {
        "user_id": user_id,
        "subscription_status": status,
        "is_pro": status in ("pro", "premium"),
        "stripe_customer_id": stripe_customer_id,
    }

@api_router.post("/subscription/create-checkout-session")
async def create_checkout_session(
    request_data: dict,
    current_user: dict = Depends(get_current_user)
):
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    user_id = str(current_user["_id"])
    price_id = request_data.get("price_id", STRIPE_PRO_PRICE_ID)

    try:
        customer_id = current_user.get("stripe_customer_id")
        if not customer_id:
            customer = stripe_lib.Customer.create(
                email=current_user["email"],
                metadata={"user_id": user_id},
            )
            customer_id = customer.id
            await db.users.update_one(
                {"_id": current_user["_id"]},
                {"$set": {"stripe_customer_id": customer_id}},
            )

        session = stripe_lib.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{FRONTEND_URL}/profile?session_id={{CHECKOUT_SESSION_ID}}&success=1",
            cancel_url=f"{FRONTEND_URL}/profile",
            metadata={"user_id": user_id},
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/subscription/customer-portal")
async def create_customer_portal(current_user: dict = Depends(get_current_user)):
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    customer_id = current_user.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found")
    try:
        session = stripe_lib.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{FRONTEND_URL}/profile",
        )
        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if event["type"] == "customer.subscription.created":
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        user = await db.users.find_one({"stripe_customer_id": customer_id})
        if user:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"subscription_status": "pro"}},
            )
            logger.info(f"User {user['_id']} upgraded to pro")

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.updated"):
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        new_status = "pro" if sub.get("status") == "active" else "free"
        user = await db.users.find_one({"stripe_customer_id": customer_id})
        if user:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"subscription_status": new_status}},
            )
            logger.info(f"User {user['_id']} subscription status: {new_status}")

    return {"received": True}

# ============ EXPORT ROUTE ============

@api_router.get("/hunts/export/csv")
async def export_hunts_csv(current_user: dict = Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    import csv
    import io

    status = current_user.get("subscription_status", "free")
    if status not in ("pro", "premium"):
        raise HTTPException(status_code=403, detail="Pro subscription required for CSV export")

    user_id = str(current_user["_id"])
    hunts = await db.hunts.find({"user_id": user_id}).sort("date", -1).to_list(10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Hunt Name", "Blind", "Lat", "Lng", "Total Harvested", "Total Missed", "Total Lost", "Notes", "Condition", "Temp (F)", "Wind (mph)"])

    for hunt in hunts:
        weather = hunt.get("weather_data") or {}
        total_h = sum(h.get("count", 0) for h in hunt.get("harvests", []))
        total_m = sum(h.get("missed", 0) for h in hunt.get("harvests", []))
        total_l = sum(h.get("shot_not_recovered", 0) for h in hunt.get("harvests", []))
        writer.writerow([
            hunt.get("date", ""),
            hunt.get("name", ""),
            hunt.get("blind_name", ""),
            hunt.get("location", {}).get("lat", ""),
            hunt.get("location", {}).get("lng", ""),
            total_h,
            total_m,
            total_l,
            hunt.get("notes", "").replace("\n", " "),
            weather.get("condition", ""),
            weather.get("temp", ""),
            weather.get("wind_speed", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hunts.csv"},
    )

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
