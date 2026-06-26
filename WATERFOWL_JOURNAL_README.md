# Waterfowl Hunting Journal - iOS App

A comprehensive mobile application for waterfowl hunters to track their hunts, manage blinds, and analyze hunting statistics.

## Features

### ✅ Core Features Implemented

1. **User Authentication**
   - JWT-based email/password authentication
   - Secure registration and login
   - Multi-user support

2. **Hunt Management**
   - Record hunts with date, location, and notes
   - GPS location tracking
   - Weather data integration (OpenWeatherMap)
   - Photo capture and storage (base64 format)
   - Detailed harvest tracking by species
   - Track harvested, missed, and shot-but-not-recovered birds

3. **Blind Management**
   - Create and manage hunting blinds
   - Store blind locations with GPS coordinates
   - Descriptions and photos for each blind
   - Select existing blinds or create new ones during hunt creation

4. **Statistics & Analytics**
   - Total hunts and birds harvested
   - Species-specific tracking
   - Categorized totals (Ducks, Geese, Others)
   - Success rate calculations
   - Visual charts and graphs
   - Top species rankings

5. **Species Tracking**
   - **Ducks**: Mallard, Teal, Wood Duck, Pintail, Widgeon, Gadwall, Canvasback, Redhead, Shoveler
   - **Geese**: Canada Goose, Snow Goose, Specklebelly, White-fronted Goose
   - **Others**: Coot, Rail, Snipe, Dove, Other

6. **Mobile-First Design**
   - Bottom tab navigation
   - Native iOS feel with proper styling
   - Pull-to-refresh on all lists
   - Safe area support
   - Keyboard handling
   - Camera and location permissions

## Tech Stack

### Frontend (Mobile)
- **Expo** (React Native) - iOS app development
- **Expo Router** - File-based routing
- **React Navigation** - Tab navigation
- **Expo Location** - GPS tracking
- **Expo Image Picker** - Camera access
- **React Native Maps** - Map integration
- **React Native Gifted Charts** - Statistics visualization
- **AsyncStorage** - Local data persistence
- **Axios** - API communication

### Backend
- **FastAPI** (Python) - REST API
- **MongoDB** - Database
- **JWT Authentication** - Secure user sessions
- **Passlib + bcrypt** - Password hashing
- **Motor** - Async MongoDB driver

## Setup Instructions

### 1. API Keys Configuration

Update the backend `.env` file (`/app/backend/.env`) with your API keys:

```bash
# Required for weather data
OPENWEATHER_API_KEY=your_openweathermap_api_key

# Required for subscription payments (future feature)
STRIPE_SECRET_KEY=your_stripe_secret_key
```

**Get API Keys:**
- OpenWeatherMap: https://openweathermap.org/api (Free tier available)
- Stripe: https://stripe.com (Test mode keys for development)

### 2. Testing the App

**On iOS Device:**
1. Install "Expo Go" app from the App Store
2. Scan the QR code shown in the preview
3. The app will open in Expo Go

**Create a Test Account:**
1. Open the app and tap "Register"
2. Fill in:
   - Name: Your name
   - Email: Any valid email
   - Password: At least 6 characters
3. You'll be logged in automatically

### 3. Using the App

**Recording a Hunt:**
1. Go to "Hunts" tab
2. Tap the "+" button
3. Fill in:
   - Date (auto-filled with today)
   - Select existing blind or create new one
   - Location (auto-detected via GPS)
   - Add harvest data (tap + to add species entries)
   - Add photos (optional)
   - Add notes (optional)
4. Tap "Record Hunt"

**Managing Blinds:**
1. Go to "Blinds" tab
2. View all your saved blinds
3. Delete blinds by tapping the trash icon
4. Blinds created during hunts appear here automatically

**Viewing Statistics:**
1. Go to "Stats" tab
2. See your hunting statistics:
   - Total hunts and harvests
   - Success rate
   - Category breakdown (Ducks, Geese, Others)
   - Top species rankings

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Blinds
- `GET /api/blinds` - List all blinds
- `POST /api/blinds` - Create blind
- `PUT /api/blinds/{id}` - Update blind
- `DELETE /api/blinds/{id}` - Delete blind

### Hunts
- `GET /api/hunts` - List all hunts
- `POST /api/hunts` - Create hunt
- `GET /api/hunts/{id}` - Get hunt details
- `DELETE /api/hunts/{id}` - Delete hunt

### Statistics
- `GET /api/statistics` - Get annual statistics
- `GET /api/species` - Get available species list

## Data Structure

### Hunt Record
```json
{
  "blind_id": "optional-blind-id",
  "date": "2025-01-27",
  "location": {"lat": 40.7128, "lng": -74.0060},
  "notes": "Great morning hunt!",
  "photos": ["data:image/jpeg;base64,..."],
  "harvests": [
    {
      "species": "Mallard",
      "harvested": 3,
      "missed": 2,
      "shot_not_recovered": 0
    }
  ]
}
```

### Weather Data
Weather is automatically fetched when creating a hunt using the location coordinates. If OpenWeatherMap API key is not configured, placeholder data is used.

## Future Features (Placeholders Ready)

1. **Subscription Model**
   - Stripe integration ready
   - Premium features can be gated
   - Payment flow placeholders in Profile

2. **Data Export**
   - Export hunts as PDF/CSV
   - Share statistics
   - Backup functionality

3. **Maps Integration**
   - Visual map of blinds and hunts
   - Route tracking
   - Hunting zone overlays

## Permissions Required

- **Location**: To track hunt locations and blind positions
- **Camera/Photos**: To capture and attach photos to hunts
- **Storage**: For local data caching (AsyncStorage)

## Database Schema

### Users Collection
- `email`, `password_hash`, `name`
- `subscription_status` (free/premium)
- `created_at`

### Blinds Collection
- `user_id`, `name`, `description`
- `location` (lat, lng)
- `photo_base64` (optional)
- `created_at`

### Hunts Collection
- `user_id`, `blind_id`, `blind_name`
- `date`, `location` (lat, lng)
- `weather_data` (temp, condition, wind, humidity)
- `notes`, `photos[]`
- `harvests[]` (species, counts)
- `created_at`

## Testing Credentials

A test user has been created:
- **Email**: hunter@test.com
- **Password**: test123

## Known Limitations

1. **Weather Data**: Uses current weather API. Historical weather requires paid OpenWeatherMap plan.
2. **Images**: Stored as base64 in database. For production, consider cloud storage (S3, Cloudinary).
3. **Offline Mode**: App requires internet connection for API calls.
4. **Push Notifications**: Not implemented yet.

## Support & Issues

- Backend API runs on port 8001
- Frontend Expo runs on port 3000
- All API routes are prefixed with `/api`

## Development Notes

- Backend: `/app/backend/server.py`
- Frontend: `/app/frontend/app/`
- Navigation uses Expo Router file-based routing
- All images must be base64 encoded for display
- JWT tokens expire after 7 days

---

**Version**: 1.0.0
**Built with**: Expo + FastAPI + MongoDB
