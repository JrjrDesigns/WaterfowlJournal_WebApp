#!/usr/bin/env python3
"""
Waterfowl Hunting Journal Backend API Tests
Tests all backend endpoints for the iOS hunting app
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
import random

# Backend URL from frontend .env
BACKEND_URL = "https://fowlnotes.preview.emergentagent.com/api"

class WaterfowlAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = requests.Session()
        self.auth_token = None
        self.user_data = None
        self.created_blinds = []
        self.created_hunts = []
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def test_connection(self):
        """Test basic API connection"""
        self.log("Testing API connection...")
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                self.log("✅ API connection successful")
                self.log(f"Response: {response.json()}")
                return True
            else:
                self.log(f"❌ API connection failed: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ API connection error: {str(e)}", "ERROR")
            return False
    
    def test_user_registration(self):
        """Test user registration endpoint"""
        self.log("Testing user registration...")
        
        # Generate unique test data
        test_email = f"hunter_{uuid.uuid4().hex[:8]}@example.com"
        test_data = {
            "email": test_email,
            "password": "SecureHunting123!",
            "name": "Jake Thompson"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/auth/register", json=test_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data and "user" in data:
                    self.auth_token = data["access_token"]
                    self.user_data = data["user"]
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    self.log("✅ User registration successful")
                    self.log(f"User ID: {self.user_data['id']}")
                    return True
                else:
                    self.log("❌ Registration response missing required fields")
                    return False
            else:
                self.log(f"❌ Registration failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Registration error: {str(e)}", "ERROR")
            return False
    
    def test_user_login(self):
        """Test user login with existing credentials"""
        self.log("Testing user login...")
        
        if not self.user_data:
            self.log("❌ No user data available for login test")
            return False
            
        login_data = {
            "email": self.user_data["email"],
            "password": "SecureHunting123!"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.log("✅ User login successful")
                    return True
                else:
                    self.log("❌ Login response missing access token")
                    return False
            else:
                self.log(f"❌ Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Login error: {str(e)}", "ERROR")
            return False
    
    def test_get_user_profile(self):
        """Test getting current user profile"""
        self.log("Testing get user profile...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/auth/me")
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "email" in data:
                    self.log("✅ Get user profile successful")
                    return True
                else:
                    self.log("❌ Profile response missing required fields")
                    return False
            else:
                self.log(f"❌ Get profile failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get profile error: {str(e)}", "ERROR")
            return False
    
    def test_create_blind(self):
        """Test creating hunting blinds"""
        self.log("Testing blind creation...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
        
        # Create multiple test blinds
        test_blinds = [
            {
                "name": "Duck Creek Blind",
                "description": "Prime mallard spot near the creek bend",
                "location": {"lat": 39.7392, "lng": -104.9903}
            },
            {
                "name": "Goose Field Setup",
                "description": "Open field layout for Canada geese",
                "location": {"lat": 40.0150, "lng": -105.2705}
            },
            {
                "name": "Marsh Edge Hide",
                "description": "Cattail blind overlooking shallow marsh",
                "location": {"lat": 39.5501, "lng": -105.7821}
            }
        ]
        
        success_count = 0
        
        for blind_data in test_blinds:
            try:
                response = self.session.post(f"{self.base_url}/blinds", json=blind_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "id" in data:
                        self.created_blinds.append(data)
                        success_count += 1
                        self.log(f"✅ Created blind: {blind_data['name']}")
                    else:
                        self.log(f"❌ Blind creation response missing ID for {blind_data['name']}")
                else:
                    self.log(f"❌ Blind creation failed: {response.status_code} - {response.text}")
                    
            except Exception as e:
                self.log(f"❌ Blind creation error: {str(e)}", "ERROR")
        
        if success_count > 0:
            self.log(f"✅ Created {success_count}/{len(test_blinds)} blinds successfully")
            return True
        else:
            self.log("❌ No blinds created successfully")
            return False
    
    def test_get_blinds(self):
        """Test retrieving user's blinds"""
        self.log("Testing get blinds...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/blinds")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Retrieved {len(data)} blinds")
                    return True
                else:
                    self.log("❌ Blinds response is not a list")
                    return False
            else:
                self.log(f"❌ Get blinds failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get blinds error: {str(e)}", "ERROR")
            return False
    
    def test_update_blind(self):
        """Test updating a blind"""
        self.log("Testing blind update...")
        
        if not self.created_blinds:
            self.log("❌ No blinds available to update")
            return False
            
        blind_to_update = self.created_blinds[0]
        update_data = {
            "name": "Updated Duck Creek Blind",
            "description": "Updated description with new layout details",
            "location": blind_to_update["location"]
        }
        
        try:
            response = self.session.put(f"{self.base_url}/blinds/{blind_to_update['id']}", json=update_data)
            
            if response.status_code == 200:
                self.log("✅ Blind update successful")
                return True
            else:
                self.log(f"❌ Blind update failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Blind update error: {str(e)}", "ERROR")
            return False
    
    def test_create_hunts(self):
        """Test creating hunt records"""
        self.log("Testing hunt creation...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
        
        # Create test hunts with realistic data
        test_hunts = [
            {
                "blind_id": self.created_blinds[0]["id"] if self.created_blinds else None,
                "date": "2024-01-15",
                "location": {"lat": 39.7392, "lng": -104.9903},
                "notes": "Great morning hunt. Foggy conditions cleared around 8 AM. Mallards flying well.",
                "photos": [],
                "harvests": [
                    {"species": "Mallard", "harvested": 3, "missed": 2, "shot_not_recovered": 0},
                    {"species": "Teal", "harvested": 1, "missed": 1, "shot_not_recovered": 0}
                ]
            },
            {
                "blind_name": "Temporary Field Setup",
                "blind_description": "Quick setup in harvested corn field",
                "date": "2024-01-20",
                "location": {"lat": 40.0150, "lng": -105.2705},
                "notes": "Canada geese came in waves. Wind from the north helped with decoy spread.",
                "photos": [],
                "harvests": [
                    {"species": "Canada Goose", "harvested": 2, "missed": 3, "shot_not_recovered": 1}
                ]
            },
            {
                "blind_id": self.created_blinds[1]["id"] if len(self.created_blinds) > 1 else None,
                "date": "2024-01-25",
                "location": {"lat": 39.5501, "lng": -105.7821},
                "notes": "Slow morning but picked up after 9 AM. Mixed bag day.",
                "photos": [],
                "harvests": [
                    {"species": "Wood Duck", "harvested": 2, "missed": 0, "shot_not_recovered": 0},
                    {"species": "Pintail", "harvested": 1, "missed": 2, "shot_not_recovered": 0},
                    {"species": "Coot", "harvested": 1, "missed": 0, "shot_not_recovered": 0}
                ]
            }
        ]
        
        success_count = 0
        
        for hunt_data in test_hunts:
            try:
                response = self.session.post(f"{self.base_url}/hunts", json=hunt_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "id" in data and "weather_data" in data:
                        self.created_hunts.append(data)
                        success_count += 1
                        self.log(f"✅ Created hunt for {hunt_data['date']}")
                        self.log(f"   Weather data included: {data['weather_data']['description']}")
                    else:
                        self.log(f"❌ Hunt creation response missing required fields for {hunt_data['date']}")
                else:
                    self.log(f"❌ Hunt creation failed: {response.status_code} - {response.text}")
                    
            except Exception as e:
                self.log(f"❌ Hunt creation error: {str(e)}", "ERROR")
        
        if success_count > 0:
            self.log(f"✅ Created {success_count}/{len(test_hunts)} hunts successfully")
            return True
        else:
            self.log("❌ No hunts created successfully")
            return False
    
    def test_get_hunts(self):
        """Test retrieving user's hunts"""
        self.log("Testing get hunts...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/hunts")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log(f"✅ Retrieved {len(data)} hunts")
                    # Verify hunt data structure
                    if data and "weather_data" in data[0]:
                        self.log("✅ Weather data included in hunt responses")
                    return True
                else:
                    self.log("❌ Hunts response is not a list")
                    return False
            else:
                self.log(f"❌ Get hunts failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get hunts error: {str(e)}", "ERROR")
            return False
    
    def test_get_hunt_details(self):
        """Test retrieving specific hunt details"""
        self.log("Testing get hunt details...")
        
        if not self.created_hunts:
            self.log("❌ No hunts available to retrieve")
            return False
            
        hunt_id = self.created_hunts[0]["id"]
        
        try:
            response = self.session.get(f"{self.base_url}/hunts/{hunt_id}")
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "harvests" in data and "weather_data" in data:
                    self.log("✅ Hunt details retrieved successfully")
                    return True
                else:
                    self.log("❌ Hunt details response missing required fields")
                    return False
            else:
                self.log(f"❌ Get hunt details failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get hunt details error: {str(e)}", "ERROR")
            return False
    
    def test_statistics(self):
        """Test statistics endpoint"""
        self.log("Testing statistics...")
        
        if not self.auth_token:
            self.log("❌ No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/statistics")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_hunts", "total_harvested", "ducks_total", "geese_total", "others_total", "by_species"]
                
                if all(field in data for field in required_fields):
                    self.log("✅ Statistics retrieved successfully")
                    self.log(f"   Total hunts: {data['total_hunts']}")
                    self.log(f"   Total harvested: {data['total_harvested']}")
                    self.log(f"   Ducks: {data['ducks_total']}, Geese: {data['geese_total']}, Others: {data['others_total']}")
                    return True
                else:
                    self.log("❌ Statistics response missing required fields")
                    return False
            else:
                self.log(f"❌ Get statistics failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get statistics error: {str(e)}", "ERROR")
            return False
    
    def test_species_list(self):
        """Test species list endpoint"""
        self.log("Testing species list...")
        
        try:
            response = self.session.get(f"{self.base_url}/species")
            
            if response.status_code == 200:
                data = response.json()
                if "ducks" in data and "geese" in data and "others" in data:
                    self.log("✅ Species list retrieved successfully")
                    self.log(f"   Duck species: {len(data['ducks'])}")
                    self.log(f"   Goose species: {len(data['geese'])}")
                    self.log(f"   Other species: {len(data['others'])}")
                    return True
                else:
                    self.log("❌ Species list response missing required categories")
                    return False
            else:
                self.log(f"❌ Get species list failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Get species list error: {str(e)}", "ERROR")
            return False
    
    def test_authorization(self):
        """Test that protected endpoints require authentication"""
        self.log("Testing authorization requirements...")
        
        # Remove auth header temporarily
        original_headers = self.session.headers.copy()
        if "Authorization" in self.session.headers:
            del self.session.headers["Authorization"]
        
        protected_endpoints = [
            "/auth/me",
            "/blinds",
            "/hunts",
            "/statistics"
        ]
        
        unauthorized_count = 0
        
        for endpoint in protected_endpoints:
            try:
                response = self.session.get(f"{self.base_url}{endpoint}")
                if response.status_code == 401:
                    unauthorized_count += 1
                    self.log(f"✅ {endpoint} properly requires authentication")
                else:
                    self.log(f"❌ {endpoint} should require authentication but returned {response.status_code}")
            except Exception as e:
                self.log(f"❌ Authorization test error for {endpoint}: {str(e)}", "ERROR")
        
        # Restore auth headers
        self.session.headers.update(original_headers)
        
        if unauthorized_count == len(protected_endpoints):
            self.log("✅ All protected endpoints require authentication")
            return True
        else:
            self.log(f"❌ Only {unauthorized_count}/{len(protected_endpoints)} endpoints properly require auth")
            return False
    
    def test_delete_operations(self):
        """Test delete operations for hunts and blinds"""
        self.log("Testing delete operations...")
        
        success_count = 0
        
        # Delete a hunt
        if self.created_hunts:
            hunt_id = self.created_hunts[0]["id"]
            try:
                response = self.session.delete(f"{self.base_url}/hunts/{hunt_id}")
                if response.status_code == 200:
                    self.log("✅ Hunt deletion successful")
                    success_count += 1
                else:
                    self.log(f"❌ Hunt deletion failed: {response.status_code}")
            except Exception as e:
                self.log(f"❌ Hunt deletion error: {str(e)}", "ERROR")
        
        # Delete a blind
        if self.created_blinds:
            blind_id = self.created_blinds[0]["id"]
            try:
                response = self.session.delete(f"{self.base_url}/blinds/{blind_id}")
                if response.status_code == 200:
                    self.log("✅ Blind deletion successful")
                    success_count += 1
                else:
                    self.log(f"❌ Blind deletion failed: {response.status_code}")
            except Exception as e:
                self.log(f"❌ Blind deletion error: {str(e)}", "ERROR")
        
        return success_count > 0
    
    def run_all_tests(self):
        """Run comprehensive API test suite"""
        self.log("=" * 60)
        self.log("STARTING WATERFOWL HUNTING JOURNAL API TESTS")
        self.log("=" * 60)
        
        test_results = {}
        
        # Test sequence
        tests = [
            ("API Connection", self.test_connection),
            ("User Registration", self.test_user_registration),
            ("User Login", self.test_user_login),
            ("Get User Profile", self.test_get_user_profile),
            ("Authorization Requirements", self.test_authorization),
            ("Create Blinds", self.test_create_blind),
            ("Get Blinds", self.test_get_blinds),
            ("Update Blind", self.test_update_blind),
            ("Create Hunts", self.test_create_hunts),
            ("Get Hunts", self.test_get_hunts),
            ("Get Hunt Details", self.test_get_hunt_details),
            ("Statistics", self.test_statistics),
            ("Species List", self.test_species_list),
            ("Delete Operations", self.test_delete_operations)
        ]
        
        for test_name, test_func in tests:
            self.log(f"\n--- {test_name} ---")
            try:
                result = test_func()
                test_results[test_name] = result
            except Exception as e:
                self.log(f"❌ {test_name} failed with exception: {str(e)}", "ERROR")
                test_results[test_name] = False
        
        # Summary
        self.log("\n" + "=" * 60)
        self.log("TEST SUMMARY")
        self.log("=" * 60)
        
        passed = sum(1 for result in test_results.values() if result)
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{status}: {test_name}")
        
        self.log(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("🎉 ALL TESTS PASSED! Backend API is working correctly.")
        else:
            self.log(f"⚠️  {total - passed} tests failed. Backend needs attention.")
        
        return test_results

if __name__ == "__main__":
    tester = WaterfowlAPITester()
    results = tester.run_all_tests()