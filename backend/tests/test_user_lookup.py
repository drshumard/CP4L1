"""
Test suite for /api/user/lookup endpoint
Tests the three fixes:
1. Email with + sign handling (raw + in URL and %2B encoded)
2. Normal email lookup (no +)
3. API key validation (401 for wrong/missing key)
4. Case-insensitive email matching
"""

import pytest
import requests
import os

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://staff-access-12.preview.emergentagent.com"

# Test credentials from review request
LOOKUP_API_KEY = "HuwbV7JB4U96TZaRKnezWu3byhABolyulgdFs6jZUBc="
EMAIL_WITH_PLUS = "raymond+test@fireside360.co.uk"
NORMAL_EMAIL = "raymond@fireside360.co.uk"


class TestUserLookupEndpoint:
    """Tests for GET /api/user/lookup endpoint"""
    
    def test_lookup_with_plus_sign_raw(self):
        """Test lookup with raw + sign in email (not URL encoded)"""
        # Using raw + in URL - this is the bug that was fixed
        url = f"{BASE_URL}/api/user/lookup?email={EMAIL_WITH_PLUS}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("found") == True, "User should be found"
        assert "user" in data, "Response should contain user object"
        # Email should match (case-insensitive)
        assert data["user"]["email"].lower() == EMAIL_WITH_PLUS.lower(), f"Email mismatch: {data['user']['email']}"
    
    def test_lookup_with_plus_sign_encoded(self):
        """Test lookup with %2B encoded + sign in email"""
        # Using %2B encoding for + sign
        encoded_email = EMAIL_WITH_PLUS.replace("+", "%2B")
        url = f"{BASE_URL}/api/user/lookup?email={encoded_email}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("found") == True, "User should be found"
        assert "user" in data, "Response should contain user object"
        assert data["user"]["email"].lower() == EMAIL_WITH_PLUS.lower(), f"Email mismatch: {data['user']['email']}"
    
    def test_lookup_normal_email(self):
        """Test lookup with normal email (no + sign)"""
        url = f"{BASE_URL}/api/user/lookup?email={NORMAL_EMAIL}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("found") == True, "User should be found"
        assert "user" in data, "Response should contain user object"
        assert data["user"]["email"].lower() == NORMAL_EMAIL.lower(), f"Email mismatch: {data['user']['email']}"
    
    def test_lookup_missing_api_key(self):
        """Test lookup without X-API-Key header returns 401"""
        url = f"{BASE_URL}/api/user/lookup?email={NORMAL_EMAIL}"
        # No X-API-Key header
        
        response = requests.get(url)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_lookup_wrong_api_key(self):
        """Test lookup with wrong X-API-Key returns 401"""
        url = f"{BASE_URL}/api/user/lookup?email={NORMAL_EMAIL}"
        headers = {"X-API-Key": "wrong-api-key-12345"}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_lookup_case_insensitive(self):
        """Test lookup with different case email (case-insensitive matching)"""
        # Use uppercase version of email
        uppercase_email = NORMAL_EMAIL.upper()
        url = f"{BASE_URL}/api/user/lookup?email={uppercase_email}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("found") == True, "User should be found with case-insensitive match"
    
    def test_lookup_nonexistent_email(self):
        """Test lookup with non-existent email returns 404"""
        url = f"{BASE_URL}/api/user/lookup?email=nonexistent-user-12345@example.com"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"URL: {url}")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_lookup_response_structure(self):
        """Test that lookup response has correct structure"""
        url = f"{BASE_URL}/api/user/lookup?email={NORMAL_EMAIL}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        assert response.status_code == 200
        
        data = response.json()
        
        # Check top-level structure
        assert "found" in data
        assert "user" in data
        assert "progress" in data
        
        # Check user object structure
        user = data["user"]
        assert "id" in user
        assert "email" in user
        assert "current_step" in user
        assert "current_step_name" in user
        
        print(f"User structure verified: {user}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
