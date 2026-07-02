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
            }
        else:
            logger.error(f"Open-Meteo API error: {response.status_code} - {response.text}")

    except Exception as e:
        logger.error(f"Open-Meteo API error: {e}")

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
                "shot_not_recovered": harvest.get("shot_not_recovered", 0)
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

@api_router.get("/statistics", response_model=Statistics)
async def get_statistics(year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    
    # Build query filter
    query_filter = {"user_id": user_id}
    
    # Add year filter if provided
    if year:
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        query_filter["date"] = {"$gte": start_date, "$lte": end_date}
    
    hunts = await db.hunts.find(query_filter).to_list(10000)
    
    total_hunts = len(hunts)
    total_harvested = 0
    total_missed = 0
    total_shot_not_recovered = 0
    ducks_total = 0
    geese_total = 0
    others_total = 0
    by_species = {}
    
    for hunt in hunts:
        for harvest in hunt.get("harvests", []):
            species = harvest.get("species_name") or harvest.get("species", "Unknown")
            count = harvest.get("count") or harvest.get("harvested", 0)
            missed = harvest.get("missed", 0)
            shot_not_recovered = harvest.get("shot_not_recovered", 0)
            
            total_harvested += count
            total_missed += missed
            total_shot_not_recovered += shot_not_recovered
            
            # Categorize
            if species in SPECIES_CATEGORIES["ducks"]:
                ducks_total += count
            elif species in SPECIES_CATEGORIES["geese"]:
                geese_total += count
            else:
                others_total += count
            
            # Track by species
            if species not in by_species:
                by_species[species] = {"harvested": 0, "missed": 0, "shot_not_recovered": 0}
            by_species[species]["harvested"] += count
            by_species[species]["missed"] += missed
            by_species[species]["shot_not_recovered"] += shot_not_recovered
    
    return {
        "total_hunts": total_hunts,
        "total_harvested": total_harvested,
        "total_missed": total_missed,
        "total_shot_not_recovered": total_shot_not_recovered,
        "ducks_total": ducks_total,
        "geese_total": geese_total,
        "others_total": others_total,
        "by_species": by_species
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
