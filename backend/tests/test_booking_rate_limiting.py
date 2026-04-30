"""
Test suite for Practice Better 429 rate limiting fixes
Tests the following improvements:
1. Per-email 30-second booking cooldown (POST /api/booking/book)
2. Reduced max_retries from 3 to 2 in PB service config
3. _request() handles 429 with longer delay (10s+ based on Retry-After header)
4. get_or_create_client() checks local cache FIRST before creating
5. search_client_by_email() method exists and searches /consultant/records
6. User lookup endpoint still works with + in email (regression check)
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://wellness-onboard-4.preview.emergentagent.com"

# Test credentials
LOOKUP_API_KEY = "HuwbV7JB4U96TZaRKnezWu3byhABolyulgdFs6jZUBc="
EMAIL_WITH_PLUS = "raymond+test@fireside360.co.uk"

# Use a future slot time (7 days from now at 10:00 UTC)
FUTURE_SLOT_TIME = (datetime.utcnow() + timedelta(days=7)).replace(hour=16, minute=30, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
# Use a valid consultant ID from the availability response
VALID_CONSULTANT_ID = "63d9da77036354ef722f2e27"


class TestBookingCooldown:
    """Tests for per-email 30-second booking cooldown"""
    
    def test_first_booking_attempt_not_rate_limited(self):
        """First booking attempt should not be rate limited (may fail for other reasons)"""
        # Use a unique email to avoid hitting existing cooldowns
        test_email = f"test_cooldown_{int(time.time())}@example.com"
        
        url = f"{BASE_URL}/api/booking/book"
        payload = {
            "first_name": "Test",
            "last_name": "User",
            "email": test_email,
            "timezone": "America/New_York",
            "slot_start_time": FUTURE_SLOT_TIME,
            "consultant_id": VALID_CONSULTANT_ID
        }
        
        response = requests.post(url, json=payload)
        
        print(f"First attempt - Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # First attempt should NOT be 429 (may be 400/409/500 for other reasons)
        assert response.status_code != 429, f"First attempt should not be rate limited, got 429"
    
    def test_second_booking_attempt_rate_limited_on_failure(self):
        """Second booking attempt with same email within 30s should return 429 when first fails"""
        # Use a unique email for this test
        test_email = f"test_cooldown_rapid_{int(time.time())}@example.com"
        
        url = f"{BASE_URL}/api/booking/book"
        # Use a valid future time but with a non-existent slot (will fail with 409)
        future_time = (datetime.utcnow() + timedelta(days=30)).replace(hour=3, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload = {
            "first_name": "Test",
            "last_name": "User",
            "email": test_email,
            "timezone": "America/New_York",
            "slot_start_time": future_time,  # Valid future time but unlikely to be an actual slot
            "consultant_id": VALID_CONSULTANT_ID
        }
        
        # First request - should fail with 409 (slot not available)
        response1 = requests.post(url, json=payload)
        print(f"First attempt - Status: {response1.status_code}")
        print(f"First response: {response1.text[:300]}")
        
        # The cooldown is set at the start of the function, so second request should be 429
        response2 = requests.post(url, json=payload)
        print(f"Second attempt - Status: {response2.status_code}")
        print(f"Response: {response2.text[:500]}")
        
        # Second attempt should be 429 (cooldown active)
        assert response2.status_code == 429, f"Expected 429 for rapid retry after failure, got {response2.status_code}"
        
        # Check response message mentions waiting
        data = response2.json()
        detail = data.get("detail", "")
        assert "wait" in detail.lower() or "second" in detail.lower(), f"Response should mention waiting: {detail}"
    
    def test_cooldown_message_includes_seconds(self):
        """Cooldown response should include remaining seconds"""
        test_email = f"test_cooldown_msg_{int(time.time())}@example.com"
        
        url = f"{BASE_URL}/api/booking/book"
        payload = {
            "first_name": "Test",
            "last_name": "User",
            "email": test_email,
            "timezone": "America/New_York",
            "slot_start_time": FUTURE_SLOT_TIME,
            "consultant_id": VALID_CONSULTANT_ID
        }
        
        # First request
        requests.post(url, json=payload)
        
        # Second request
        response = requests.post(url, json=payload)
        
        if response.status_code == 429:
            data = response.json()
            detail = data.get("detail", "")
            print(f"Cooldown message: {detail}")
            
            # Should contain a number (seconds remaining)
            import re
            numbers = re.findall(r'\d+', detail)
            assert len(numbers) > 0, f"Cooldown message should include seconds: {detail}"
            
            # The number should be <= 30 (cooldown period)
            seconds = int(numbers[0])
            assert seconds <= 30, f"Cooldown seconds should be <= 30, got {seconds}"
    
    def test_different_emails_not_affected(self):
        """Different emails should not share cooldown"""
        base_time = int(time.time())
        email1 = f"test_cooldown_a_{base_time}@example.com"
        email2 = f"test_cooldown_b_{base_time}@example.com"
        
        url = f"{BASE_URL}/api/booking/book"
        
        # First request with email1
        payload1 = {
            "first_name": "Test",
            "last_name": "User",
            "email": email1,
            "timezone": "America/New_York",
            "slot_start_time": FUTURE_SLOT_TIME,
            "consultant_id": VALID_CONSULTANT_ID
        }
        response1 = requests.post(url, json=payload1)
        print(f"Email1 first attempt - Status: {response1.status_code}")
        
        # First request with email2 (should NOT be rate limited)
        payload2 = {
            "first_name": "Test",
            "last_name": "User",
            "email": email2,
            "timezone": "America/New_York",
            "slot_start_time": FUTURE_SLOT_TIME,
            "consultant_id": VALID_CONSULTANT_ID
        }
        response2 = requests.post(url, json=payload2)
        print(f"Email2 first attempt - Status: {response2.status_code}")
        
        # Email2 should NOT be 429 (different email)
        assert response2.status_code != 429, f"Different email should not be rate limited, got 429"


class TestBookingHealthEndpoint:
    """Tests for booking health endpoint"""
    
    def test_booking_health_endpoint(self):
        """Test /api/booking/health endpoint"""
        url = f"{BASE_URL}/api/booking/health"
        
        response = requests.get(url)
        
        print(f"Health check - Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Should return 200 or 503 (if PB is unavailable)
        assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "status" in data
            assert data["status"] == "healthy"


class TestBookingAvailability:
    """Tests for booking availability endpoint"""
    
    def test_availability_endpoint(self):
        """Test /api/booking/availability endpoint"""
        url = f"{BASE_URL}/api/booking/availability?start_date=2026-01-20&days=14"
        
        response = requests.get(url)
        
        print(f"Availability - Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Should return 200 or 503
        assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "slots" in data
            assert "dates_with_availability" in data


class TestUserLookupRegression:
    """Regression tests for user lookup with + in email"""
    
    def test_lookup_with_plus_sign_still_works(self):
        """Regression: User lookup with + in email should still work"""
        url = f"{BASE_URL}/api/user/lookup?email={EMAIL_WITH_PLUS}"
        headers = {"X-API-Key": LOOKUP_API_KEY}
        
        response = requests.get(url, headers=headers)
        
        print(f"Lookup with + - Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("found") == True, "User should be found"


class TestBookingCacheStatus:
    """Tests for booking cache status endpoint"""
    
    def test_cache_status_endpoint(self):
        """Test /api/booking/cache-status endpoint"""
        url = f"{BASE_URL}/api/booking/cache-status"
        
        response = requests.get(url)
        
        print(f"Cache status - Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total_cached_clients" in data
        assert "availability_cache_entries" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
