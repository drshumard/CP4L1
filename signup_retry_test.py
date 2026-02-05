#!/usr/bin/env python3
"""
Signup Retry Logic Testing Suite
Tests the new retry logic with race condition handling for the signup endpoint.
"""

import requests
import json
import time
import sys
import asyncio
import threading
from datetime import datetime
import subprocess
import os

# Configuration
BACKEND_URL = "https://onboard-portal-7.preview.emergentagent.com/api"
WEBHOOK_SECRET = "your-webhook-secret-key-change-in-production"

class SignupRetryTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_result(self, test_name, success, message, response_data=None, duration=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "duration": duration,
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        duration_str = f" ({duration:.1f}s)" if duration else ""
        print(f"{status} {test_name}: {message}{duration_str}")
        if response_data and not success:
            print(f"   Response: {response_data}")

    def create_user_via_webhook(self, email, name):
        """Helper: Create user via webhook"""
        url = f"{BACKEND_URL}/webhook/ghl"
        payload = {"email": email, "name": name}
        params = {"webhook_secret": WEBHOOK_SECRET}
        
        try:
            response = self.session.post(url, json=payload, params=params)
            return response.status_code == 200, response.json() if response.content else None
        except Exception as e:
            return False, str(e)

    def call_signup_endpoint(self, email, name, password="TestPassword123!"):
        """Helper: Call signup endpoint and measure time"""
        url = f"{BACKEND_URL}/auth/signup"
        payload = {"email": email, "name": name, "password": password}
        
        start_time = time.time()
        try:
            response = self.session.post(url, json=payload)
            duration = time.time() - start_time
            return response.status_code, response.json() if response.content else None, duration
        except Exception as e:
            duration = time.time() - start_time
            return None, str(e), duration

    def test_1_user_already_exists(self):
        """Test 1: User Already Exists (Normal Flow)"""
        print("\n=== Test 1: User Already Exists (Normal Flow) ===")
        
        test_email = f"existing.user.{int(time.time())}@example.com"
        test_name = "Existing User Test"
        
        # Step 1: Create user via webhook first
        webhook_success, webhook_data = self.create_user_via_webhook(test_email, test_name)
        
        if not webhook_success:
            self.log_result(
                "Test 1 - Webhook Setup", 
                False, 
                f"Failed to create user via webhook: {webhook_data}"
            )
            return False
        
        self.log_result(
            "Test 1 - Webhook Setup", 
            True, 
            f"User created via webhook: {webhook_data.get('user_id', 'N/A')}"
        )
        
        # Step 2: Call signup endpoint (should succeed within 10 seconds)
        status_code, response_data, duration = self.call_signup_endpoint(test_email, test_name)
        
        if status_code == 200 and "access_token" in response_data:
            if duration <= 12:  # Allow 2 seconds buffer for network
                self.log_result(
                    "Test 1 - Signup Success", 
                    True, 
                    f"Signup succeeded within expected time (10s initial wait)", 
                    duration=duration
                )
                return True
            else:
                self.log_result(
                    "Test 1 - Signup Timing", 
                    False, 
                    f"Signup took too long: expected ~10s, got {duration:.1f}s", 
                    duration=duration
                )
                return False
        else:
            self.log_result(
                "Test 1 - Signup Failed", 
                False, 
                f"Signup failed: {status_code}", 
                response_data, 
                duration
            )
            return False

    def test_2_user_created_during_retry(self):
        """Test 2: User Created During Retry Window"""
        print("\n=== Test 2: User Created During Retry Window ===")
        
        test_email = f"retry.user.{int(time.time())}@example.com"
        test_name = "Retry User Test"
        
        # Step 1: Start signup call for non-existent user
        print("   Starting signup call for non-existent user...")
        
        def delayed_webhook_creation():
            """Create user via webhook after 15 seconds"""
            time.sleep(15)
            print("   Creating user via webhook (after 15s delay)...")
            success, data = self.create_user_via_webhook(test_email, test_name)
            if success:
                print(f"   Webhook user created: {data.get('user_id', 'N/A')}")
            else:
                print(f"   Webhook creation failed: {data}")
            return success, data
        
        # Start webhook creation in background
        webhook_thread = threading.Thread(target=delayed_webhook_creation)
        webhook_thread.start()
        
        # Step 2: Call signup endpoint (should wait, retry, find user, and succeed)
        status_code, response_data, duration = self.call_signup_endpoint(test_email, test_name)
        
        # Wait for webhook thread to complete
        webhook_thread.join()
        
        if status_code == 200 and "access_token" in response_data:
            if 15 <= duration <= 25:  # Should be between 15-25 seconds
                self.log_result(
                    "Test 2 - Retry Success", 
                    True, 
                    f"Signup succeeded after retry window", 
                    duration=duration
                )
                return True
            else:
                self.log_result(
                    "Test 2 - Retry Timing", 
                    False, 
                    f"Unexpected timing: expected 15-25s, got {duration:.1f}s", 
                    duration=duration
                )
                return False
        else:
            self.log_result(
                "Test 2 - Retry Failed", 
                False, 
                f"Signup failed during retry: {status_code}", 
                response_data, 
                duration
            )
            return False

    def test_3_user_never_created(self):
        """Test 3: User Never Created (Timeout)"""
        print("\n=== Test 3: User Never Created (Timeout) ===")
        
        test_email = f"nonexistent.user.{int(time.time())}@example.com"
        test_name = "Nonexistent User Test"
        
        # Call signup endpoint for user that will never exist
        print("   Calling signup for user that will never be created...")
        status_code, response_data, duration = self.call_signup_endpoint(test_email, test_name)
        
        # Should return 404 after exactly 40 seconds (10 + 6*5)
        if status_code == 404:
            if 38 <= duration <= 42:  # Allow 2 seconds buffer
                if "Email not found. Please complete purchase first." in response_data.get("detail", ""):
                    self.log_result(
                        "Test 3 - Timeout Success", 
                        True, 
                        f"Correctly timed out after 40s with proper error message", 
                        duration=duration
                    )
                    return True
                else:
                    self.log_result(
                        "Test 3 - Error Message", 
                        False, 
                        f"Wrong error message: {response_data.get('detail', 'N/A')}", 
                        response_data, 
                        duration
                    )
                    return False
            else:
                self.log_result(
                    "Test 3 - Timeout Timing", 
                    False, 
                    f"Wrong timeout duration: expected ~40s, got {duration:.1f}s", 
                    duration=duration
                )
                return False
        else:
            self.log_result(
                "Test 3 - Timeout Failed", 
                False, 
                f"Expected 404 timeout, got {status_code}", 
                response_data, 
                duration
            )
            return False

    def test_4_check_logging(self):
        """Test 4: Check Logging"""
        print("\n=== Test 4: Check Logging ===")
        
        # Check backend logs for retry messages
        try:
            # Get recent backend logs
            log_command = "tail -n 100 /var/log/supervisor/backend.*.log"
            result = subprocess.run(log_command, shell=True, capture_output=True, text=True)
            
            if result.returncode != 0:
                self.log_result(
                    "Test 4 - Log Access", 
                    False, 
                    f"Failed to access backend logs: {result.stderr}"
                )
                return False
            
            log_content = result.stdout
            
            # Check for expected log messages
            expected_messages = [
                "Waiting 10 seconds for webhook processing",
                "not found yet. Retry",
                "found after"
            ]
            
            found_messages = []
            for message in expected_messages:
                if message in log_content:
                    found_messages.append(message)
            
            if len(found_messages) >= 2:  # At least 2 out of 3 expected messages
                self.log_result(
                    "Test 4 - Logging Check", 
                    True, 
                    f"Found expected log messages: {found_messages}"
                )
                return True
            else:
                self.log_result(
                    "Test 4 - Logging Check", 
                    False, 
                    f"Missing expected log messages. Found: {found_messages}"
                )
                # Print recent logs for debugging
                print("   Recent backend logs:")
                for line in log_content.split('\n')[-20:]:
                    if line.strip():
                        print(f"   {line}")
                return False
                
        except Exception as e:
            self.log_result(
                "Test 4 - Logging Check", 
                False, 
                f"Error checking logs: {str(e)}"
            )
            return False

    def run_all_tests(self):
        """Run all signup retry tests"""
        print("🚀 Starting Signup Retry Logic Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print("Testing new 40-second retry logic with race condition handling")
        print("=" * 70)
        
        # Run tests in sequence
        tests = [
            ("Test 1: User Already Exists", self.test_1_user_already_exists),
            ("Test 2: User Created During Retry", self.test_2_user_created_during_retry),
            ("Test 3: User Never Created", self.test_3_user_never_created),
            ("Test 4: Check Logging", self.test_4_check_logging)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n🔄 Running {test_name}...")
            try:
                if test_func():
                    passed += 1
                    print(f"✅ {test_name} completed successfully")
                else:
                    print(f"❌ {test_name} failed")
            except Exception as e:
                print(f"💥 {test_name} crashed: {str(e)}")
        
        # Summary
        print("\n" + "=" * 70)
        print("🏁 SIGNUP RETRY LOGIC TEST SUMMARY")
        print("=" * 70)
        
        total_checks = len(self.test_results)
        passed_checks = sum(1 for result in self.test_results if result["success"])
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            duration_str = f" ({result['duration']:.1f}s)" if result.get('duration') else ""
            print(f"{status} {result['test']}: {result['message']}{duration_str}")
        
        print(f"\nOverall: {passed_checks}/{total_checks} individual checks passed")
        print(f"Test Scenarios: {passed}/{total} test scenarios completed successfully")
        
        if passed_checks == total_checks:
            print("🎉 All signup retry tests passed! New retry logic is working correctly.")
            return True
        else:
            print(f"⚠️  {total_checks - passed_checks} checks failed. Please review the issues above.")
            return False

def main():
    """Main test runner"""
    tester = SignupRetryTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()