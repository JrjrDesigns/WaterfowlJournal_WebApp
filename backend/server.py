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
import time
import copy
import calendar
import json
import secrets
import hashlib
import re
import base64
import asyncio
from collections import defaultdict, deque
from bson import ObjectId
from bson.errors import InvalidId
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
# Required, with no fallback on purpose. This key is the only thing standing
# between a stranger and a signed token for any account. The old default was a
# literal string sitting in a public repo, so losing the environment variable
# wouldn't have broken anything visibly — it would have quietly made every
# account forgeable. Refusing to start is the safer failure.
SECRET_KEY = os.environ.get("SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is not set. Refusing to start: without it, auth tokens would "
        "be signed with a predictable key and any account could be impersonated. "
        "Set SECRET_KEY in the environment (Railway → Variables)."
    )
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
    subscription_paused: bool = False
    subscription_resumes_at: Optional[int] = None  # unix seconds, from Stripe
    deletion_scheduled_for: Optional[int] = None  # unix seconds; set while a deletion is pending
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
    ideal_wind_directions: List[str] = []  # resolved arc of cardinals, e.g. ["E","NE","N","NW","W"]; empty = no preference
    ideal_wind_center: Optional[str] = None  # sweet-spot cardinal within the arc

class Blind(BaseModel):
    id: str
    user_id: str
    location_id: str
    name: str
    lat: float
    lng: float
    blind_type: str = "ground"
    notes: str = ""
    ideal_wind_directions: List[str] = []
    ideal_wind_center: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HarvestData(BaseModel):
    species_name: str
    count: int = 0
    mine: Optional[int] = None  # birds personally shot; None = not tracked separately (solo hunt or unknown attribution), treat as == count
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
    party: List[str] = []  # names of other hunters present, not including the logging user

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
    # Sent by the list endpoint in place of `photos`, which it omits.
    photo_count: int = 0
    harvests: List[HarvestData] = []
    is_morning: bool = False
    is_evening: bool = False
    party: List[str] = []
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


# ============ PHOTO STORAGE ============
#
# Photos used to be stored as base64 inside the hunt document itself. A single
# compressed photo costs ~120KB that way, so a hunter logging a full season with
# a couple of shots per sit fills ~9MB — and Atlas's free tier is 512MB in
# total. That put a hard ceiling of roughly fifty users on the whole product.
# R2 gives 10GB free, which is about a thousand times the headroom.
#
# If these variables aren't set the app keeps its old behaviour and stores
# base64 as before, so it works either way and nothing breaks mid-rollout.

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "").strip()
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
R2_PHOTOS_BUCKET = os.environ.get("R2_PHOTOS_BUCKET", "").strip()
R2_PUBLIC_BASE_URL = os.environ.get("R2_PUBLIC_BASE_URL", "").strip().rstrip("/")

PHOTO_STORAGE_READY = all(
    [R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PHOTOS_BUCKET, R2_PUBLIC_BASE_URL]
)

_DATA_URI = re.compile(r"^data:image/(png|jpe?g|webp);base64,(.+)$", re.IGNORECASE | re.DOTALL)
_EXTENSIONS = {"jpeg": "jpg", "jpg": "jpg", "png": "png", "webp": "webp"}

_s3_client = None


def photo_client():
    global _s3_client
    if _s3_client is None:
        import boto3
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _s3_client


async def store_photo(value: Optional[str], user_id: str) -> Optional[str]:
    """Move one incoming photo to R2 and return its URL.

    Anything that isn't a fresh base64 upload passes straight through — already
    stored URLs on an edit, and old base64 rows from before this shipped, which
    keep working because the browser renders either kind from the same <img>.
    """
    if not value or not PHOTO_STORAGE_READY:
        return value

    match = _DATA_URI.match(value.strip())
    if not match:
        return value

    subtype = match.group(1).lower()
    try:
        blob = base64.b64decode(match.group(2), validate=False)
    except Exception as e:
        logger.warning(f"Could not decode an uploaded photo, storing as-is: {e}")
        return value

    key = f"{user_id}/{uuid.uuid4().hex}.{_EXTENSIONS.get(subtype, 'jpg')}"
    try:
        await asyncio.to_thread(
            photo_client().put_object,
            Bucket=R2_PHOTOS_BUCKET,
            Key=key,
            Body=blob,
            ContentType=f"image/{'jpeg' if subtype in ('jpg', 'jpeg') else subtype}",
            # Keys are random and never reused, so the file at a URL can't change.
            CacheControl="public, max-age=31536000, immutable",
        )
    except Exception as e:
        # Falling back to base64 keeps the hunt saveable. Losing someone's photo
        # because object storage hiccuped would be a far worse outcome.
        logger.exception(f"Photo upload to R2 failed, falling back to inline storage: {e}")
        return value

    return f"{R2_PUBLIC_BASE_URL}/{key}"


async def store_photos(values: Optional[List[str]], user_id: str) -> List[str]:
    return [await store_photo(v, user_id) for v in (values or [])]


async def delete_photos(values) -> None:
    """Remove photos from R2. Best effort — an orphaned object costs a fraction
    of a cent, while failing someone's delete because cleanup broke does not."""
    if not PHOTO_STORAGE_READY or not values:
        return

    prefix = R2_PUBLIC_BASE_URL + "/"
    keys = [
        {"Key": v[len(prefix):]}
        for v in values
        if isinstance(v, str) and v.startswith(prefix)
    ]
    if not keys:
        return

    try:
        await asyncio.to_thread(
            photo_client().delete_objects,
            Bucket=R2_PHOTOS_BUCKET,
            Delete={"Objects": keys, "Quiet": True},
        )
    except Exception as e:
        logger.warning(f"Could not delete {len(keys)} photo(s) from R2: {e}")


# ============ RATE LIMITING ============
#
# Deliberately in-process and dependency-free. The backend runs as a single
# Railway instance, so an external store would buy nothing today, and a failed
# package install on a push-to-deploy setup takes the whole API down. If this is
# ever scaled past one instance these counters become per-instance and the
# effective limits multiply — revisit then.

_rate_buckets: Dict[str, deque] = defaultdict(deque)
_rate_sweeps = 0


def _bucket(key: str, window_seconds: int) -> deque:
    """The hits for `key` still inside the window, oldest first."""
    global _rate_sweeps
    cutoff = time.time() - window_seconds
    bucket = _rate_buckets[key]
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()

    # Keys are per-email and per-IP, so the dict would otherwise grow forever.
    _rate_sweeps += 1
    if _rate_sweeps % 500 == 0:
        for k in [k for k, v in _rate_buckets.items() if not v]:
            del _rate_buckets[k]

    return bucket


def _retry_after(bucket: deque, window_seconds: int) -> int:
    return max(1, int(bucket[0] + window_seconds - time.time()))


def rate_limit_hit(key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Count an attempt. Returns seconds to wait if it went over the limit."""
    bucket = _bucket(key, window_seconds)
    if len(bucket) >= limit:
        return _retry_after(bucket, window_seconds)
    bucket.append(time.time())
    return None


def rate_limit_blocked(key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Check without counting — used before doing expensive work."""
    bucket = _bucket(key, window_seconds)
    if len(bucket) >= limit:
        return _retry_after(bucket, window_seconds)
    return None


def rate_limit_record(key: str, window_seconds: int) -> None:
    _bucket(key, window_seconds).append(time.time())


def rate_limit_clear(key: str) -> None:
    _rate_buckets.pop(key, None)


def too_many(retry_after: int, message: str) -> HTTPException:
    return HTTPException(
        status_code=429, detail=message, headers={"Retry-After": str(retry_after)}
    )


def client_ip(request: Request) -> str:
    """Railway terminates TLS upstream, so request.client is its proxy."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Guessing one account's password is capped per email address, so rotating IPs
# doesn't help — and, just as importantly, real users are never caught by it.
# Hunters in the field share carrier NAT addresses, so anything keyed on IP
# alone would have a whole cell tower's worth of people locking each other out.
#
# Only FAILED attempts are counted, at either level. Someone signing in
# correctly is never throttled no matter how often they do it, while an
# attacker — whose attempts are all failures by definition — is cut off fast.
# The per-IP failure cap is the backstop against sheer volume, since every
# password check burns real CPU whether or not it succeeds.
LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW = 8, 15 * 60
AUTH_IP_FAIL_LIMIT, AUTH_IP_FAIL_WINDOW = 60, 60
REGISTER_IP_LIMIT, REGISTER_IP_WINDOW = 20, 60 * 60
RESET_EMAIL_LIMIT, RESET_EMAIL_WINDOW = 4, 60 * 60


# What a free account gets. Enforced here, not just in the client: the app on
# the user's phone can be told anything, so a gate that only lives there is
# decoration. The client keeps its own copy purely to show the paywall without
# a round trip.
FREE_HUNT_LIMIT = 10

PRO_STATUSES = ("pro", "premium")


async def fetch_capped(cursor, limit: int, what: str, user_id: str = "") -> list:
    """`to_list` with a ceiling that announces itself.

    Motor quietly returns the first `limit` documents and no indication there
    were more, so a user past the cap would simply find older seasons missing
    and reasonably conclude the app lost their data. This doesn't stop the
    truncation — that needs pagination — but it puts it in the logs years
    before anyone could hit it on a screen.
    """
    rows = await cursor.to_list(limit)
    if len(rows) >= limit:
        logger.warning(
            f"QUERY CAP HIT: {what} returned its full {limit}-row limit"
            + (f" for user {user_id}" if user_id else "")
            + " — older records are being silently dropped. This needs pagination."
        )
    return rows


def deletion_timestamp(user: dict) -> Optional[int]:
    """When this account is due to be erased, as unix seconds, or None."""
    scheduled = user.get("deletion_scheduled_for")
    return int(scheduled.timestamp()) if scheduled else None


def user_is_pro(user: dict) -> bool:
    """Single source of truth. A paused subscriber reads as free — the webhook
    writes subscription_status accordingly (see resolve_subscription_state)."""
    return user.get("subscription_status", "free") in PRO_STATUSES


async def require_pro(current_user: dict = Depends(get_current_user)) -> dict:
    if not user_is_pro(current_user):
        raise HTTPException(status_code=403, detail="Pro subscription required")
    return current_user


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
            # Open-Meteo defaults precipitation to MILLIMETERS. Everything
            # downstream (the `"` suffix in HuntDetail, the >= 0.1 rain-event
            # threshold) assumes inches, so ask for inches explicitly.
            "precipitation_unit": "inch",
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

def normalize_email(email: str) -> str:
    """Clients that skip this send `Bob@X.com`, which would otherwise register a
    second account that its owner can never log back into."""
    return email.strip().lower()


@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister, request: Request):
    email = normalize_email(user_data.email)

    retry = rate_limit_hit(
        f"register-ip:{client_ip(request)}", REGISTER_IP_LIMIT, REGISTER_IP_WINDOW
    )
    if retry is not None:
        raise too_many(retry, "Too many accounts created from here. Try again later.")

    # Check if user exists
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user_doc = {
        "email": email,
        "password_hash": hashed_password,
        "name": user_data.name,
        "subscription_status": "free",
        "created_at": datetime.utcnow()
    }
    # The check above loses a race between two in-flight signups for the same
    # address — which is exactly what a client retrying over a flaky connection
    # produces. The unique index is what actually prevents a duplicate account;
    # this turns the collision into the same 400 the check would have given.
    try:
        result = await db.users.insert_one(user_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(result.inserted_id)

    # Create token
    access_token = create_access_token(data={"sub": user_id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": email,
            "name": user_data.name,
            "subscription_status": "free",
            "subscription_paused": False,
            "subscription_resumes_at": None
        }
    }

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin, request: Request):
    email = normalize_email(user_data.email)

    # Both checked before the password is verified, so a throttled attacker
    # can't keep spending CPU on bcrypt.
    fail_key = f"login-fail:{email}"
    ip_fail_key = f"login-fail-ip:{client_ip(request)}"

    retry = rate_limit_blocked(fail_key, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
    if retry is not None:
        raise too_many(
            retry, "Too many failed sign-in attempts. Try again in a few minutes or reset your password."
        )

    retry = rate_limit_blocked(ip_fail_key, AUTH_IP_FAIL_LIMIT, AUTH_IP_FAIL_WINDOW)
    if retry is not None:
        raise too_many(retry, "Too many failed attempts. Wait a moment and try again.")

    user = await db.users.find_one({"email": email})
    if not user:
        # Accounts created before emails were normalized may be stored with
        # their original casing.
        user = await db.users.find_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        )
    if not user or not verify_password(user_data.password, user["password_hash"]):
        rate_limit_record(fail_key, LOGIN_FAIL_WINDOW)
        rate_limit_record(ip_fail_key, AUTH_IP_FAIL_WINDOW)
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # Only failures count, so someone signing in normally is never throttled —
    # and getting it right clears the strikes against them.
    rate_limit_clear(fail_key)

    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "name": user["name"],
            "subscription_status": user.get("subscription_status", "free"),
            "subscription_paused": user.get("subscription_paused", False),
            "subscription_resumes_at": user.get("subscription_resumes_at"),
            "deletion_scheduled_for": deletion_timestamp(user),
        }
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "name": current_user["name"],
        "subscription_status": current_user.get("subscription_status", "free"),
        "subscription_paused": current_user.get("subscription_paused", False),
        "subscription_resumes_at": current_user.get("subscription_resumes_at"),
        "deletion_scheduled_for": deletion_timestamp(current_user),
        "created_at": current_user.get("created_at", datetime.utcnow())
    }

# ============ PASSWORD RESET ============

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESET_FROM_EMAIL = os.environ.get("RESET_FROM_EMAIL", "Blind Guide <noreply@blindguideapp.com>")
RESET_TOKEN_TTL_MINUTES = 60


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def _hash_reset_token(token: str) -> str:
    """Only the hash is stored, so a database leak can't be used to reset accounts."""
    return hashlib.sha256(token.encode()).hexdigest()


def _send_reset_email(to_email: str, name: str, reset_url: str):
    """Send via Resend's HTTP API. Raises on failure so the caller can log it."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured")

    html = f"""
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px">
        <h2 style="color:#13141A;margin-bottom:8px">Reset your password</h2>
        <p style="color:#3d3f45;line-height:1.6">
          Hi {name or 'there'} — we got a request to reset the password for your
          Blind Guide account. This link is good for {RESET_TOKEN_TTL_MINUTES} minutes:
        </p>
        <p style="margin:24px 0">
          <a href="{reset_url}"
             style="background:#13141A;color:#fff;padding:12px 20px;border-radius:8px;
                    text-decoration:none;font-weight:600;display:inline-block">
            Choose a new password
          </a>
        </p>
        <p style="color:#797B7E;font-size:13px;line-height:1.6">
          If you didn't ask for this, you can ignore this email — your password won't change.
        </p>
      </div>
    """
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={
            "from": RESET_FROM_EMAIL,
            "to": [to_email],
            "subject": "Reset your Blind Guide password",
            "html": html,
        },
        timeout=15,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"Resend returned {resp.status_code}: {resp.text[:200]}")


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Always reports success — otherwise this endpoint reveals which emails have accounts."""
    email = normalize_email(payload.email)
    generic = {"message": "If that email has an account, a reset link is on its way."}

    # Capped per address so this can't be used to bomb someone's inbox. The
    # generic reply above is returned either way, so the cap leaks nothing about
    # whether the account exists.
    if rate_limit_hit(f"reset:{email}", RESET_EMAIL_LIMIT, RESET_EMAIL_WINDOW) is not None:
        logger.info(f"Password reset rate limited for {email}")
        return generic

    user = await db.users.find_one({"email": email})
    if not user:
        logger.info(f"Password reset requested for unknown email {email}")
        return generic

    token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({
        "user_id": user["_id"],
        "token_hash": _hash_reset_token(token),
        "expires_at": datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        "used": False,
        "created_at": datetime.utcnow(),
    })

    reset_url = f"{FRONTEND_URL}/auth/reset?token={token}"
    try:
        _send_reset_email(email, user.get("name", ""), reset_url)
        logger.info(f"Password reset email sent to user {user['_id']}")
    except Exception as e:
        # Still return the generic message; surfacing this would leak account existence.
        logger.exception(f"Failed sending password reset email to user {user['_id']}: {e}")

    return generic


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    record = await db.password_resets.find_one({
        "token_hash": _hash_reset_token(payload.token),
        "used": False,
    })
    if not record or record["expires_at"] < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="That reset link is invalid or has expired. Request a new one.",
        )

    await db.users.update_one(
        {"_id": record["user_id"]},
        {"$set": {"password_hash": get_password_hash(payload.password)}},
    )
    # Single use, and drop any other outstanding tokens for this account.
    await db.password_resets.update_many(
        {"user_id": record["user_id"], "used": False},
        {"$set": {"used": True}},
    )
    logger.info(f"Password reset completed for user {record['user_id']}")

    return {"message": "Your password has been reset. You can sign in now."}

