#!/usr/bin/env python3
"""
Step Limit Testing - Verify max step limit is 3
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BACKEND_URL = "https://wellness-portal-60.preview.emergentagent.com/api"
WEBHOOK_SECRET = "your-webhook-secret-key-change-in-production"

class StepLimitTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.access_token = None
        
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
    
    def create_test_user_and_login(self):
        """Create a test user and get access token"""
        test_user = {
            "email": f"step.limit.test.{int(datetime.now().timestamp())}@example.com",
            "name": "Step Limit Test"
        }
        
        # Create user via webhook
        webhook_url = f"{BACKEND_URL}/webhook/ghl"
        webhook_payload = {
            "email": test_user["email"],
            "name": test_user["name"]
        }
        params = {"webhook_secret": WEBHOOK_SECRET}
        
        try:
            webhook_response = self.session.post(webhook_url, json=webhook_payload, params=params)
            
            if webhook_response.status_code != 200:
                self.log_result(
                    "User Creation",
                    False,
                    f"Webhook failed: {webhook_response.status_code}"
                )
                return False
            
            # Login via signup endpoint
            signup_url = f"{BACKEND_URL}/auth/signup"
            signup_payload = {
                "email": test_user["email"],
                "name": test_user["name"],
                "password": "TestPassword123!"
            }
            
            signup_response = self.session.post(signup_url, json=signup_payload)
            
            if signup_response.status_code == 200:
                data = signup_response.json()
                self.access_token = data.get("access_token")
                self.log_result(
                    "User Creation and Login",
                    True,
                    f"Test user created and logged in: {test_user['email']}"
                )
                return True
            else:
                self.log_result(
                    "User Login",
                    False,
                    f"Login failed: {signup_response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result("User Creation", False, f"Failed: {str(e)}")
            return False
    
    def test_initial_step(self):
        """Test that user starts at step 1"""
        if not self.access_token:
            return False
            
        url = f"{BACKEND_URL}/user/me"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            response = self.session.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                current_step = data.get("current_step")
                
                if current_step == 1:
                    self.log_result(
                        "Initial Step Check",
                        True,
                        f"User correctly starts at step 1"
                    )
                    return True
                else:
                    self.log_result(
                        "Initial Step Check",
                        False,
                        f"Expected step 1, got step {current_step}"
                    )
                    return False
            else:
                self.log_result(
                    "Initial Step Check",
                    False,
                    f"Failed to get user data: {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result("Initial Step Check", False, f"Failed: {str(e)}")
            return False
    
    def test_advance_to_step_2(self):
        """Test advancing from step 1 to step 2"""
        if not self.access_token:
            return False
            
        url = f"{BACKEND_URL}/user/advance-step"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            response = self.session.post(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                current_step = data.get("current_step")
                
                if current_step == 2:
                    self.log_result(
                        "Advance to Step 2",
                        True,
                        f"Successfully advanced to step 2"
                    )
                    return True
                else:
                    self.log_result(
                        "Advance to Step 2",
                        False,
                        f"Expected step 2, got step {current_step}"
                    )
                    return False
            else:
                self.log_result(
                    "Advance to Step 2",
                    False,
                    f"Failed to advance step: {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result("Advance to Step 2", False, f"Failed: {str(e)}")
            return False
    
    def test_advance_to_step_3(self):
        """Test advancing from step 2 to step 3"""
        if not self.access_token:
            return False
            
        url = f"{BACKEND_URL}/user/advance-step"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            response = self.session.post(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                current_step = data.get("current_step")
                
                if current_step == 3:
                    self.log_result(
                        "Advance to Step 3",
                        True,
                        f"Successfully advanced to step 3 (final step)"
                    )
                    return True
                else:
                    self.log_result(
                        "Advance to Step 3",
                        False,
                        f"Expected step 3, got step {current_step}"
                    )
                    return False
            else:
                self.log_result(
                    "Advance to Step 3",
                    False,
                    f"Failed to advance step: {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result("Advance to Step 3", False, f"Failed: {str(e)}")
            return False
    
    def test_max_step_limit(self):
        """Test that step cannot advance beyond 3"""
        if not self.access_token:
            return False
            
        url = f"{BACKEND_URL}/user/advance-step"
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        try:
            response = self.session.post(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                current_step = data.get("current_step")
                
                if current_step == 3:
                    self.log_result(
                        "Max Step Limit",
                        True,
                        f"Step correctly capped at 3 (cannot advance beyond final step)"
                    )
                    return True
                else:
                    self.log_result(
                        "Max Step Limit",
                        False,
                        f"Step advanced beyond limit 3 to step {current_step}"
                    )
                    return False
            else:
                self.log_result(
                    "Max Step Limit",
                    False,
                    f"Failed to test step limit: {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_result("Max Step Limit", False, f"Failed: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all step limit tests"""
        print("🚀 Starting Step Limit Tests (Max 3 Steps)")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 50)
        
        # Run tests in sequence
        tests = [
            self.create_test_user_and_login,
            self.test_initial_step,
            self.test_advance_to_step_2,
            self.test_advance_to_step_3,
            self.test_max_step_limit
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    # If a test fails, we can't continue the sequence
                    break
            except Exception as e:
                print(f"❌ Test {test.__name__} crashed: {str(e)}")
                break
        
        # Summary
        print("\n" + "=" * 50)
        print("🏁 STEP LIMIT TEST SUMMARY")
        print("=" * 50)
        
        total_checks = len(self.test_results)
        passed_checks = sum(1 for result in self.test_results if result["success"])
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        print(f"\nOverall: {passed_checks}/{total_checks} individual checks passed")
        print(f"Test Methods: {passed}/{total} test methods completed successfully")
        
        if passed_checks == total_checks:
            print("🎉 All step limit tests passed! Max step limit of 3 is working correctly.")
            return True
        else:
            print(f"⚠️  {total_checks - passed_checks} checks failed.")
            return False

def main():
    """Main test runner"""
    tester = StepLimitTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()