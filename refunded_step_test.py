#!/usr/bin/env python3
"""
Refunded Step Functionality Testing
Tests the new "Refunded" step (Step 0) functionality
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BACKEND_URL = "https://patient-portal-99.preview.emergentagent.com/api"

class RefundedStepTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.test_admin_token = None
        self.refunded_test_user_id = None
        self.refunded_test_user_email = "raymond@fireside360.co.uk"
        
    def log_result(self, test_name, success, message, response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if response_data and not success:
            print(f"   Response: {response_data}")

    def login_test_admin(self):
        """Helper: Login as test admin user"""
        print("\n=== Logging in as Test Admin ===")
        
        # Use the test credentials provided
        login_url = f"{BACKEND_URL}/auth/login"
        login_payload = {
            "email": "testadmin@test.com",
            "password": "test123"
        }
        
        try:
            response = self.session.post(login_url, json=login_payload)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.test_admin_token = data["access_token"]
                    self.log_result(
                        "Test Admin Login", 
                        True, 
                        "Successfully logged in as testadmin@test.com"
                    )
                    return True
                else:
                    self.log_result(
                        "Test Admin Login", 
                        False, 
                        "Missing access token in response",
                        data
                    )
            else:
                self.log_result(
                    "Test Admin Login", 
                    False, 
                    f"Login failed: {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Test Admin Login", False, f"Request failed: {str(e)}")
            return False
            
        return True

    def get_user_id_by_email(self, email):
        """Helper: Get user ID by email using admin endpoint"""
        if not self.test_admin_token:
            return None
        
        url = f"{BACKEND_URL}/admin/users"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        
        try:
            response = self.session.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                users = data.get("users", [])
                for user in users:
                    if user.get("email") == email:
                        return user.get("id")
            return None
        except Exception as e:
            print(f"Error getting user ID: {str(e)}")
            return None

    def test_refunded_step_set_user_to_step_0(self):
        """Test 1: Set User to Refunded Step (Step 0)"""
        print("\n=== Testing Set User to Refunded Step (Step 0) ===")
        
        if not self.test_admin_token:
            self.log_result(
                "Set User to Refunded Step - No Admin Token", 
                False, 
                "No test admin token available"
            )
            return False
        
        # Get user ID for raymond@fireside360.co.uk
        user_id = self.get_user_id_by_email(self.refunded_test_user_email)
        
        if not user_id:
            self.log_result(
                "Set User to Refunded Step - User Not Found", 
                False, 
                f"Could not find user ID for {self.refunded_test_user_email}"
            )
            return False
        
        # Store user_id for other tests
        self.refunded_test_user_id = user_id
        
        url = f"{BACKEND_URL}/admin/user/{user_id}/set-step"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        payload = {"step": 0}
        
        try:
            response = self.session.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                message = data.get("message", "")
                
                if "Refunded" in message:
                    self.log_result(
                        "Set User to Refunded Step", 
                        True, 
                        f"Successfully set user to step 0 (Refunded): {message}"
                    )
                    return True
                else:
                    self.log_result(
                        "Set User to Refunded Step", 
                        False, 
                        f"Response doesn't mention 'Refunded': {message}",
                        data
                    )
            else:
                self.log_result(
                    "Set User to Refunded Step", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Set User to Refunded Step", False, f"Request failed: {str(e)}")
            return False
            
        return True

    def test_refunded_user_access_restrictions(self):
        """Test 2: Verify Refunded User Cannot Access Normal Routes"""
        print("\n=== Testing Refunded User Access Restrictions ===")
        
        # Login as raymond@fireside360.co.uk
        login_url = f"{BACKEND_URL}/auth/login"
        login_payload = {
            "email": "raymond@fireside360.co.uk",
            "password": "akosua1001"
        }
        
        try:
            login_response = self.session.post(login_url, json=login_payload)
            
            if login_response.status_code == 200:
                login_data = login_response.json()
                refunded_user_token = login_data.get("access_token")
                
                if not refunded_user_token:
                    self.log_result(
                        "Refunded User Login", 
                        False, 
                        "No access token received from login"
                    )
                    return False
                
                self.log_result(
                    "Refunded User Login", 
                    True, 
                    "Successfully logged in as refunded user"
                )
                
                # Test GET /api/user/progress
                progress_url = f"{BACKEND_URL}/user/progress"
                headers = {"Authorization": f"Bearer {refunded_user_token}"}
                
                progress_response = self.session.get(progress_url, headers=headers)
                
                if progress_response.status_code == 200:
                    progress_data = progress_response.json()
                    current_step = progress_data.get("current_step")
                    
                    if current_step == 0:
                        self.log_result(
                            "Refunded User Progress Check", 
                            True, 
                            f"Confirmed user is at step 0 (Refunded): current_step = {current_step}"
                        )
                        return True
                    else:
                        self.log_result(
                            "Refunded User Progress Check", 
                            False, 
                            f"Expected current_step = 0, got {current_step}",
                            progress_data
                        )
                else:
                    self.log_result(
                        "Refunded User Progress Check", 
                        False, 
                        f"Progress endpoint failed: {progress_response.status_code}",
                        progress_response.json() if progress_response.content else None
                    )
                    return False
            else:
                self.log_result(
                    "Refunded User Login", 
                    False, 
                    f"Login failed: {login_response.status_code}",
                    login_response.json() if login_response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Refunded User Access Test", False, f"Request failed: {str(e)}")
            return False
            
        return True

    def test_reset_user_to_step_1(self):
        """Test 3: Reset User to Step 1"""
        print("\n=== Testing Reset User to Step 1 ===")
        
        if not self.test_admin_token:
            self.log_result(
                "Reset User to Step 1 - No Admin Token", 
                False, 
                "No test admin token available"
            )
            return False
        
        if not self.refunded_test_user_id:
            self.log_result(
                "Reset User to Step 1 - No User ID", 
                False, 
                "No refunded test user ID available"
            )
            return False
        
        url = f"{BACKEND_URL}/admin/user/{self.refunded_test_user_id}/set-step"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        payload = {"step": 1}
        
        try:
            response = self.session.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                message = data.get("message", "")
                
                if "Step 1" in message or "step 1" in message:
                    self.log_result(
                        "Reset User to Step 1", 
                        True, 
                        f"Successfully reset user to step 1: {message}"
                    )
                    return True
                else:
                    self.log_result(
                        "Reset User to Step 1", 
                        False, 
                        f"Response doesn't confirm step 1: {message}",
                        data
                    )
            else:
                self.log_result(
                    "Reset User to Step 1", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Reset User to Step 1", False, f"Request failed: {str(e)}")
            return False
            
        return True

    def test_resend_welcome_email(self):
        """Test 4: Test Resend Welcome Email Endpoint"""
        print("\n=== Testing Resend Welcome Email Endpoint ===")
        
        if not self.test_admin_token:
            self.log_result(
                "Resend Welcome Email - No Admin Token", 
                False, 
                "No test admin token available"
            )
            return False
        
        if not self.refunded_test_user_id:
            self.log_result(
                "Resend Welcome Email - No User ID", 
                False, 
                "No refunded test user ID available"
            )
            return False
        
        url = f"{BACKEND_URL}/admin/user/{self.refunded_test_user_id}/resend-welcome"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        
        try:
            response = self.session.post(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                message = data.get("message", "")
                
                if "email" in message.lower() and ("sent" in message.lower() or "resent" in message.lower()):
                    self.log_result(
                        "Resend Welcome Email", 
                        True, 
                        f"Successfully resent welcome email: {message}"
                    )
                    return True
                else:
                    self.log_result(
                        "Resend Welcome Email", 
                        False, 
                        f"Response doesn't confirm email sent: {message}",
                        data
                    )
            else:
                self.log_result(
                    "Resend Welcome Email", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Resend Welcome Email", False, f"Request failed: {str(e)}")
            return False
            
        return True

    def run_refunded_step_tests(self):
        """Run all refunded step functionality tests"""
        print("🔄 Starting Refunded Step Functionality Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Test User: {self.refunded_test_user_email}")
        print("=" * 60)
        
        # Login as admin first
        if not self.login_test_admin():
            print("❌ Cannot proceed without admin login")
            return False
        
        # Run tests in sequence
        tests = [
            self.test_refunded_step_set_user_to_step_0,
            self.test_refunded_user_access_restrictions,
            self.test_reset_user_to_step_1,
            self.test_resend_welcome_email
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
            except Exception as e:
                print(f"❌ Test {test.__name__} crashed: {str(e)}")
        
        # Summary
        print("\n" + "=" * 60)
        print("🏁 REFUNDED STEP TEST SUMMARY")
        print("=" * 60)
        
        total_checks = len(self.test_results)
        passed_checks = sum(1 for result in self.test_results if result["success"])
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        print(f"\n📊 Results: {passed_checks}/{total_checks} tests passed")
        print(f"📈 Success Rate: {(passed_checks/total_checks)*100:.1f}%")
        
        if passed_checks == total_checks:
            print("\n🎉 ALL REFUNDED STEP TESTS PASSED!")
            return True
        else:
            print(f"\n⚠️  {total_checks - passed_checks} test(s) failed")
            return False

if __name__ == "__main__":
    tester = RefundedStepTester()
    success = tester.run_refunded_step_tests()
    sys.exit(0 if success else 1)