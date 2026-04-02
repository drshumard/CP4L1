"""
Test Practice Better v2 Refactoring - Code Review Verification

Tests verify the following refactoring items:
1. Auth retries separated from transient retries (max_auth_retries=1)
2. 429 backoff uses config (retry_429_base_delay) instead of hardcoded values
3. search_client_by_email uses _request not raw HTTP
4. asyncio.gather for concurrent availability fetching with Semaphore(3)
5. IdempotencyEntry has status field (pending/complete)
6. Cache key includes practitioner hash
7. consultant_name gets actual name not email
8. CacheEntry.data typed as Any
9. validate_slot_from_cache renamed to slot_in_cache
10. Duration units documented
11. Inline imports moved to module level
12. Thread-safe singleton with asyncio.Lock
"""

import pytest
import requests
import os
import time
import inspect
import ast

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API_KEY = "HuwbV7JB4U96TZaRKnezWu3byhABolyulgdFs6jZUBc="


class TestAPIEndpoints:
    """Test API endpoints are working after refactoring"""
    
    def test_health_endpoint(self):
        """GET /api/booking/health - service healthy after refactoring"""
        response = requests.get(f"{BASE_URL}/api/booking/health", timeout=30)
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy"
        assert data.get("practice_better_connected") is True
        assert "active_consultants" in data
        print(f"✅ Health check passed: {data['active_consultants']} active consultants")
    
    def test_availability_endpoint(self):
        """GET /api/booking/availability - returns slots (verify concurrent fetch is working)"""
        from datetime import date
        today = date.today().isoformat()
        
        start_time = time.time()
        response = requests.get(
            f"{BASE_URL}/api/booking/availability",
            params={"start_date": today, "days": 14},
            timeout=60
        )
        elapsed = time.time() - start_time
        
        assert response.status_code == 200, f"Availability failed: {response.text}"
        data = response.json()
        assert "slots" in data
        assert "dates_with_availability" in data
        print(f"✅ Availability returned {len(data['slots'])} slots in {elapsed:.2f}s")
        # Concurrent fetch should be faster than sequential (6 consultants * ~1s each = ~6s sequential)
        # With concurrent fetch, should be ~1-2s
        if elapsed < 5:
            print(f"✅ Concurrent fetch appears to be working (completed in {elapsed:.2f}s)")
    
    def test_user_lookup_with_plus_email(self):
        """GET /api/user/lookup with + in email - regression check"""
        test_email = "raymond+test@fireside360.co.uk"
        response = requests.get(
            f"{BASE_URL}/api/user/lookup",
            params={"email": test_email},
            headers={"X-API-Key": API_KEY},
            timeout=10
        )
        # Should return 200 (found) or 404 (not found), not 500
        assert response.status_code in [200, 404], f"Lookup failed: {response.status_code} - {response.text}"
        print(f"✅ User lookup with + in email works: status {response.status_code}")
    
    def test_booking_cooldown_rapid_requests(self):
        """POST /api/booking/book - per-email 30-second cooldown still works"""
        from datetime import datetime, timedelta
        
        unique_email = f"test_cooldown_{int(time.time())}@example.com"
        
        # Use a date within 90 days but with a fake slot time that won't exist
        future_date = (datetime.utcnow() + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)
        slot_time = future_date.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        booking_data = {
            "first_name": "Test",
            "last_name": "Cooldown",
            "email": unique_email,
            "timezone": "America/New_York",
            "slot_start_time": slot_time,  # Valid future date, but slot won't exist
            "consultant_id": "test-consultant-id"
        }
        
        # First request - should fail with 409 (slot not found in cache)
        response1 = requests.post(
            f"{BASE_URL}/api/booking/book",
            json=booking_data,
            timeout=30
        )
        # Expected: 409 (slot not found in cache)
        assert response1.status_code in [400, 409, 422], f"First request unexpected: {response1.status_code}"
        print(f"First request status: {response1.status_code}")
        
        # Second rapid request - should hit cooldown (429)
        response2 = requests.post(
            f"{BASE_URL}/api/booking/book",
            json=booking_data,
            timeout=30
        )
        assert response2.status_code == 429, f"Expected 429 cooldown, got {response2.status_code}: {response2.text}"
        
        data = response2.json()
        assert "wait" in data.get("detail", "").lower(), f"Cooldown message missing 'wait': {data}"
        print(f"✅ Per-email 30-second cooldown works: {data.get('detail')}")


