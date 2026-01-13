"""
Test suite for onboarding portal fixes:
1. PB client ID persistence (POST /api/user/save-pb-client)
2. Progress endpoint returns pb_client_record_id (GET /api/user/progress)
3. Admin reset script functionality
4. Session expiration handling
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://onboarding-hub-14.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "raymond@fireside360.co.uk"
TEST_USER_PASSWORD = "akosua1001"
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "test123"


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test successful login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        print(f"✅ Login successful for {TEST_USER_EMAIL}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
        print("✅ Invalid credentials correctly rejected")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✅ Admin login successful for {ADMIN_EMAIL}")


class TestPBClientPersistence:
    """Test Practice Better client ID persistence - KEY FIX"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_save_pb_client_id(self, auth_token):
        """Test POST /api/user/save-pb-client saves client ID"""
        test_client_id = "test_pb_client_id_pytest_12345"
        
        response = requests.post(
            f"{BASE_URL}/api/user/save-pb-client",
            json={"client_record_id": test_client_id},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Save PB client failed: {response.text}"
        data = response.json()
        assert data["message"] == "Practice Better client ID saved"
        assert data["client_record_id"] == test_client_id
        print(f"✅ PB client ID saved: {test_client_id}")
    
    def test_progress_returns_pb_client_id(self, auth_token):
        """Test GET /api/user/progress returns pb_client_record_id"""
        # First save a client ID
        test_client_id = "test_pb_client_id_progress_check"
        requests.post(
            f"{BASE_URL}/api/user/save-pb-client",
            json={"client_record_id": test_client_id},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # Then verify it's returned in progress
        response = requests.get(
            f"{BASE_URL}/api/user/progress",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Get progress failed: {response.text}"
        data = response.json()
        assert "pb_client_record_id" in data, "pb_client_record_id not in progress response"
        assert data["pb_client_record_id"] == test_client_id
        print(f"✅ Progress endpoint returns pb_client_record_id: {data['pb_client_record_id']}")
    
    def test_save_pb_client_requires_auth(self):
        """Test that save-pb-client requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/user/save-pb-client",
            json={"client_record_id": "test"}
        )
        
        assert response.status_code == 403 or response.status_code == 401
        print("✅ save-pb-client correctly requires authentication")


class TestUserProgress:
    """Test user progress endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_user_me(self, auth_token):
        """Test GET /api/user/me returns user info"""
        response = requests.get(
            f"{BASE_URL}/api/user/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Get user failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert data["email"] == TEST_USER_EMAIL
        assert "current_step" in data
        print(f"✅ User info retrieved: {data['email']}, step {data['current_step']}")
    
    def test_get_progress(self, auth_token):
        """Test GET /api/user/progress returns progress data"""
        response = requests.get(
            f"{BASE_URL}/api/user/progress",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Get progress failed: {response.text}"
        data = response.json()
        assert "current_step" in data
        assert "progress" in data
        assert isinstance(data["progress"], list)
        print(f"✅ Progress retrieved: step {data['current_step']}, {len(data['progress'])} progress records")


class TestAdminFunctions:
    """Test admin functionality including reset script"""
    
    @pytest.fixture
    def admin_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_admin_get_users(self, admin_token):
        """Test admin can get all users"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Admin get users failed: {response.text}"
        data = response.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        
        # Find test user
        test_user = next((u for u in data["users"] if u["email"] == TEST_USER_EMAIL), None)
        assert test_user is not None, f"Test user {TEST_USER_EMAIL} not found"
        print(f"✅ Admin retrieved {len(data['users'])} users, found test user")
    
    def test_admin_set_user_step(self, admin_token):
        """Test admin can set user step (used by reset script)"""
        # First get user ID
        users_response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = users_response.json()["users"]
        test_user = next((u for u in users if u["email"] == TEST_USER_EMAIL), None)
        user_id = test_user["id"]
        
        # Set step to 1
        response = requests.post(
            f"{BASE_URL}/api/admin/user/{user_id}/set-step",
            json={"step": 1},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Set step failed: {response.text}"
        data = response.json()
        assert "new_step" in data
        assert data["new_step"] == 1
        print(f"✅ Admin set user step to 1")


class TestSessionExpiration:
    """Test session expiration handling"""
    
    def test_expired_token_returns_401(self):
        """Test that expired/invalid token returns 401"""
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJleHAiOjE2MDAwMDAwMDB9.fake"
        
        response = requests.get(
            f"{BASE_URL}/api/user/me",
            headers={"Authorization": f"Bearer {fake_token}"}
        )
        
        assert response.status_code == 401
        print("✅ Expired/invalid token correctly returns 401")
    
    def test_missing_auth_returns_403(self):
        """Test that missing auth returns 403"""
        response = requests.get(f"{BASE_URL}/api/user/me")
        
        assert response.status_code == 403 or response.status_code == 401
        print("✅ Missing auth correctly rejected")


class TestBookingAPI:
    """Test booking-related APIs"""
    
    def test_booking_health(self):
        """Test booking health endpoint"""
        response = requests.get(f"{BASE_URL}/api/booking/health")
        
        assert response.status_code == 200, f"Booking health failed: {response.text}"
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✅ Booking API healthy with {data.get('active_consultants', 0)} consultants")
    
    def test_booking_availability(self):
        """Test booking availability endpoint"""
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=30")
        
        assert response.status_code == 200, f"Booking availability failed: {response.text}"
        data = response.json()
        assert "slots" in data
        assert "dates_with_availability" in data
        print(f"✅ Booking availability: {len(data['slots'])} slots, {len(data['dates_with_availability'])} dates")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