# ============ LOCATIONS ROUTES ============

@api_router.get("/locations", response_model=List[Location])
async def get_locations(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    locations = await fetch_capped(db.locations.find({"user_id": user_id}).sort("name", 1), 1000, "locations", user_id)
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
        "photo_base64": await store_photo(loc_data.photo_base64, user_id),
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
    doomed = await db.locations.find_one({"_id": ObjectId(location_id), "user_id": user_id})
    result = await db.locations.delete_one({"_id": ObjectId(location_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")

    blinds = await db.blinds.find({"location_id": location_id, "user_id": user_id}).to_list(1000)
    await db.blinds.delete_many({"location_id": location_id, "user_id": user_id})

    await delete_photos(
        [(doomed or {}).get("photo_base64")] + [b.get("photo_base64") for b in blinds]
    )
    return {"message": "Location deleted"}

# ============ BLINDS ROUTES ============

@api_router.get("/locations/{location_id}/blinds", response_model=List[Blind])
async def get_blinds_for_location(location_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    blinds = await fetch_capped(db.blinds.find({"location_id": location_id, "user_id": user_id}), 1000, "blinds for a location", user_id)
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
        "ideal_wind_directions": blind_data.ideal_wind_directions,
        "ideal_wind_center": blind_data.ideal_wind_center,
        "created_at": datetime.utcnow()
    }
    result = await db.blinds.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return _blind_doc(doc)

@api_router.put("/blinds/{blind_id}", response_model=Blind)
async def update_blind(blind_id: str, blind_data: BlindCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    existing = await db.blinds.find_one({"_id": ObjectId(blind_id), "user_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Blind not found")
    update = {
        "name": blind_data.name,
        "lat": blind_data.lat,
        "lng": blind_data.lng,
        "blind_type": blind_data.blind_type,
        "notes": blind_data.notes,
        "ideal_wind_directions": blind_data.ideal_wind_directions,
        "ideal_wind_center": blind_data.ideal_wind_center,
    }
    await db.blinds.update_one({"_id": ObjectId(blind_id)}, {"$set": update})
    updated = {**existing, **update, "id": blind_id}
    return _blind_doc(updated)

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
    blinds = await fetch_capped(db.blinds.find({"user_id": user_id}), 1000, "blinds", user_id)
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
        "ideal_wind_directions": b.get("ideal_wind_directions") or [],
        "ideal_wind_center": b.get("ideal_wind_center"),
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
    
    hunts = await fetch_capped(db.hunts.find(query_filter).sort("date", -1), 1000, "hunt list", user_id)
    
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
            # Photos are deliberately omitted here and sent only by the
            # single-hunt endpoint. They're base64 in the document, so including
            # them made opening the list download every photo the user has ever
            # taken — megabytes, on cell service, to render a list that never
            # displayed them. The count keeps the information without the weight.
            "photo_count": len(hunt.get("photos") or []),
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
    hunts = await fetch_capped(db.hunts.find({"user_id": user_id}), 10000, "all hunts", user_id)
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

    # Only blocks logging new hunts. Existing ones stay readable either way —
    # a lapsed subscriber never loses access to what they already recorded.
    if not user_is_pro(current_user):
        hunt_count = await db.hunts.count_documents({"user_id": user_id})
        if hunt_count >= FREE_HUNT_LIMIT:
            raise HTTPException(
                status_code=403,
                detail=f"Free accounts are limited to {FREE_HUNT_LIMIT} hunts. Upgrade to Pro to keep logging.",
            )

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

    stored_photos = await store_photos(hunt_data.photos, user_id)

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
        "photos": stored_photos,
        "harvests": [h.dict() for h in hunt_data.harvests],
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "party": hunt_data.party,
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
        "photos": stored_photos,
        "harvests": hunt_data.harvests,
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "party": hunt_data.party,
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

    # Weather is a fact about a place at a time, so it only needs fetching again
    # if one of those changed. Re-fetching on every save meant renaming a hunt or
    # fixing a harvest count spent an Open-Meteo call — and that quota is shared
    # across everyone on the same host, so idle edits were competing with real
    # lookups. Past weather doesn't change, so the stored copy stays correct.
    existing_weather = existing.get("weather_data")
    weather_inputs_changed = (
        existing.get("date") != hunt_data.date
        or (existing.get("location") or {}).get("lat") != hunt_data.location["lat"]
        or (existing.get("location") or {}).get("lng") != hunt_data.location["lng"]
        or existing.get("is_morning") != hunt_data.is_morning
        or existing.get("is_evening") != hunt_data.is_evening
    )

    if existing_weather and not weather_inputs_changed:
        weather_data = existing_weather
    else:
        weather_data = fetch_weather_data(
            hunt_data.location["lat"],
            hunt_data.location["lng"],
            hunt_data.date,
            is_morning=hunt_data.is_morning,
            is_evening=hunt_data.is_evening,
        )

    # Photos already stored come back as URLs and pass straight through; only
    # genuinely new ones get uploaded.
    stored_photos = await store_photos(hunt_data.photos, user_id)

    # Anything the user removed from the hunt is now unreferenced, so drop it
    # rather than paying to keep orphans forever.
    removed = set(existing.get("photos") or []) - set(stored_photos)
    await delete_photos(removed)

    await db.hunts.update_one({"_id": ObjectId(hunt_id)}, {"$set": {
        "name": hunt_data.name,
        "blind_id": blind_id,
        "blind_name": blind_name,
        "location_type": location_type,
        "date": hunt_data.date,
        "location": hunt_data.location,
        "weather_data": weather_data,
        "notes": hunt_data.notes,
        "photos": stored_photos,
        "harvests": [h.dict() for h in hunt_data.harvests],
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "party": hunt_data.party,
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
        "photos": stored_photos,
        "harvests": hunt_data.harvests,
        "is_morning": hunt_data.is_morning,
        "is_evening": hunt_data.is_evening,
        "party": hunt_data.party,
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
        count = harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0)
        transformed_harvests.append({
            "species_name": harvest.get("species_name") or harvest.get("species", "Unknown"),
            "count": count,
            "mine": harvest.get("mine") if harvest.get("mine") is not None else count,
            "missed": harvest.get("missed", 0),
            "shot_not_recovered": harvest.get("shot_not_recovered", 0),
            "seen": harvest.get("seen", 0),
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
        "party": hunt.get("party", []),
        "created_at": hunt.get("created_at", datetime.utcnow())
    }

@api_router.delete("/hunts/{hunt_id}")
async def delete_hunt(hunt_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    # Read it first so its photos can be cleaned up; deleting the row alone
    # would leave them paid for and unreachable.
    doomed = await db.hunts.find_one({"_id": ObjectId(hunt_id), "user_id": user_id})
    result = await db.hunts.delete_one({"_id": ObjectId(hunt_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hunt not found")
    await delete_photos((doomed or {}).get("photos"))
    return {"message": "Hunt deleted successfully"}

# ============ STATISTICS ROUTES ============

SPECIES_CATEGORIES = {
    "ducks": [
        "Mallard",
        "American Wigeon", "Black Duck", "Eurasian Wigeon", "Gadwall", "Mottled Duck", "Pintail", "Shoveler", "Wood Duck",
        "Blue-winged Teal", "Cinnamon Teal", "Green-winged Teal",
        "Barrow's Goldeneye", "Bufflehead", "Canvasback", "Common Goldeneye", "Common Merganser", "Hooded Merganser", "Long-tailed Duck", "Red-breasted Merganser", "Redhead", "Ring-necked Duck", "Ruddy Duck",
        "Greater Scaup", "Lesser Scaup",
    ],
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
async def get_statistics(year: Optional[int] = None, current_user: dict = Depends(require_pro)):
    user_id = str(current_user["_id"])

    query_filter = {"user_id": user_id}
    if year:
        query_filter["date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}

    hunts = await fetch_capped(db.hunts.find(query_filter), 10000, "hunts for statistics", user_id)

    # Resolve blind → location name once
    blinds = await fetch_capped(db.blinds.find({"user_id": user_id}), 1000, "blinds", user_id)
    locations = await fetch_capped(db.locations.find({"user_id": user_id}), 1000, "locations", user_id)
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

    # Group-hunt (party) aggregates — kept separate from the personal stats above.
    group_hunts = 0
    group_total_harvested = 0
    group_party_size_sum = 0
    group_by_species = {}

    for hunt in sorted(hunts, key=lambda h: h.get("date", "")):
        party = hunt.get("party") or []
        is_group_hunt = len(party) > 0
        hunt_harvested = 0        # personal (mine) total for this hunt
        hunt_group_harvested = 0  # full party total for this hunt
        for harvest in hunt.get("harvests", []):
            species = harvest.get("species_name") or harvest.get("species", "Unknown")
            count = harvest.get("count") if harvest.get("count") is not None else harvest.get("harvested", 0)
            mine = harvest.get("mine") if harvest.get("mine") is not None else count
            missed = harvest.get("missed", 0)
            shot_not_recovered = harvest.get("shot_not_recovered", 0)
            seen = harvest.get("seen", 0)

            total_harvested += mine
            total_missed += missed
            total_shot_not_recovered += shot_not_recovered
            total_seen += seen
            hunt_harvested += mine
            hunt_group_harvested += count

            if species in SPECIES_CATEGORIES["ducks"]:
                ducks_total += mine
            elif species in SPECIES_CATEGORIES["geese"]:
                geese_total += mine
            else:
                others_total += mine

            if species not in by_species:
                by_species[species] = {"harvested": 0, "missed": 0, "shot_not_recovered": 0, "seen": 0}
            by_species[species]["harvested"] += mine
            by_species[species]["missed"] += missed
            by_species[species]["shot_not_recovered"] += shot_not_recovered
            by_species[species]["seen"] = by_species[species].get("seen", 0) + seen

            if is_group_hunt and count:
                group_by_species[species] = group_by_species.get(species, 0) + count

        if is_group_hunt:
            group_hunts += 1
            group_total_harvested += hunt_group_harvested
            group_party_size_sum += len(party) + 1

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
                m = harvest.get("mine") if harvest.get("mine") is not None else c
                if m:
                    sp_map[sp] = sp_map.get(sp, 0) + m

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
        "group": {
            "hunts": group_hunts,
            "total_harvested": group_total_harvested,
            "avg_party_size": round(group_party_size_sum / group_hunts, 1) if group_hunts else 0,
            "by_species": group_by_species,
        } if group_hunts > 0 else None,
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

# Per-blind ideal wind direction (set on the Blind, matched against forecast wind readings).
# This only ever produces a callout, never a score adjustment — hunt_score stays purely
# about bird activity (weather/migration/timing), independent of any specific blind.

def _wind_match(wind_cardinal: str, ideal_directions: list, ideal_center: Optional[str]) -> Optional[str]:
    if not ideal_directions or wind_cardinal not in ideal_directions:
        return None
    return "perfect" if wind_cardinal == ideal_center else "good"


def _best_window_match(readings: list, ideal_directions: list, ideal_center: Optional[str]) -> Optional[str]:
    """Wind can shift over a multi-hour window, so check whether ideal wind occurred
    at any point in it rather than reducing to a single averaged reading."""
    best = None
    for r in readings:
        level = _wind_match(r["cardinal"], ideal_directions, ideal_center)
        if level == "perfect":
            return "perfect"
        if level == "good":
            best = "good"
    return best

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
# open, concentrating birds. Shallow still water locks first; big open water
# (reservoirs, lakes) holds out roughly a week longer before it too ices over.
# We count "frozen" days (daily HIGH never rose above freezing) in two trailing
# windows: a short one for shallow water, a long one for big water.
FREEZE_HIGH_TEMP = 32       # a day whose HIGH stays ≤ this never thawed
SHALLOW_WINDOW = 5          # days (incl. current) for shallow-water lock
SHALLOW_LOCK_DAYS = 4       # ≥ this many frozen days → shallow water locked
SHALLOW_PARTIAL_DAYS = 2    # ≥ this many → shallow water starting to lock
BIG_WINDOW = 12             # longer window: big water lags shallow by ~a week
BIG_LOCK_DAYS = 10          # ≥ this many frozen days → big water locked too
BIG_PARTIAL_DAYS = 7        # ≥ this many → big water starting to lock
FREEZE_LOOKBACK = BIG_WINDOW - 1  # past days to fetch to seed the long window

# Score deltas
MOVING_LOCK_BUMP = 22       # rivers/creeks: only open water around
MOVING_PARTIAL_BUMP = 10
SHALLOW_LOCK_PEN = -32
SHALLOW_PARTIAL_PEN = -14
BIG_LOCK_PEN = -28          # deep freeze: even reservoirs iced
BIG_PARTIAL_PEN = -10
BIG_HOLDS_OPEN_BUMP = 6     # shallow locked but big water still open → birds pile in

# Location types grouped by how freeze-up affects them.
MOVING_WATER = {"creek", "river"}
BIG_OPEN_WATER = {"open-water", "reservoir", "lakeshore", "coastal"}
# cut-corn is typically flooded corn — shallow still water that locks like a marsh.
SHALLOW_STILL_WATER = {"marsh", "swamp", "flooded-timber", "pothole", "beaver-pond", "cut-corn"}
# dry fields ("field") are dry ground — freeze-up doesn't lock them.


def _frozen_days(trailing_highs):
    """Count days whose HIGH stayed at/below freezing (oldest→newest, current last)."""
    return sum(1 for h in trailing_highs if h is not None and h <= FREEZE_HIGH_TEMP)


def _water_group(location_type):
    if location_type in MOVING_WATER:
        return "moving"
    if location_type in BIG_OPEN_WATER:
        return "big_open"
    if location_type in SHALLOW_STILL_WATER:
        return "shallow"
    return "field"


def _freeze_adjustment(location_type, frozen_recent, frozen_extended):
    """Score delta + event for freeze-up, by water type.

    frozen_recent: frozen days in the short window (shallow water)
    frozen_extended: frozen days in the long window (big water)
    """
    group = _water_group(location_type)
    shallow_locked = frozen_recent >= SHALLOW_LOCK_DAYS
    shallow_partial = frozen_recent >= SHALLOW_PARTIAL_DAYS

    if group == "moving":
        if shallow_locked:
            return {"delta": MOVING_LOCK_BUMP, "event": {"type": "open_water", "label": "Open water"}}
        if shallow_partial:
            return {"delta": MOVING_PARTIAL_BUMP, "event": {"type": "open_water", "label": "Open water"}}
        return {"delta": 0, "event": None}

    if group == "shallow":
        if shallow_locked:
            return {"delta": SHALLOW_LOCK_PEN, "event": {"type": "iced", "label": "Likely iced"}}
        if shallow_partial:
            return {"delta": SHALLOW_PARTIAL_PEN, "event": None}
        return {"delta": 0, "event": None}

    if group == "big_open":
        # Deep, prolonged freeze locks big water too (checked first).
        if frozen_extended >= BIG_LOCK_DAYS:
            return {"delta": BIG_LOCK_PEN, "event": {"type": "iced", "label": "Likely iced"}}
        if frozen_extended >= BIG_PARTIAL_DAYS:
            return {"delta": BIG_PARTIAL_PEN, "event": {"type": "iced", "label": "Icing up"}}
        # Still open while shallow water has locked → birds concentrate here.
        if shallow_locked:
            return {"delta": BIG_HOLDS_OPEN_BUMP, "event": {"type": "open_water", "label": "Holds open"}}
        return {"delta": 0, "event": None}

    return {"delta": 0, "event": None}  # dry field


# --- Migration timing model ------------------------------------------------
# "Typical timing" — the seasonal calendar of when birds are usually in the
# area. Two sources, blended by how much real data backs each:
#   1. Generic latitude curve (works day one, no user data).
#   2. The user's own history binned by half-month (birds SEEN preferred,
#      harvested as fallback). Personalizes as data accumulates.
# Coverage-based confidence de-emphasizes any source that isn't well-supported.
TIMING_CONFIDENT_HUNTS = 18   # personal curve fully trusted at this many hunts
TIMING_MIN_BINS = 3           # need this many populated half-months to personalize
SEEN_CONFIDENT_HUNTS = 8      # "seen" fully trusted at this many hunts-with-seen
TIMING_BONUS_MAX = 10
TIMING_BONUS_MIN = -6
# Season half-months, in migration order (Sep → Feb).
SEASON_MONTH_ORDER = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4, 2: 5}

# Empirical migration-intensity curves fitted from real aerial/ground waterfowl
# surveys, normalized 0–100 across the 10 half-months Sep-1 … Jan-2. Each anchor
# is a representative latitude; the model interpolates between anchors by latitude
# and between half-months by date. Sources (all Mississippi flyway):
#   - Ohio: ~40 yrs of ODNR aerial surveys, 1985–2025 (39.0/40.6/41.6°N)
#   - Kentucky: 9 seasons of KDFWR ground counts, 2016–2025 (37.2°N)
#   - Arkansas: 35 AGFC aerial survey reports, 2015–2026, Mississippi Alluvial
#     Valley (Delta) region total (34.7°N). AGFC only surveys Nov–Jan; Sep/Oct
#     are extrapolated from Kentucky's early-season shape rescaled to match
#     Arkansas's own measured Nov-1 value, and Dec-2 is linearly interpolated
#     between the measured Dec-1 and Jan-1 points (flagged inline below).
# Covers ~34.7–41.6°N. Other flyways currently reuse these curves; latitudes
# outside the range clamp to the nearest anchor. Note the wintering-latitude
# anchors (34.7–37.2°N) peak late (Jan) and plateau rather than showing a
# single sharp peak — arrivals there are freeze-pulse driven / terminus
# behavior, not a clean fall migration wave.
#                        Sep1 Sep2 Oct1 Oct2 Nov1 Nov2 Dec1 Dec2 Jan1 Jan2
# Full 104-anchor migration cloud (all 4 flyways), Sep-1 … Jan-2 (10 half-months),
# each curve normalized 0-100 to its own peak. TEAL-EXCLUDED where species data
# allowed. Built + cross-validated offline (LOO peak within-1: 73%% overall;
# Mississippi 80, Atlantic 78, Central 64, Pacific 60). See model-test-report.md.
#   (name, lat, lng, flyway, abundance, curve)
MIGRATION_ANCHORS = [
    ("Arkansas Delta (MAV)", 34.7, -90.9, "Mississippi", 1200000, [15, 19, 29, 39, 63, 65, 81, 90, 100, 93]),
    ("Mississippi Delta", 33.3, -90.6, "Mississippi", 657000, [2, 4, 9, 18, 33, 45, 60, 74, 100, 96]),
    ("Louisiana coast", 29.9, -92.2, "Mississippi", 2500000, [5, 8, 20, 42, 68, 88, 100, 96, 88, 78]),
    ("SE Louisiana", 29.6, -89.8, "Mississippi", 315000, [3, 6, 16, 36, 58, 80, 95, 100, 96, 86]),
    ("White Lake TN", 35.72, -89.72, "Mississippi", 95000, [0, 1, 1, 2, 4, 6, 43, 78, 100, 68]),
    ("Black Bayou TN", 35.8, -89.62, "Mississippi", 12500, [0, 0, 0, 1, 1, 2, 20, 48, 64, 100]),
    ("Lake Lauderdale TN", 35.85, -89.55, "Mississippi", 39500, [0, 0, 0, 0, 0, 0, 13, 57, 100, 11]),
    ("Maness Swamp TN", 35.83, -89.2, "Mississippi", 8000, [0, 0, 1, 2, 3, 5, 38, 100, 91, 25]),
    ("Horns Bluff TN", 35.95, -89.3, "Mississippi", 43000, [0, 1, 2, 4, 6, 10, 72, 100, 60, 0]),
    ("Hop-In TN", 36.35, -89.42, "Mississippi", 44000, [1, 2, 3, 6, 10, 16, 50, 64, 100, 55]),
    ("Cheatham Lake TN", 36.28, -87.15, "Mississippi", 5800, [1, 1, 2, 5, 8, 12, 22, 100, 91, 91]),
    ("Old Hickory L5 TN", 36.28, -86.65, "Mississippi", 6600, [1, 3, 5, 11, 18, 27, 42, 45, 79, 100]),
    ("Ballard area KY", 37.05, -89.02, "Mississippi", 130000, [2, 4, 9, 20, 39, 48, 61, 74, 90, 100]),
    ("Sloughs KY", 37.72, -87.62, "Mississippi", 15000, [2, 4, 8, 18, 45, 60, 90, 100, 93, 86]),
    ("Southern Ohio", 39.0, -82.9, "Mississippi", 15261, [1, 1, 2, 7, 10, 38, 50, 45, 60, 100]),
    ("North-central Ohio", 40.6, -82.9, "Mississippi", 416678, [6, 11, 23, 48, 71, 100, 59, 45, 38, 34]),
    ("Lake Erie marshes", 41.6, -83.2, "Mississippi", 190013, [5, 6, 20, 64, 92, 100, 92, 68, 15, 0]),
    ("Ohio River Zone", 38.7, -83.5, "Mississippi", 5642, [6, 11, 13, 43, 56, 57, 70, 59, 51, 100]),
    ("Crescent Lake", 41.75, -102.45, "Central", 33866, [71, 92, 100, 80, 45, 18, 10, 1, 1, 0]),
    ("North Platte", 41.75, -103.65, "Central", 163855, [1, 3, 7, 29, 63, 93, 100, 85, 65, 54]),
    ("Kirwin", 39.68, -99.2, "Central", 216960, [1, 4, 13, 35, 64, 92, 100, 95, 87, 85]),
    ("Flint Hills", 38.4, -95.75, "Central", 89075, [5, 6, 14, 42, 75, 97, 100, 86, 70, 56]),
    ("Quivira", 38.1, -98.5, "Central", 475710, [14, 21, 36, 57, 79, 96, 100, 91, 80, 73]),
    ("Salt Plains", 36.78, -98.2, "Central", 119156, [13, 20, 46, 75, 97, 97, 100, 95, 95, 84]),
    ("Washita", 35.75, -99.3, "Central", 131135, [1, 1, 8, 20, 35, 64, 87, 100, 95, 89]),
    ("Deep Fork", 35.55, -96.1, "Central", 4335, [17, 17, 17, 37, 61, 81, 94, 98, 100, 93]),
    ("Tishomingo", 34.2, -96.62, "Central", 46410, [4, 4, 8, 58, 83, 100, 74, 70, 51, 38]),
    ("Bosque del Apache", 33.8, -106.88, "Central", 82174, [5, 10, 29, 60, 88, 100, 93, 86, 77, 76]),
    ("Bitter Lake", 33.45, -104.4, "Central", 13571, [29, 32, 42, 63, 84, 95, 100, 94, 86, 77]),
    ("Texas Point", 29.68, -93.93, "Central", 38566, [2, 6, 19, 78, 90, 100, 48, 38, 35, 41]),
    ("McFaddin", 29.68, -94.08, "Central", 161598, [2, 5, 11, 33, 47, 81, 79, 88, 88, 100]),
    ("Attwater Prairie Chicken", 29.67, -96.28, "Central", 49375, [1, 1, 4, 9, 30, 60, 100, 80, 85, 60]),
    ("Anahuac", 29.62, -94.52, "Central", 207301, [3, 6, 16, 39, 66, 87, 100, 84, 77, 59]),
    ("Brazoria", 29.03, -95.25, "Central", 60389, [3, 15, 30, 69, 87, 100, 97, 95, 93, 82]),
    ("San Bernard", 28.88, -95.58, "Central", 56858, [2, 9, 21, 43, 75, 89, 100, 95, 89, 82]),
    ("Big Boggy", 28.85, -95.83, "Central", 27650, [5, 20, 32, 67, 83, 100, 82, 65, 58, 57]),
    ("Aransas", 28.3, -96.8, "Central", 253124, [2, 9, 15, 51, 76, 93, 100, 69, 63, 28]),
    ("Matagorda Island", 28.2, -96.45, "Central", 801024, [1, 3, 7, 28, 48, 81, 93, 86, 100, 100]),
    ("Laguna Atascosa", 26.3, -97.35, "Central", 408783, [2, 7, 24, 63, 89, 100, 96, 91, 80, 66]),
    ("Arrowwood ND", 47.2, -98.8, "Central", 80000, [25, 55, 85, 100, 88, 45, 20, 10, 5, 3]),
    ("Upper Souris ND", 48.6, -101.5, "Central", 120000, [30, 60, 88, 100, 70, 32, 15, 7, 3, 1]),
    ("DE zone 1", 39.75, -75.52, "Atlantic", 6407, [0, 8, 24, 32, 32, 53, 94, 100, 72, 58]),
    ("DE zone 2", 39.6, -75.55, "Atlantic", 5626, [6, 16, 34, 53, 73, 89, 100, 93, 67, 54]),
    ("DE zone 3", 39.45, -75.5, "Atlantic", 15508, [4, 28, 76, 100, 99, 99, 97, 88, 69, 60]),
    ("DE zone 4", 39.35, -75.45, "Atlantic", 3508, [34, 48, 74, 83, 73, 78, 97, 100, 88, 82]),
    ("DE zone 5", 39.27, -75.47, "Atlantic", 39506, [21, 33, 55, 71, 80, 89, 99, 100, 93, 90]),
    ("DE zone 6", 39.15, -75.43, "Atlantic", 17325, [34, 42, 56, 70, 82, 92, 99, 100, 94, 91]),
    ("DE zone 7", 39.02, -75.4, "Atlantic", 45794, [14, 34, 72, 94, 100, 95, 78, 66, 59, 55]),
    ("DE zone 8", 38.88, -75.33, "Atlantic", 6172, [44, 51, 64, 78, 92, 99, 100, 94, 82, 75]),
    ("DE zone 9", 38.75, -75.28, "Atlantic", 2415, [10, 13, 18, 28, 44, 65, 90, 100, 95, 93]),
    ("DE zone 10", 38.6, -75.13, "Atlantic", 2331, [3, 7, 15, 22, 26, 40, 63, 81, 94, 100]),
    ("DE zone 11", 38.5, -75.07, "Atlantic", 5103, [23, 28, 39, 53, 71, 87, 100, 99, 82, 74]),
    ("Blackwater MD", 38.4, -76.06, "Atlantic", 7900, [1, 3, 6, 12, 30, 51, 57, 100, 47, 42]),
    ("Mattamuskeet NC", 35.45, -76.18, "Atlantic", 120000, [5, 12, 28, 40, 46, 70, 100, 93, 68, 59]),
    ("South Carolina coast", 33.2, -80.35, "Atlantic", 100000, [8, 12, 16, 24, 34, 48, 66, 84, 100, 96]),
    ("Georgia coast", 31.3, -81.4, "Atlantic", 86706, [7, 11, 20, 34, 50, 68, 86, 100, 96, 84]),
    ("St. Marks FL", 30.1, -84.2, "Atlantic", 50000, [6, 10, 25, 45, 68, 88, 100, 92, 78, 68]),
    ("Lake Champlain VT", 44.4, -73.3, "Atlantic", 7844, [20, 35, 60, 85, 100, 88, 55, 25, 10, 5]),
    ("Montezuma NY", 43.0, -76.75, "Atlantic", 120000, [5, 14, 32, 58, 92, 100, 55, 28, 15, 9]),
    ("Hennepin IL", 41.28, -89.34, "Mississippi", 40400, [5, 4, 52, 100, 93, 61, 19, 14, 5, 3]),
    ("Senachwine IL", 41.1, -89.35, "Mississippi", 25250, [2, 6, 20, 35, 92, 100, 12, 32, 13, 9]),
    ("Douglas Lake IL", 40.95, -89.5, "Mississippi", 67500, [5, 3, 33, 63, 71, 100, 23, 60, 30, 21]),
    ("Upper Peoria IL", 40.75, -89.6, "Mississippi", 29320, [0, 0, 23, 46, 97, 100, 80, 52, 54, 38]),
    ("Duck Creek IL", 40.58, -89.92, "Mississippi", 42720, [0, 0, 12, 25, 91, 44, 100, 70, 34, 23]),
    ("Clear Lake IL", 40.55, -89.9, "Mississippi", 15980, [10, 21, 53, 85, 61, 100, 32, 49, 52, 36]),
    ("Rice Lake IL", 40.47, -90.1, "Mississippi", 6715, [1, 0, 18, 35, 100, 76, 17, 35, 86, 60]),
    ("Chautauqua IL", 40.42, -90.16, "Mississippi", 122050, [7, 15, 29, 43, 64, 100, 39, 31, 9, 7]),
    ("Big Lake IRV IL", 40.38, -90.1, "Mississippi", 14250, [1, 2, 47, 91, 92, 100, 22, 39, 54, 38]),
    ("Emiquon IL", 40.32, -90.05, "Mississippi", 127020, [8, 17, 59, 100, 65, 16, 8, 20, 25, 17]),
    ("Louisa MR", 41.2, -91.02, "Mississippi", 8300, [0, 1, 10, 18, 41, 77, 95, 100, 25, 18]),
    ("Keithsburg MR", 41.1, -90.93, "Mississippi", 4180, [0, 0, 4, 7, 7, 16, 29, 74, 100, 70]),
    ("Henderson Ck MR", 40.83, -90.92, "Mississippi", 19050, [8, 3, 17, 31, 100, 62, 19, 47, 10, 7]),
    ("Nauvoo-FtMad MR", 40.62, -91.35, "Mississippi", 17250, [5, 0, 1, 2, 51, 54, 100, 66, 34, 24]),
    ("Keokuk-Nauvoo MR", 40.45, -91.4, "Mississippi", 18090, [0, 0, 1, 2, 22, 100, 88, 16, 30, 21]),
    ("Delair MR", 39.6, -91.25, "Mississippi", 49100, [3, 1, 11, 21, 22, 17, 100, 65, 11, 8]),
    ("Shanks MR", 39.42, -90.95, "Mississippi", 29600, [5, 0, 5, 10, 20, 65, 100, 5, 44, 31]),
    ("Swan Lake MR", 39.3, -90.7, "Mississippi", 44320, [4, 20, 37, 53, 100, 8, 53, 26, 4, 3]),
    ("Cannon MR", 39.2, -90.68, "Mississippi", 71000, [0, 0, 8, 16, 100, 71, 25, 1, 9, 6]),
    ("Towhead MR", 39.1, -90.62, "Mississippi", 9150, [2, 1, 38, 74, 23, 57, 84, 100, 28, 20]),
    ("Cuivre Club MR", 39.02, -90.72, "Mississippi", 86000, [0, 0, 6, 13, 12, 13, 100, 95, 24, 17]),
    ("Batchtown MR", 38.98, -90.68, "Mississippi", 12600, [0, 0, 15, 30, 12, 10, 100, 79, 14, 10]),
    ("Dardenne MR", 38.85, -90.42, "Mississippi", 75300, [0, 0, 13, 26, 34, 100, 69, 20, 18, 12]),
    ("Long Lake MR", 38.9, -90.5, "Mississippi", 12200, [0, 0, 5, 10, 27, 39, 100, 25, 57, 40]),
    ("Sacramento Valley", 39.4, -122.2, "Pacific", 901000, [20, 25, 65, 74, 94, 100, 85, 75, 78, 64]),
    ("Summer Lake OR", 42.85, -120.78, "Pacific", 35000, [58, 72, 100, 89, 72, 45, 23, 16, 12, 12]),
    ("Klamath Basin", 41.9, -121.8, "Pacific", 1200000, [30, 50, 78, 100, 82, 58, 38, 25, 18, 14]),
    ("Bear River UT", 41.45, -112.25, "Pacific", 220000, [30, 50, 75, 95, 100, 65, 35, 18, 8, 4]),
    ("San Joaquin CA", 37.2, -120.9, "Pacific", 260619, [12, 18, 42, 62, 82, 95, 100, 92, 82, 68]),
    ("Salton Sea CA", 33.18, -115.62, "Pacific", 60000, [8, 12, 28, 48, 72, 90, 100, 98, 90, 85]),
    ("Columbia Basin WA", 46.9, -119.3, "Pacific", 268000, [18, 28, 48, 68, 85, 95, 100, 92, 78, 58]),
    ("Stillwater NV", 39.5, -118.55, "Pacific", 100000, [30, 55, 85, 100, 78, 42, 20, 9, 4, 2]),
    ("Ruby Lake NV", 40.15, -115.5, "Pacific", 150000, [28, 52, 82, 100, 82, 50, 26, 12, 6, 3]),
    ("Malheur OR", 43.25, -118.85, "Pacific", 150000, [42, 68, 92, 100, 72, 42, 22, 10, 5, 3]),
    ("Cibola AZ", 33.3, -114.68, "Pacific", 20000, [3, 5, 12, 25, 45, 68, 90, 100, 95, 88]),
    ("Kern NWR CA", 35.73, -119.6, "Pacific", 44058, [10, 15, 35, 55, 78, 92, 100, 95, 85, 72]),
    ("Pahranagat NV", 37.27, -115.12, "Pacific", 12000, [5, 8, 20, 40, 65, 88, 100, 95, 85, 75]),
    ("Cheyenne Bottoms KS", 38.48, -98.65, "Central", 50000, [15, 32, 62, 92, 100, 72, 42, 24, 14, 9]),
    ("Lacreek SD", 43.1, -101.7, "Central", 29000, [30, 55, 85, 100, 78, 48, 24, 11, 5, 3]),
    ("Sand Lake SD", 45.7, -98.3, "Central", 100000, [35, 62, 90, 100, 70, 38, 18, 9, 4, 2]),
    ("Monte Vista CO", 37.5, -106.1, "Central", 30000, [20, 40, 70, 95, 100, 72, 44, 25, 15, 10]),
    ("Skagit WA", 48.35, -122.35, "Pacific", 50000, [12, 22, 45, 68, 88, 100, 90, 78, 68, 58]),
    ("Lower Columbia OR", 45.72, -122.8, "Pacific", 120000, [10, 16, 38, 60, 82, 94, 100, 94, 84, 70]),
    ("Freezeout Lake MT", 47.6, -112.0, "Central", 50000, [30, 55, 82, 100, 80, 50, 25, 12, 6, 3]),
    ("Downeast Maine", 45.1, -67.3, "Atlantic", 365977, [15, 25, 48, 70, 90, 100, 82, 62, 45, 35]),
]
# Blend params (fit offline against leave-one-out accuracy).
_MIG_P = 1.5        # IDW power
_MIG_R = 1.2        # east-west vs north-south anisotropy (flyways run N-S)
_MIG_ABUND_EXP = 0.38   # compression on magnitude weight (big sites vote harder, sub-linearly)
_MIG_ABUND_DEFAULT = 40000
_DAYS_IN_MONTH = {9: 30, 10: 31, 11: 30, 12: 31, 1: 31}


def _flyway(lng: float) -> str:
    if lng < -114:
        return "Pacific"
    if lng < -95:
        return "Central"
    if lng < -82:
        return "Mississippi"
    return "Atlantic"


def _bin_coordinate(date_str: str):
    """Map a date to a continuous half-month index 0..9 (Sep-1 … Jan-2), or None."""
    from datetime import date as _d
    d = _d.fromisoformat(date_str)
    pos = SEASON_MONTH_ORDER.get(d.month)
    if pos is None or d.month == 2:   # Feb+ handled as off-season here
        return None
    frac = (d.day - 1) / _DAYS_IN_MONTH[d.month]   # 0..~1 within the month
    return max(0.0, min(9.0, pos * 2 + frac * 2))


def _curve_at(curve, x: float) -> float:
    lo = int(x)
    if lo >= 9:
        return float(curve[9])
    return curve[lo] + (curve[lo + 1] - curve[lo]) * (x - lo)


def _blend_curve(lat: float, lng: float):
    """Anisotropic IDW blend of the anchor curves at (lat,lng) -> 10-bin list 0-100.
    distance = sqrt(dlat^2 + (R*dlng)^2); weight = (1/dist^P) * abundance^ABUND_EXP.
    Exact-hit on an anchor returns that anchor's curve."""
    num = [0.0] * 10
    den = 0.0
    for _nm, alat, alng, _fw, ab, curve in MIGRATION_ANCHORS:
        dlat = lat - alat
        dlng = lng - alng
        dist = (dlat * dlat + (_MIG_R * dlng) * (_MIG_R * dlng)) ** 0.5
        if dist < 1e-9:
            return list(curve)
        w = (1.0 / dist ** _MIG_P) * (ab or _MIG_ABUND_DEFAULT) ** _MIG_ABUND_EXP
        for i in range(10):
            num[i] += w * curve[i]
        den += w
    return [num[i] / den for i in range(10)] if den else [0.0] * 10


def _generic_migration_timing(lat: float, lng: float, date_str: str) -> float:
    """0-100 typical migration intensity at (lat,lng,date), blended from the
    104-anchor cloud (all four flyways, teal-excluded where data allowed)."""
    x = _bin_coordinate(date_str)
    if x is None:
        return 8.0   # off-season (Feb-Aug)
    return _curve_at(_blend_curve(lat, lng), x)


def _season_bin(date_str: str):
    from datetime import date as _d
    d = _d.fromisoformat(date_str)
    pos = SEASON_MONTH_ORDER.get(d.month)
    if pos is None:
        return None
    return pos * 2 + (0 if d.day <= 15 else 1)


async def _migration_timing_profile(user_id: str):
    """Bin the user's hunts by half-month; track birds seen vs harvested."""
    hunts = await fetch_capped(db.hunts.find({"user_id": user_id}), 10000, "all hunts", user_id)
    bins = {}  # bin -> {seen, harv, hunts}
    seen_hunts = 0
    total = 0
    for hunt in hunts:
        b = _season_bin(hunt.get("date", "")) if hunt.get("date") else None
        if b is None:
            continue
        seen = sum(h.get("seen", 0) for h in hunt.get("harvests", []))
        harv = sum((h.get("count") if h.get("count") is not None else h.get("harvested", 0))
                   for h in hunt.get("harvests", []))
        rec = bins.setdefault(b, {"seen": 0, "harv": 0, "hunts": 0})
        rec["seen"] += seen
        rec["harv"] += harv
        rec["hunts"] += 1
        total += 1
        if seen > 0:
            seen_hunts += 1

    def norm_curve(metric):
        vals = {b: r[metric] / r["hunts"] for b, r in bins.items() if r["hunts"] > 0}
        if len(vals) < 2:
            return {}
        lo, hi = min(vals.values()), max(vals.values())
        if hi <= lo:
            return {b: 50.0 for b in vals}
        return {b: (v - lo) / (hi - lo) * 100 for b, v in vals.items()}

    return {
        "seen_norm": norm_curve("seen"),
        "harv_norm": norm_curve("harv"),
        "populated_bins": len(bins),
        "total_hunts": total,
        "seen_hunts": seen_hunts,
        "has_seen": seen_hunts > 0,
    }


def _blended_timing(date_str: str, lat: float, lng: float, profile: dict) -> dict:
    """Blend generic calendar with personal history by data confidence."""
    generic = _generic_migration_timing(lat, lng, date_str)
    b = _season_bin(date_str)

    personal_conf = 0.0
    personal_val = None
    if profile["populated_bins"] >= TIMING_MIN_BINS and b is not None:
        seen_v = profile["seen_norm"].get(b)
        harv_v = profile["harv_norm"].get(b)
        if profile["has_seen"] and seen_v is not None:
            seen_conf = min(1.0, profile["seen_hunts"] / SEEN_CONFIDENT_HUNTS)
            if harv_v is not None:
                personal_val = seen_conf * seen_v + (1 - seen_conf) * harv_v
            else:
                personal_val = seen_v
        elif harv_v is not None:
            personal_val = harv_v
        if personal_val is not None:
            personal_conf = min(1.0, profile["total_hunts"] / TIMING_CONFIDENT_HUNTS)

    if personal_val is not None and personal_conf > 0:
        score = personal_conf * personal_val + (1 - personal_conf) * generic
        source = "personal" if personal_conf >= 0.5 else "mixed"
    else:
        score = generic
        source = "typical"

    # Direction: is the season building toward peak or tapering off?
    from datetime import date as _d, timedelta
    ahead = (_d.fromisoformat(date_str) + timedelta(days=10)).isoformat()
    slope = _generic_migration_timing(lat, lng, ahead) - generic

    if score >= 70 and abs(slope) < 8:
        label = "Peak"
    elif slope >= 5:
        label = "Building"
    elif slope <= -5:
        label = "Tapering"
    elif score < 30:
        label = "Slow"
    else:
        label = "Active"

    return {"score": round(score), "label": label, "source": source, "flyway": _flyway(lng)}


def _timing_bonus(score: float) -> int:
    return round(max(TIMING_BONUS_MIN, min(TIMING_BONUS_MAX, (score - 55) * 0.22)))


# --- Score shaping ---------------------------------------------------------
# Migration timing and moon phase apply as MULTIPLIERS, not addends.
#
# Everything upstream of this (base conditions, migration index, event bonuses,
# freeze) is additive, which means any one ingredient can substitute for any
# other. Backtested against 2,604 real in-season days across 4 locations and 7
# seasons, that let a cold snowy day with RISING pressure and no front reach
# 100, and put 64% of all 99+ days on a full or gibbous moon — exactly when
# birds have been feeding all night and sit tight at dawn.
#
# Multiplying instead forces the conjunction the domain actually calls for:
# peak migration AND a front AND a dark moon. Off-peak or a bright moon caps
# the day no matter how good the weather looks.
#
# Values below are fitted, not guessed — see the tuning notes in the PR. With
# them, 99+ drops from 0.89 to 0.32 days per location-season, every 99+ day has
# both a cold front and a north wind, and the average migration-timing score of
# a 90+ day rises from 61 to 74.
# Calibrated against 2,604 real in-season days (Open-Meteo archive, 2019-2026)
# across four real Ohio locations. Target: a 99+ day happens roughly once per
# three location-seasons, and every 99+ day carries a genuine cold front and a
# north wind. Changing any constant here without re-running that backtest will
# quietly break the calibration.
SCORE_RAW_SCALE = 0.912
TIMING_MULT_MIN = 0.55    # dead season
TIMING_MULT_MAX = 1.30    # peak migration
MOON_MULT_NEW = 1.00      # new moon / dark sky
MOON_MULT_FULL = 0.88     # full moon — they moved and fed overnight

# Timing is asymmetric around the local peak. BEFORE the peak a low timing score
# means the birds genuinely have not arrived and no weather invents them, so the
# penalty runs all the way to TIMING_MULT_MIN. AFTER the peak the northern
# reservoir is what matters: a hard push delivers birds that are staged upstream,
# so a strong migration signal RESTORES timing toward (but never to) peak.
# Without this, a legitimate late-January front could never top a season.
TIMING_PUSH_TARGET = 85.0    # a full push feels like a good day, not a peak one
TIMING_PUSH_STRENGTH = 0.70  # how much of the gap to TARGET a full push closes

# A full moon costs less when something else is already forcing birds to move —
# a hard front, or a freeze that has left one piece of open water. They fed all
# night or they didn't; if the marsh is locked they are on your river regardless.
MOON_DAMP_MAX = 0.60         # at most 60% of the moon penalty can be muted

# Freeze concentration is a MULTIPLIER, not an addend. As an addend it was dead
# weight: on a hard-freeze day the additive stack (base + events + freeze) is
# already clipped at 100, so raising the bump changed nothing. Applied here it
# survives the clip. Moving water only — a marsh cannot concentrate birds by
# freezing, it just becomes unhuntable (that penalty lives in _freeze_adjustment).
FREEZE_CONCENTRATION_MULT = 1.15


def _past_peak(lat: float, lng: float, date_str: str) -> bool:
    """Is this date past the local migration peak for this location?"""
    x = _bin_coordinate(date_str)
    if x is None:
        return True   # Feb-Aug: everything is 'after' as far as this matters
    curve = _blend_curve(lat, lng)
    peak_idx = max(range(10), key=lambda i: curve[i])
    return x > peak_idx


def _effective_timing(timing_score: float, migration_score: float, past_peak: bool) -> float:
    """Post-peak, a strong push restores timing toward TIMING_PUSH_TARGET."""
    if not past_peak:
        return timing_score
    gap = TIMING_PUSH_TARGET - timing_score
    if gap <= 0:
        return timing_score
    return timing_score + gap * (max(0.0, min(100.0, migration_score)) / 100.0) * TIMING_PUSH_STRENGTH


def _timing_multiplier(timing_score: float) -> float:
    t = max(0.0, min(100.0, timing_score))
    return TIMING_MULT_MIN + (TIMING_MULT_MAX - TIMING_MULT_MIN) * (t / 100.0)


def _drive_strength(migration_score: float, freeze_delta: float) -> float:
    """0-1: how hard something other than the moon is pushing birds today."""
    by_front = max(0.0, min(100.0, migration_score)) / 100.0
    by_freeze = max(0.0, freeze_delta) / float(MOVING_LOCK_BUMP)
    return max(0.0, min(1.0, max(by_front, by_freeze)))


def _moon_multiplier(illumination: float, drive: float = 0.0) -> float:
    il = max(0.0, min(100.0, illumination))
    base = MOON_MULT_NEW - (MOON_MULT_NEW - MOON_MULT_FULL) * (il / 100.0)
    return base + (1.0 - base) * max(0.0, min(1.0, drive)) * MOON_DAMP_MAX


def _freeze_concentration_multiplier(location_type, frozen_recent: int) -> float:
    """Moving water is the only thing open once everything else locks."""
    if _water_group(location_type) != "moving":
        return 1.0
    if frozen_recent >= SHALLOW_LOCK_DAYS:
        lock = 1.0
    elif frozen_recent >= SHALLOW_PARTIAL_DAYS:
        lock = 0.5
    else:
        return 1.0
    return 1.0 + (FREEZE_CONCENTRATION_MULT - 1.0) * lock


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
    hunts = await fetch_capped(db.hunts.find({"user_id": user_id}), 10000, "all hunts", user_id)
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


# Open-Meteo's free tier has a daily request cap shared across every Railway
# tenant on the same egress IP; without caching, every forecast page load
# re-fetches all locations from scratch. Cache each coordinate's response for
# 6h (~4 refreshes/day/location) so normal usage can't burn through the quota.
FORECAST_CACHE_TTL_SECONDS = 6 * 60 * 60
_forecast_cache: Dict[str, tuple] = {}  # cache_key -> (fetched_at, data)


def _forecast_cache_key(lat: float, lng: float, days: int) -> str:
    return f"{round(lat, 2)},{round(lng, 2)},{days}"


async def forecast_for(lat: float, lng: float, days: int = 7):
    """Forecast for a point, cached in the database as well as in memory.

    The in-process cache is emptied by every restart, and this app redeploys on
    every push — so an afternoon of ordinary work could re-fetch the same
    forecasts over and over against a quota that has no API key and is shared
    with everything else on this host. Persisting it means a deploy costs
    nothing, and the cache would still be shared if this ever runs as more than
    one instance.
    """
    key = _forecast_cache_key(lat, lng, days)

    cached = _forecast_cache.get(key)
    if cached and (time.time() - cached[0]) < FORECAST_CACHE_TTL_SECONDS:
        return copy.deepcopy(cached[1])

    try:
        doc = await db.forecast_cache.find_one(
            {"_id": key, "expires_at": {"$gt": datetime.utcnow()}}
        )
    except Exception as e:
        logger.warning(f"Forecast cache read failed for {key}: {e}")
        doc = None

    if doc and doc.get("data"):
        _forecast_cache[key] = (time.time(), doc["data"])
        return copy.deepcopy(doc["data"])

    data = fetch_forecast_data(lat, lng, days)

    # Failures come back as [] and are deliberately not stored — caching an
    # outage for six hours would turn a blip into an empty Forecast tab.
    if data:
        try:
            now = datetime.utcnow()
            await db.forecast_cache.replace_one(
                {"_id": key},
                {
                    "_id": key,
                    "data": data,
                    "fetched_at": now,
                    "expires_at": now + timedelta(seconds=FORECAST_CACHE_TTL_SECONDS),
                },
                upsert=True,
            )
        except Exception as e:
            # A cache that can't be written is a slow app, not a broken one.
            logger.warning(f"Forecast cache write failed for {key}: {e}")

    return data


def fetch_forecast_data(lat: float, lng: float, days: int = 7):
    """Fetch multi-day forecast from Open-Meteo. Returns list of per-day dicts."""
    cache_key = _forecast_cache_key(lat, lng, days)
    cached = _forecast_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < FORECAST_CACHE_TTL_SECONDS:
        return copy.deepcopy(cached[1])
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
            "hourly": "surface_pressure,windspeed_10m,winddirection_10m",
            "temperature_unit": "fahrenheit",
            "windspeed_unit": "mph",
            # See note in fetch_weather_data: Open-Meteo defaults to mm, but the
            # rain-event threshold below (>= 0.1) is written for inches.
            "precipitation_unit": "inch",
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

        # Hourly wind grouped by day, for morning/evening window matching against blinds.
        wind_times_by_day: Dict[str, list] = {}
        wind_speeds_by_day: Dict[str, list] = {}
        wind_dirs_by_day: Dict[str, list] = {}
        for t, sp, di in zip(hourly.get("time", []), hourly.get("windspeed_10m", []), hourly.get("winddirection_10m", [])):
            d = t[:10]
            wind_times_by_day.setdefault(d, []).append(t)
            wind_speeds_by_day.setdefault(d, []).append(sp)
            wind_dirs_by_day.setdefault(d, []).append(di)

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

            # Trailing windows of daily highs (incl. today) for freeze-up state:
            # short window drives shallow water, long window drives big water.
            frozen_recent = _frozen_days(highs_raw[max(0, i - SHALLOW_WINDOW + 1): i + 1])
            frozen_extended = _frozen_days(highs_raw[max(0, i - BIG_WINDOW + 1): i + 1])

            # Only surface today onward; past days exist solely to seed the windows
            if d >= today:
                sunrise_hour = int(sunrise[11:13]) if len(sunrise) >= 13 else 6
                sunset_hour = int(sunset[11:13]) if len(sunset) >= 13 else 19
                evening_start = max(sunrise_hour, sunset_hour - 5)
                wind_morning = _filter_wind_window(
                    wind_times_by_day.get(d, []), wind_speeds_by_day.get(d, []), wind_dirs_by_day.get(d, []),
                    sunrise_hour, 12
                )
                wind_evening = _filter_wind_window(
                    wind_times_by_day.get(d, []), wind_speeds_by_day.get(d, []), wind_dirs_by_day.get(d, []),
                    evening_start, sunset_hour
                )
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
                    "wind_morning": wind_morning,
                    "wind_evening": wind_evening,
                    "pressure_trend": _pressure_trend(press_delta) if press_delta is not None else "steady",
                    "frozen_recent": frozen_recent,
                    "frozen_extended": frozen_extended,
                    "sunrise": sunrise[11:16] if len(sunrise) >= 16 else "",
                    "sunset": sunset[11:16] if len(sunset) >= 16 else "",
                    "_prev_temp": prev_temp,
                    "_press_delta": press_delta,
                })
            prev_temp = temp_max
        _forecast_cache[cache_key] = (time.time(), out)
        return copy.deepcopy(out)
    except Exception as e:
        logger.error(f"Open-Meteo forecast error: {e}")
        return []


@api_router.get("/forecast")
async def get_forecast(current_user: dict = Depends(require_pro)):
    user_id = str(current_user["_id"])
    locations = await fetch_capped(db.locations.find({"user_id": user_id}).sort("name", 1), 1000, "locations", user_id)
    profile = await _user_condition_profile(user_id)
    use_history = profile["sample"] >= HISTORY_MIN_HUNTS
    timing_profile = await _migration_timing_profile(user_id)

    all_blinds = await fetch_capped(db.blinds.find({"user_id": user_id}), 1000, "blinds", user_id)
    blinds_by_location: Dict[str, list] = {}
    for b in all_blinds:
        if b.get("ideal_wind_directions"):
            blinds_by_location.setdefault(b["location_id"], []).append(b)

    results = []
    best_bets = []
    blind_wind_by_day: Dict[str, dict] = {}
    for loc in locations:
        center = loc.get("center") or {}
        lat, lng = center.get("lat"), center.get("lng")
        if lat is None or lng is None:
            continue
        days = await forecast_for(lat, lng, 7)
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

            # Freeze-up: shallow water locks first, big water lags ~a week
            fz = _freeze_adjustment(loc.get("location_type"),
                                    day["frozen_recent"], day["frozen_extended"])
            score = max(0, min(100, score + fz["delta"]))
            events = evt["events"] + ([fz["event"]] if fz["event"] else [])

            # Timing, moon and freeze-concentration all apply multiplicatively, so
            # a missing ingredient scales the day down instead of being covered by
            # another. See the block above _past_peak for what each one encodes.
            timing = _blended_timing(day["date"], lat, lng, timing_profile)
            eff_timing = _effective_timing(timing["score"], mig["score"],
                                           _past_peak(lat, lng, day["date"]))
            drive = _drive_strength(mig["score"], fz["delta"])
            score = score * SCORE_RAW_SCALE \
                * _timing_multiplier(eff_timing) \
                * _moon_multiplier(moon["illumination"], drive) \
                * _freeze_concentration_multiplier(loc.get("location_type"),
                                                   day["frozen_recent"])
            score = max(0, min(100, score))

            # Narrative: lead with weather/water events, then wind / pressure / timing.
            factors = [e["label"] for e in events]
            if day["wind_cardinal"] in NORTH_CARDINALS:
                factors.append(f"{day['wind_cardinal']} wind")
            if press_delta is not None and press_delta <= -MIG_PRESSURE_FALL:
                factors.append("falling pressure")
            if timing["label"] == "Peak":
                factors.append("peak migration")
            elif timing["label"] == "Building":
                factors.append("migration building")
            if hist is not None and hist >= 65:
                factors.append("matches your best hunts")
            if not factors and base >= 65:
                factors.append("solid conditions")

            loc_blinds = blinds_by_location.get(str(loc["_id"]), [])
            blind_wind = []
            for b in loc_blinds:
                level = _wind_match(day["wind_cardinal"], b.get("ideal_wind_directions") or [], b.get("ideal_wind_center"))
                if level:
                    blind_wind.append({
                        "blind_id": str(b.get("id") or b["_id"]),
                        "blind_name": b["name"],
                        "level": level,
                    })

            if loc_blinds:
                day_entry = blind_wind_by_day.setdefault(day["date"], {"date": day["date"], "morning": [], "evening": []})
                for b in loc_blinds:
                    ideal_dirs = b.get("ideal_wind_directions") or []
                    ideal_center = b.get("ideal_wind_center")
                    blind_ref = {
                        "blind_id": str(b.get("id") or b["_id"]),
                        "blind_name": b["name"],
                        "location_name": loc["name"],
                    }
                    morning_level = _best_window_match(day.get("wind_morning", []), ideal_dirs, ideal_center)
                    if morning_level:
                        day_entry["morning"].append({**blind_ref, "level": morning_level})
                    evening_level = _best_window_match(day.get("wind_evening", []), ideal_dirs, ideal_center)
                    if evening_level:
                        day_entry["evening"].append({**blind_ref, "level": evening_level})

            enriched = {
                **day,
                "moon_phase": moon["phase"],
                "moon_phase_name": moon["name"],
                "moon_illumination": moon["illumination"],
                "migration": mig,
                "timing": timing,
                "events": events,
                "hunt_score": round(score),
                "factors": factors[:3],
                "blind_wind": blind_wind,
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
            "timing": loc_days[0]["timing"] if loc_days else None,
            "days": loc_days,
        })

    best_bets.sort(key=lambda b: b["hunt_score"], reverse=True)
    return {
        "locations": results,
        "best_bets": best_bets[:5],
        "uses_history": use_history,
        "history_sample": profile["sample"],
        "blind_wind_by_day": [blind_wind_by_day[d] for d in sorted(blind_wind_by_day)],
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


@api_router.get("/health")
async def health():
    """For uptime monitoring. Deliberately touches the database.

    A check that only proves the web process is answering would report a happy
    green tick while Mongo was unreachable and every real request returned 500 —
    which is the outage you actually want waking you up. Returns 503 on failure
    so any monitor treats it as down, and says nothing about why: this endpoint
    is public.
    """
    try:
        await db.command("ping")
    except Exception as e:
        logger.error(f"Health check failed: database unreachable: {e}")
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    # Whether photo storage is wired up, so a misconfiguration is visible from
    # outside instead of being inferred from where photos ended up. It's a
    # boolean about our own setup — no credentials, no user data.
    body = {"status": "ok", "photo_storage": PHOTO_STORAGE_READY}

    if not PHOTO_STORAGE_READY:
        # Names only, never values. Which of our own settings are blank gives an
        # attacker nothing, and turns "why isn't this working" into one request.
        body["photo_storage_missing"] = [
            name for name, value in (
                ("R2_ENDPOINT", R2_ENDPOINT),
                ("R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID),
                ("R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY),
                ("R2_PHOTOS_BUCKET", R2_PHOTOS_BUCKET),
                ("R2_PUBLIC_BASE_URL", R2_PUBLIC_BASE_URL),
            ) if not value
        ]

    return body

# ============ SUBSCRIPTION ROUTES ============

STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.environ.get("STRIPE_PRO_PRICE_ID", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


def stripe_field(obj, key, default=None):
    """Read one field from a Stripe object or a plain dict.

    stripe-python's StripeObject keeps its fields in an internal `_data` mapping
    and routes attribute access through `__getattr__`. That means `obj.get(...)`
    is interpreted as "give me the FIELD named 'get'", which doesn't exist, so it
    raises AttributeError instead of behaving like dict.get. Subscript access
    works on both StripeObject and dict, so go through that.
    """
    try:
        value = obj[key]
    except (KeyError, TypeError, AttributeError, IndexError):
        return default
    return default if value is None else value


def resolve_subscription_state(sub) -> dict:
    """Map a Stripe subscription object onto the fields we store on the user.

    Accepts either a StripeObject or a plain dict.

    Stripe has two distinct notions of "paused" and they behave differently:

      1. Pause payment collection (what we use for the in-app pause). The
         subscription's `status` stays "active" and the pause lives in a
         separate `pause_collection` object. Reading `status` alone would leave
         a paused customer on Pro forever while Stripe bills them nothing.
      2. `status == "paused"`, which Stripe sets when a trial ends with no
         payment method on file.

    Both drop the user to free; access comes back when billing resumes.
    """
    pause_collection = stripe_field(sub, "pause_collection", {})
    status = stripe_field(sub, "status")

    if pause_collection or status == "paused":
        return {
            "subscription_status": "free",
            "subscription_paused": True,
            "subscription_resumes_at": stripe_field(pause_collection, "resumes_at"),
        }

    return {
        "subscription_status": "pro" if status in ("active", "trialing") else "free",
        "subscription_paused": False,
        "subscription_resumes_at": None,
    }


@api_router.get("/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    status = current_user.get("subscription_status", "free")
    stripe_customer_id = current_user.get("stripe_customer_id")
    return {
        "user_id": user_id,
        "subscription_status": status,
        "is_pro": status in ("pro", "premium"),
        "subscription_paused": current_user.get("subscription_paused", False),
        "subscription_resumes_at": current_user.get("subscription_resumes_at"),
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

    # A paused subscriber still has a live subscription in Stripe. Sending them
    # through checkout again would bill them for a second one.
    if current_user.get("subscription_paused"):
        raise HTTPException(
            status_code=400,
            detail="Your subscription is paused. Resume it instead of starting a new one.",
        )

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

PAUSE_MONTH_OPTIONS = (1, 3, 6)


def add_months(start: datetime, months: int) -> datetime:
    """Return `start` advanced by whole calendar months, clamping the day.

    Avoids a python-dateutil dependency. Clamping matters for month-end dates:
    Aug 31 + 6 months lands on Feb 28/29, not an invalid Feb 31.
    """
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return start.replace(year=year, month=month, day=min(start.day, last_day))


def find_stripe_subscription_id(stripe_lib, current_user: dict) -> Optional[str]:
    """Best-effort lookup of the user's Stripe subscription id.

    The webhook stores this going forward, but anyone who subscribed before that
    shipped has no stored id, so fall back to querying Stripe by customer.
    """
    subscription_id = current_user.get("stripe_subscription_id")
    if subscription_id:
        return subscription_id

    customer_id = current_user.get("stripe_customer_id")
    if not customer_id:
        return None

    subs = stripe_lib.Subscription.list(customer=customer_id, status="all", limit=20)
    candidates = [
        s for s in subs.auto_paging_iter()
        if stripe_field(s, "status") in ("active", "trialing", "past_due", "paused")
    ]
    return stripe_field(candidates[0], "id") if candidates else None


@api_router.post("/subscription/pause")
async def pause_subscription(
    request_data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Pause billing for a fixed number of months, then auto-resume.

    We use pause_collection[behavior]=void so no invoice is ever collected for
    the paused stretch, and always set resumes_at so the subscription comes back
    on its own rather than drifting paused forever.
    """
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY

    months = request_data.get("months", 3)
    if months not in PAUSE_MONTH_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Pause length must be one of {PAUSE_MONTH_OPTIONS} months",
        )

    if current_user.get("subscription_paused"):
        raise HTTPException(status_code=400, detail="Your subscription is already paused")

    if current_user.get("subscription_status") not in ("pro", "premium"):
        raise HTTPException(status_code=400, detail="No active subscription to pause")

    resumes_at = int(add_months(datetime.utcnow(), months).timestamp())

    try:
        subscription_id = find_stripe_subscription_id(stripe_lib, current_user)
        if not subscription_id:
            raise HTTPException(status_code=400, detail="No active subscription found")

        sub = stripe_lib.Subscription.modify(
            subscription_id,
            pause_collection={"behavior": "void", "resumes_at": resumes_at},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Apply locally rather than waiting on the webhook, so the UI is correct the
    # instant the request returns. The webhook then confirms the same state.
    updates = resolve_subscription_state(sub)
    updates["stripe_subscription_id"] = subscription_id
    # Stamped so an older in-flight webhook can't overwrite what we just did.
    updates["subscription_synced_at"] = int(time.time())
    await db.users.update_one({"_id": current_user["_id"]}, {"$set": updates})
    logger.info(f"User {current_user['_id']} paused {subscription_id} for {months}mo")

    return {
        "subscription_status": updates["subscription_status"],
        "subscription_paused": updates["subscription_paused"],
        "subscription_resumes_at": updates["subscription_resumes_at"],
    }


@api_router.post("/subscription/resume")
async def resume_subscription(current_user: dict = Depends(get_current_user)):
    """Lift a payment-collection pause and restore Pro immediately.

    Pausing is deliberately understated in the UI; resuming is one tap, so we
    don't make the user wait on the webhook here.
    """
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY

    if not current_user.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer found")

    try:
        subscription_id = find_stripe_subscription_id(stripe_lib, current_user)
        if not subscription_id:
            raise HTTPException(status_code=400, detail="No paused subscription found")

        sub = stripe_lib.Subscription.modify(subscription_id, pause_collection="")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    updates = resolve_subscription_state(sub)
    updates["stripe_subscription_id"] = subscription_id
    # Stamped so the earlier "paused" webhook can't land late and undo this.
    updates["subscription_synced_at"] = int(time.time())
    await db.users.update_one({"_id": current_user["_id"]}, {"$set": updates})
    logger.info(f"User {current_user['_id']} resumed subscription {subscription_id}")

    return {
        "subscription_status": updates["subscription_status"],
        "subscription_paused": updates["subscription_paused"],
    }


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

async def apply_stripe_subscription_event(event: dict):
    """Apply one Stripe subscription event to the matching user record."""
    event_type = event["type"]
    sub = event["data"]["object"]
    customer_id = stripe_field(sub, "customer")

    if not customer_id:
        logger.error(f"Stripe webhook {event_type}: event carried no customer id")
        return

    user = await db.users.find_one({"stripe_customer_id": customer_id})
    if not user:
        # Previously this returned silently, so a mismatched customer id looked
        # like a successful delivery while the account stayed on free.
        logger.error(
            f"Stripe webhook {event_type}: NO USER matches "
            f"stripe_customer_id={customer_id} -- account not updated"
        )
        return

    # Stripe does not guarantee delivery order. Without this, a delayed
    # "paused" event landing after a newer "resumed" one would flip a paying
    # customer back to free and leave them there.
    event_created = event.get("created") or 0
    last_applied = user.get("subscription_synced_at") or 0
    if event_created and event_created < last_applied:
        logger.info(
            f"Stripe webhook {event_type}: ignoring out-of-order event "
            f"(created={event_created} < last applied={last_applied})"
        )
        return

    if event_type == "customer.subscription.deleted":
        updates = {
            "subscription_status": "free",
            "subscription_paused": False,
            "subscription_resumes_at": None,
            "stripe_subscription_id": None,
        }
    else:
        updates = resolve_subscription_state(sub)
        # Keep the subscription id so we can resume without a lookup.
        updates["stripe_subscription_id"] = stripe_field(sub, "id")

    updates["subscription_synced_at"] = event_created or int(time.time())
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    logger.info(
        f"Stripe webhook {event_type}: user {user['_id']} -> "
        f"{updates['subscription_status']} (paused={updates.get('subscription_paused')})"
    )


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    import stripe as stripe_lib
    stripe_lib.api_key = STRIPE_SECRET_KEY
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        stripe_lib.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Signature is verified above; from here work with the raw JSON as plain
    # dicts. StripeObject's attribute handling differs between library versions
    # and there is nothing in the event we need the SDK wrapper for.
    event = json.loads(payload)

    event_type = event.get("type")
    event_id = event.get("id")
    logger.info(f"Stripe webhook received: {event_type} ({event_id})")

    handled = (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.resumed",
        "customer.subscription.paused",
        "customer.subscription.deleted",
    )

    if event_type in handled:
        try:
            await apply_stripe_subscription_event(event)
        except Exception:
            # Log the full traceback, then 500 so Stripe retries. Without this
            # the failure was invisible from both sides.
            logger.exception(
                f"Stripe webhook {event_type} ({event_id}) failed while updating the user"
            )
            raise HTTPException(status_code=500, detail="webhook handler error")

    return {"received": True}

# ============ ACCOUNT DELETION ============


# A deletion is scheduled rather than done on the spot. Erasing a season's
# worth of hunts on one mis-tap is not recoverable by us or by them, so the
# request is reversible for a month and only then carried out for real.
DELETION_GRACE_DAYS = 30


class DeleteAccountRequest(BaseModel):
    password: str
    email: str


@api_router.post("/account/delete")
async def request_account_deletion(
    payload: DeleteAccountRequest,
    current_user: dict = Depends(get_current_user),
):
    """Schedule the account for erasure. Reversible until the grace period ends."""
    # The password, not just a valid token: a phone left unlocked on a tailgate
    # shouldn't be enough to destroy someone's seasons.
    # 403 rather than 401 on purpose: the client treats any 401 as an expired
    # session and signs the user out, so mistyping here would eject them from
    # the app instead of showing them the message.
    if not verify_password(payload.password, current_user["password_hash"]):
        raise HTTPException(status_code=403, detail="That password is incorrect.")

    # Typing the address out is deliberate friction — much harder to do by
    # accident than filling a password field the browser already knows.
    if normalize_email(payload.email) != normalize_email(current_user["email"]):
        raise HTTPException(
            status_code=403,
            detail="That email doesn't match the account you're signed in to.",
        )

    user_oid = current_user["_id"]
    user_id = str(user_oid)

    # Billing stops now, not in thirty days — nobody should pay through a grace
    # period for an account they've asked to be rid of. Cancelling is also the
    # one step that can't wait: charging a customer whose account later vanishes
    # invites a chargeback with no record left to reconcile it against.
    if STRIPE_SECRET_KEY and not STRIPE_SECRET_KEY.startswith("YOUR_"):
        try:
            import stripe as stripe_lib
            stripe_lib.api_key = STRIPE_SECRET_KEY
            subscription_id = find_stripe_subscription_id(stripe_lib, current_user)
            if subscription_id:
                stripe_lib.Subscription.delete(subscription_id)
                logger.info(f"Cancelled subscription {subscription_id} for user {user_id}")
        except Exception as e:
            logger.exception(f"Could not cancel Stripe subscription for user {user_id}: {e}")
            raise HTTPException(
                status_code=502,
                detail="We couldn't cancel your subscription just now, so we've left your "
                       "account alone rather than risk charging you again. Please try later.",
            )

    scheduled_for = datetime.utcnow() + timedelta(days=DELETION_GRACE_DAYS)
    await db.users.update_one(
        {"_id": user_oid},
        {"$set": {
            "deletion_requested_at": datetime.utcnow(),
            "deletion_scheduled_for": scheduled_for,
            "subscription_status": "free",
            "subscription_paused": False,
            "subscription_resumes_at": None,
        }},
    )
    logger.info(f"Account {user_id} scheduled for deletion on {scheduled_for.isoformat()}")

    return {
        "scheduled": True,
        "deletion_scheduled_for": int(scheduled_for.timestamp()),
        "grace_days": DELETION_GRACE_DAYS,
    }


@api_router.post("/account/restore")
async def restore_account(current_user: dict = Depends(get_current_user)):
    """Call off a pending deletion. Data was never touched, so this just clears
    the flags — the subscription is not resurrected, since billing really did
    stop and Stripe has no notion of un-cancelling."""
    if not current_user.get("deletion_scheduled_for"):
        return {"restored": False, "detail": "This account isn't scheduled for deletion."}

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$unset": {"deletion_requested_at": "", "deletion_scheduled_for": ""}},
    )
    logger.info(f"Account {current_user['_id']} deletion cancelled by the owner")
    return {"restored": True}


async def purge_one_account(user: dict) -> dict:
    """Actually erase an account whose grace period has run out."""
    user_oid = user["_id"]
    user_id = str(user_oid)

    # Photos live outside Mongo, so erasing the documents alone would leave the
    # images behind — which for a deletion request is the whole point missed.
    for coll, field in (("hunts", "photos"), ("locations", "photo_base64"), ("blinds", "photo_base64")):
        async for doc in db[coll].find({"user_id": user_id}, {field: 1}):
            value = doc.get(field)
            await delete_photos(value if isinstance(value, list) else [value])

    # Owned data before the account itself, so a failure part-way leaves the
    # user able to sign in and retry rather than orphaning their records.
    removed = {
        "hunts": (await db.hunts.delete_many({"user_id": user_id})).deleted_count,
        "blinds": (await db.blinds.delete_many({"user_id": user_id})).deleted_count,
        "locations": (await db.locations.delete_many({"user_id": user_id})).deleted_count,
    }
    await db.password_resets.delete_many({"user_id": user_oid})
    await db.users.delete_one({"_id": user_oid})
    logger.info(f"Purged account {user_id}: {removed}")
    return removed


async def purge_expired_accounts() -> int:
    # `$type: "date"` is belt-and-braces. Mongo's range operators are already
    # type-bracketed, so `$lte: <date>` won't match a null or missing field —
    # but this is the only code in the app that deletes accounts unattended, on
    # a timer, with no backup behind it. It should not depend on a subtlety of
    # BSON comparison ordering being remembered correctly.
    due = await db.users.find(
        {"deletion_scheduled_for": {"$type": "date", "$lte": datetime.utcnow()}}
    ).to_list(500)
    for user in due:
        try:
            await purge_one_account(user)
        except Exception as e:
            # One bad record shouldn't stop the rest; it'll be retried next pass.
            logger.exception(f"Failed purging account {user.get('_id')}: {e}")
    return len(due)


async def deletion_purge_loop():
    """The app has no scheduler, so the purge rides along with the process. A
    redeploy restarts the clock, which only ever delays a purge — the due date
    lives in the database, so nothing is lost or erased early."""
    while True:
        try:
            purged = await purge_expired_accounts()
            if purged:
                logger.info(f"Purged {purged} account(s) past their grace period")
        except Exception as e:
            logger.exception(f"Deletion purge pass failed: {e}")
        await asyncio.sleep(6 * 60 * 60)

# ============ EXPORT ROUTE ============

@api_router.get("/hunts/export/csv")
async def export_hunts_csv(current_user: dict = Depends(require_pro)):
    from fastapi.responses import StreamingResponse
    import csv
    import io

    user_id = str(current_user["_id"])
    hunts = await fetch_capped(db.hunts.find({"user_id": user_id}).sort("date", -1), 10000, "hunts for CSV export", user_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Hunt Name", "Blind", "Lat", "Lng", "Party", "Total Harvested", "My Harvest", "Total Missed", "Total Lost", "Notes", "Condition", "Temp (F)", "Wind (mph)"])

    for hunt in hunts:
        weather = hunt.get("weather_data") or {}
        total_h = sum(h.get("count", 0) for h in hunt.get("harvests", []))
        total_mine = sum(
            (h.get("mine") if h.get("mine") is not None else h.get("count", 0))
            for h in hunt.get("harvests", [])
        )
        total_m = sum(h.get("missed", 0) for h in hunt.get("harvests", []))
        total_l = sum(h.get("shot_not_recovered", 0) for h in hunt.get("harvests", []))
        writer.writerow([
            hunt.get("date", ""),
            hunt.get("name", ""),
            hunt.get("blind_name", ""),
            hunt.get("location", {}).get("lat", ""),
            hunt.get("location", {}).get("lng", ""),
            ", ".join(hunt.get("party", [])),
            total_h,
            total_mine,
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

# Photos are sent as base64 inside the JSON body, and the client compresses them
# to roughly 100KB each first — so this is generous for a hunt carrying several
# while still refusing the multi-megabyte uploads that would otherwise fill a
# 512MB database in a few hundred requests.
MAX_REQUEST_BYTES = 3 * 1024 * 1024


@app.exception_handler(InvalidId)
async def handle_invalid_id(request: Request, exc: InvalidId):
    """A malformed id in the URL can't match anything, so it's a miss rather
    than a crash. Previously this surfaced as a bare 500."""
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    """Last resort. Without this an unforeseen error returns a bare
    'Internal Server Error' with no detail field, which the client can't parse
    into anything useful to show. The cause goes to the logs, not the user."""
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on our end. Please try again in a moment."},
    )


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    declared = request.headers.get("content-length")
    if declared:
        try:
            oversize = int(declared) > MAX_REQUEST_BYTES
        except ValueError:
            oversize = False
        if oversize:
            logger.warning(
                f"Rejected {declared} byte request to {request.url.path} from {client_ip(request)}"
            )
            return JSONResponse(
                status_code=413,
                content={"detail": "That upload is too large. Try fewer or smaller photos."},
            )
    return await call_next(request)


# Added last, so it wraps everything above and CORS headers reach error
# responses too — including the 413 and 429s.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every query in this app is scoped to one user, so each collection needs its
# owner field indexed. Without these, Mongo reads an entire collection to answer
# any request — cost grows with total users, not with the asking user's own data,
# so it stays invisible in testing and only bites once other people sign up.
INDEXES = [
    # (collection, keys, options)
    ("users", [("email", 1)], {"unique": True, "name": "uniq_email"}),
    # Sparse: only the handful of accounts with a deletion pending are indexed,
    # so the periodic purge sweep doesn't read every user.
    ("users", [("deletion_scheduled_for", 1)],
     {"name": "users_deletion_due", "sparse": True}),
    # Covers filtering by user, the year range filter, and the newest-first sort
    # in one pass. A compound index also serves its own prefix, so plain
    # "this user's hunts" lookups and the free-tier count use it too.
    ("hunts", [("user_id", 1), ("date", -1)], {"name": "hunts_user_id_date"}),
    ("locations", [("user_id", 1)], {"name": "locations_user_id"}),
    ("blinds", [("user_id", 1), ("location_id", 1)], {"name": "blinds_user_id_location"}),
    ("password_resets", [("token_hash", 1)], {"name": "reset_token_hash"}),
    # Expired reset rows are already refused on use; expire them so the
    # collection doesn't grow forever on a 512MB tier.
    ("password_resets", [("expires_at", 1)], {"name": "reset_ttl", "expireAfterSeconds": 0}),
    # Same idea for cached forecasts: stale entries are already ignored on read,
    # so let Mongo sweep them rather than growing the collection forever.
    ("forecast_cache", [("expires_at", 1)], {"name": "forecast_ttl", "expireAfterSeconds": 0}),
]


@app.on_event("startup")
async def ensure_indexes():
    """Never fatal: if legacy rows already collide the index can't be built, and
    refusing to boot over that would take the whole app down."""
    for collection, keys, options in INDEXES:
        try:
            await db[collection].create_index(keys, **options)
        except Exception as e:
            logger.warning(f"Could not create index {options.get('name')} on {collection}: {e}")

    # Superseded by hunts_user_id_date, which answers everything it did.
    try:
        await db.hunts.drop_index("hunts_user_id")
        logger.info("Dropped hunts_user_id; replaced by hunts_user_id_date")
    except Exception:
        pass


@app.on_event("startup")
async def start_deletion_purge():
    asyncio.create_task(deletion_purge_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