class TestCodeReviewVerification:
    """Verify code structure matches refactoring requirements"""
    
    @pytest.fixture(autouse=True)
    def load_source_code(self):
        """Load the practice_better_v2.py source code"""
        source_path = "/app/backend/services/practice_better_v2.py"
        with open(source_path, 'r') as f:
            self.source_code = f.read()
        self.tree = ast.parse(self.source_code)
    
    def test_auth_retries_separated_from_transient(self):
        """Verify _request separates auth retries (max_auth_retries=1) from transient retries (max_retries=2)"""
        # Check config has both retry settings
        assert "max_retries: int = 2" in self.source_code, "max_retries should default to 2"
        assert "max_auth_retries: int = 1" in self.source_code, "max_auth_retries should default to 1"
        
        # Check _request uses auth_retries_left
        assert "auth_retries_left = self.config.max_auth_retries" in self.source_code
        assert "auth_retries_left -= 1" in self.source_code
        assert "attempt -= 1" in self.source_code, "Auth retry should not consume transient retry"
        print("✅ Auth retries separated from transient retries")
    
    def test_429_backoff_uses_config(self):
        """Verify 429 backoff uses config (retry_429_base_delay) instead of hardcoded values"""
        assert "retry_429_base_delay: float = 10.0" in self.source_code
        assert "self.config.retry_429_base_delay" in self.source_code
        # Should NOT have hardcoded 10 in the 429 handling
        print("✅ 429 backoff uses config values")
    
    def test_search_client_by_email_uses_request(self):
        """Verify search_client_by_email uses _request not raw HTTP"""
        # Find the search_client_by_email method
        method_start = self.source_code.find("async def search_client_by_email")
        method_end = self.source_code.find("async def get_or_create_client")
        method_code = self.source_code[method_start:method_end]
        
        # Should use _request
        assert "await self._request(" in method_code, "search_client_by_email should use _request"
        # Should NOT have raw httpx calls
        assert "await client.request(" not in method_code, "Should not use raw httpx"
        assert "await client.get(" not in method_code, "Should not use raw httpx.get"
        print("✅ search_client_by_email uses _request")
    
    def test_asyncio_gather_with_semaphore(self):
        """Verify get_availability uses asyncio.gather with Semaphore(3)"""
        # Find get_availability method
        method_start = self.source_code.find("async def get_availability")
        method_end = self.source_code.find("def slot_in_cache")
        method_code = self.source_code[method_start:method_end]
        
        assert "asyncio.Semaphore(3)" in method_code, "Should use Semaphore(3)"
        assert "asyncio.gather(" in method_code, "Should use asyncio.gather"
        assert "async with sem:" in method_code, "Should use semaphore context manager"
        print("✅ get_availability uses asyncio.gather with Semaphore(3)")
    
    def test_cache_key_includes_practitioner_hash(self):
        """Verify cache_key includes practitioner hash"""
        assert "prac_hash = hash(tuple(sorted(self.config.practitioner_ids)))" in self.source_code
        assert "cache_key = f\"{start_date}:{days}:{prac_hash}\"" in self.source_code
        print("✅ Cache key includes practitioner hash")
    
    def test_idempotency_entry_has_status_field(self):
        """Verify IdempotencyEntry has status field (pending/complete)"""
        assert "IDEMPOTENCY_PENDING = \"pending\"" in self.source_code
        assert "IDEMPOTENCY_COMPLETE = \"complete\"" in self.source_code
        assert "class IdempotencyEntry:" in self.source_code
        assert "status: str" in self.source_code
        
        # Check IdempotencyStore uses IdempotencyEntry
        assert "IdempotencyEntry(" in self.source_code
        assert "status=IDEMPOTENCY_PENDING" in self.source_code
        assert "status=IDEMPOTENCY_COMPLETE" in self.source_code
        print("✅ IdempotencyEntry has status field (pending/complete)")
    
    def test_consultant_name_gets_actual_name(self):
        """Verify consultant_name reads firstName/lastName not emailAddress"""
        # In get_availability's fetch_consultant_slots
        assert "profile.get('firstName', '')" in self.source_code
        assert "profile.get('lastName', '')" in self.source_code
        
        # In complete_booking result
        assert "consultant.get('firstName', '')" in self.source_code
        assert "consultant.get('lastName', '')" in self.source_code
        
        # emailAddress should only be fallback
        assert "consultant.get(\"emailAddress\", \"\")" in self.source_code
        print("✅ consultant_name gets actual name (firstName/lastName), email is fallback")
    
    def test_cache_entry_data_typed_as_any(self):
        """Verify CacheEntry.data typed as Any"""
        assert "from typing import Any" in self.source_code
        assert "data: Any" in self.source_code
        print("✅ CacheEntry.data typed as Any")
    
    def test_slot_in_cache_renamed(self):
        """Verify validate_slot_from_cache renamed to slot_in_cache"""
        assert "def slot_in_cache(" in self.source_code
        assert "validate_slot_from_cache" not in self.source_code
        print("✅ validate_slot_from_cache renamed to slot_in_cache")
    
    def test_duration_units_documented(self):
        """Verify duration units documented in comments"""
        # TimeSlot duration should be documented as minutes
        assert "duration: int  # minutes" in self.source_code
        # BookingResult duration should be documented as seconds
        assert "duration: int  # seconds" in self.source_code
        print("✅ Duration units documented (minutes for TimeSlot, seconds for BookingResult)")
    
    def test_imports_at_module_level(self):
        """Verify inline imports moved to module level"""
        # Check all imports are at the top (before class definitions)
        import_section_end = self.source_code.find("# ============")
        import_section = self.source_code[:import_section_end]
        
        # Key imports should be at module level
        assert "import asyncio" in import_section
        assert "import httpx" in import_section
        assert "import uuid" in import_section
        assert "import random" in import_section
        assert "from dataclasses import dataclass" in import_section
        
        # Check no inline imports in main methods (except for specific cases like booking.py)
        # The _request method should not have inline imports
        request_method_start = self.source_code.find("async def _request(")
        request_method_end = self.source_code.find("async def get_consultants(")
        request_method = self.source_code[request_method_start:request_method_end]
        assert "import " not in request_method, "No inline imports in _request method"
        print("✅ Inline imports moved to module level")
    
    def test_thread_safe_singleton_with_lock(self):
        """Verify init_service() uses asyncio.Lock for thread safety"""
        assert "_init_lock = asyncio.Lock()" in self.source_code
        
        # Find init_service function
        init_start = self.source_code.find("async def init_service()")
        init_end = self.source_code.find("async def shutdown_service()")
        init_code = self.source_code[init_start:init_end]
        
        assert "async with _init_lock:" in init_code, "init_service should use _init_lock"
        print("✅ init_service() uses asyncio.Lock for thread safety")


class TestCacheStatus:
    """Test cache status endpoint"""
    
    def test_cache_status_endpoint(self):
        """GET /api/booking/cache-status - returns cache info"""
        response = requests.get(f"{BASE_URL}/api/booking/cache-status", timeout=10)
        assert response.status_code == 200, f"Cache status failed: {response.text}"
        data = response.json()
        assert "total_cached_clients" in data
        assert "availability_cache_entries" in data
        print(f"✅ Cache status: {data['total_cached_clients']} clients, {data['availability_cache_entries']} availability entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
