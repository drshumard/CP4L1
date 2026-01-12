"""
Backend API Tests for Practice Better Booking System

Tests the booking endpoints:
- GET /api/booking/health - Health check endpoint
- GET /api/booking/availability - Get available slots
- GET /api/booking/availability/{date} - Get slots for specific date
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://intake-wizard-3.preview.emergentagent.com')


class TestBookingHealth:
    """Health check endpoint tests"""
    
    def test_health_endpoint_returns_200(self):
        """Test that health endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/booking/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
    def test_health_endpoint_returns_connected_status(self):
        """Test that health endpoint returns Practice Better connected status"""
        response = requests.get(f"{BASE_URL}/api/booking/health")
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "healthy", f"Expected 'healthy', got {data['status']}"
        assert "practice_better_connected" in data, "Response should contain 'practice_better_connected' field"
        assert data["practice_better_connected"] == True, "Practice Better should be connected"
        
    def test_health_endpoint_returns_active_consultants(self):
        """Test that health endpoint returns active consultants count"""
        response = requests.get(f"{BASE_URL}/api/booking/health")
        assert response.status_code == 200
        
        data = response.json()
        assert "active_consultants" in data, "Response should contain 'active_consultants' field"
        assert isinstance(data["active_consultants"], int), "active_consultants should be an integer"
        assert data["active_consultants"] > 0, "Should have at least one active consultant"


class TestBookingAvailability:
    """Availability endpoint tests"""
    
    def test_availability_endpoint_returns_200(self):
        """Test that availability endpoint returns 200 OK"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=14")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
    def test_availability_returns_slots_array(self):
        """Test that availability endpoint returns slots array"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=14")
        assert response.status_code == 200
        
        data = response.json()
        assert "slots" in data, "Response should contain 'slots' field"
        assert isinstance(data["slots"], list), "slots should be a list"
        
    def test_availability_returns_dates_with_availability(self):
        """Test that availability endpoint returns dates_with_availability array"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=14")
        assert response.status_code == 200
        
        data = response.json()
        assert "dates_with_availability" in data, "Response should contain 'dates_with_availability' field"
        assert isinstance(data["dates_with_availability"], list), "dates_with_availability should be a list"
        
    def test_availability_slot_structure(self):
        """Test that each slot has required fields"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=14")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["slots"]) > 0:
            slot = data["slots"][0]
            assert "start_time" in slot, "Slot should have 'start_time' field"
            assert "end_time" in slot, "Slot should have 'end_time' field"
            assert "duration" in slot, "Slot should have 'duration' field"
            assert "consultant_id" in slot, "Slot should have 'consultant_id' field"
            
    def test_availability_has_slots(self):
        """Test that availability returns some slots"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=60")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["slots"]) > 0, "Should have at least one available slot"
        print(f"Found {len(data['slots'])} available slots")
        
    def test_availability_invalid_date_format(self):
        """Test that invalid date format returns 400"""
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date=invalid-date&days=14")
        assert response.status_code == 400, f"Expected 400 for invalid date, got {response.status_code}"
        
    def test_availability_days_parameter_validation(self):
        """Test that days parameter is validated"""
        today = datetime.now().strftime("%Y-%m-%d")
        # Test with days > 60 (should be capped or rejected)
        response = requests.get(f"{BASE_URL}/api/booking/availability?start_date={today}&days=100")
        # Should either return 422 (validation error) or 200 with capped days
        assert response.status_code in [200, 422], f"Expected 200 or 422, got {response.status_code}"


class TestBookingAvailabilityForDate:
    """Availability for specific date endpoint tests"""
    
    def test_availability_for_date_returns_200(self):
        """Test that availability for date endpoint returns 200 OK"""
        # Use a future date that should have availability
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability/{future_date}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
    def test_availability_for_date_returns_date_field(self):
        """Test that response contains the requested date"""
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability/{future_date}")
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data, "Response should contain 'date' field"
        assert data["date"] == future_date, f"Expected date {future_date}, got {data['date']}"
        
    def test_availability_for_date_returns_slots(self):
        """Test that response contains slots array"""
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability/{future_date}")
        assert response.status_code == 200
        
        data = response.json()
        assert "slots" in data, "Response should contain 'slots' field"
        assert isinstance(data["slots"], list), "slots should be a list"
        
    def test_availability_for_past_date_returns_400(self):
        """Test that past date returns 400"""
        past_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/booking/availability/{past_date}")
        assert response.status_code == 400, f"Expected 400 for past date, got {response.status_code}"
        
    def test_availability_for_invalid_date_returns_400(self):
        """Test that invalid date format returns 400"""
        response = requests.get(f"{BASE_URL}/api/booking/availability/invalid-date")
        assert response.status_code == 400, f"Expected 400 for invalid date, got {response.status_code}"


class TestBookingCacheStatus:
    """Cache status endpoint tests"""
    
    def test_cache_status_returns_200(self):
        """Test that cache status endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/booking/cache-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
    def test_cache_status_returns_expected_fields(self):
        """Test that cache status returns expected fields"""
        response = requests.get(f"{BASE_URL}/api/booking/cache-status")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_cached_clients" in data, "Response should contain 'total_cached_clients' field"
        assert "needs_sync" in data, "Response should contain 'needs_sync' field"
        assert "availability_cache_entries" in data, "Response should contain 'availability_cache_entries' field"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
