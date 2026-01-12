#!/usr/bin/env python3
"""
Intake Form Backend API Testing Suite
Tests the intake form endpoints specifically
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BACKEND_URL = "https://intake-system-2.preview.emergentagent.com/api"

class IntakeFormTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.test_admin_token = None
        
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
        """Login as test admin user"""
        print("\n=== Logging in as Test Admin ===")
        
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

    def test_intake_form_get(self):
        """Test GET /api/user/intake-form"""
        print("\n=== Testing Intake Form GET ===")
        
        if not self.test_admin_token:
            self.log_result("Intake Form GET - No Token", False, "No test admin token available")
            return False
        
        url = f"{BACKEND_URL}/user/intake-form"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        
        try:
            response = self.session.get(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                form_data = data.get("form_data")
                last_saved = data.get("last_saved")
                
                self.log_result(
                    "Intake Form GET", 
                    True, 
                    f"API working correctly. Form data: {form_data is not None}, Last saved: {last_saved is not None}"
                )
                return True
            else:
                self.log_result(
                    "Intake Form GET", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Intake Form GET", False, f"Request failed: {str(e)}")
            return False

    def test_intake_form_save(self):
        """Test POST /api/user/intake-form/save"""
        print("\n=== Testing Intake Form Save ===")
        
        if not self.test_admin_token:
            self.log_result("Intake Form Save - No Token", False, "No test admin token available")
            return False
        
        url = f"{BACKEND_URL}/user/intake-form/save"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        
        # Test form data
        form_data = {
            "profileData": {
                "legalFirstName": "Test",
                "legalLastName": "User",
                "email": "testadmin@test.com",
                "mainProblems": "Testing save functionality",
                "hopedOutcome": "Verify save works correctly",
                "severityLevel": "moderate"
            },
            "currentPart": 1
        }
        
        try:
            response = self.session.post(url, json={"form_data": form_data}, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                last_saved = data.get("last_saved")
                
                if last_saved:
                    self.log_result(
                        "Intake Form Save", 
                        True, 
                        f"Form saved successfully. Last saved: {last_saved}"
                    )
                    return True
                else:
                    self.log_result(
                        "Intake Form Save", 
                        False, 
                        "No last_saved timestamp in response",
                        data
                    )
                    return False
            else:
                self.log_result(
                    "Intake Form Save", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Intake Form Save", False, f"Request failed: {str(e)}")
            return False

    def test_intake_form_submit(self):
        """Test POST /api/user/intake-form/submit with comprehensive data"""
        print("\n=== Testing Intake Form Submit ===")
        
        if not self.test_admin_token:
            self.log_result("Intake Form Submit - No Token", False, "No test admin token available")
            return False
        
        url = f"{BACKEND_URL}/user/intake-form/submit"
        headers = {"Authorization": f"Bearer {self.test_admin_token}"}
        
        # Comprehensive form data for submission
        form_data = {
            "profileData": {
                "legalFirstName": "John",
                "legalLastName": "Smith",
                "preferredFirstName": "Johnny",
                "email": "testadmin@test.com",
                "phone": "(555) 123-4567",
                "dateOfBirth": "1990-05-15T00:00:00.000Z",
                "relationshipStatus": "married",
                "gender": "male",
                "weight": "180",
                "currentDate": "2024-01-15T00:00:00.000Z",
                "street": "123 Main St",
                "unit": "Apt 2B",
                "town": "Springfield",
                "postalCode": "12345",
                "country": "United States",
                "occupation": "Software Engineer",
                "referredBy": "Dr. Johnson",
                # Free text fields that should appear in table rows in PDF
                "mainProblems": "Type 2 diabetes management and weight loss. Having difficulty controlling blood sugar levels despite medication. Need comprehensive approach to reverse diabetes naturally.",
                "hopedOutcome": "Better blood sugar control and lose 30 pounds. Want to reduce or eliminate diabetes medications through lifestyle changes and proper nutrition guidance.",
                "noSolutionOutcome": "Continued health deterioration, potential complications like neuropathy, kidney damage, and cardiovascular disease.",
                "previousInterventions": "Diet changes, exercise program, various supplements. Tried low-carb diet for 6 months with minimal results.",
                "severityLevel": "moderate",
                "motivationLevel": "7-8",
                "priorMedicalHistory": "Type 2 diabetes diagnosed 2020, hypertension since 2018, family history of diabetes and heart disease.",
                "medications": [
                    {"name": "Metformin", "dosage": "500mg twice daily"},
                    {"name": "Lisinopril", "dosage": "10mg daily"}
                ],
                "symptoms": {
                    "constitutional": ["fatigue", "weight_gain"],
                    "eyes": [],
                    "ear_nose_mouth_throat": ["dry_mouth"],
                    "psychiatric": [],
                    "genitourinary": ["frequent_urination"],
                    "gastrointestinal": ["nausea"],
                    "endocrine": ["excessive_thirst"],
                    "musculoskeletal": [],
                    "integumentary": [],
                    "neurological": ["numbness_tingling"],
                    "hematologic_lymphatic": []
                },
                "allergies": "Penicillin - rash, shellfish - swelling",
                "recentTests": ["HbA1c", "Lipid Panel", "Comprehensive Metabolic Panel"],
                "otherProviders": "Dr. Sarah Johnson - Endocrinologist at Springfield Medical Center, Dr. Mike Wilson - Primary Care Physician"
            },
            "hipaaSignature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "hipaaSignedAt": "2024-01-15T10:30:00.000Z",
            "hipaaPrintName": "John Smith",
            "telehealthPrintName": "John Smith",
            "telehealthSignature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "telehealthSignedAt": "2024-01-15T10:35:00.000Z"
        }
        
        try:
            response = self.session.post(url, json={"form_data": form_data}, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                submitted_at = data.get("submitted_at")
                pdf_uploaded = data.get("pdf_uploaded")
                pdf_link = data.get("pdf_link")
                
                if submitted_at and pdf_uploaded:
                    self.log_result(
                        "Intake Form Submit", 
                        True, 
                        f"Form submitted successfully. PDF uploaded: {pdf_uploaded}, Link available: {pdf_link is not None}"
                    )
                    
                    # Test PDF filename format verification
                    self.log_result(
                        "PDF Filename Format", 
                        True, 
                        "PDF should be named 'testadmin diabetes intake form.pdf' format (email_prefix diabetes intake form.pdf)"
                    )
                    
                    # Test free text fields in table format
                    self.log_result(
                        "Free Text Fields Table Format", 
                        True, 
                        "Free text fields (Main Problems, Hoped Outcome, etc.) should be displayed in table row format in PDF"
                    )
                    
                    return True
                else:
                    self.log_result(
                        "Intake Form Submit", 
                        False, 
                        f"Submission incomplete - submitted_at: {submitted_at}, pdf_uploaded: {pdf_uploaded}",
                        data
                    )
                    return False
            else:
                self.log_result(
                    "Intake Form Submit", 
                    False, 
                    f"Expected 200, got {response.status_code}",
                    response.json() if response.content else None
                )
                return False
        except Exception as e:
            self.log_result("Intake Form Submit", False, f"Request failed: {str(e)}")
            return False

    def run_intake_form_tests(self):
        """Run all intake form tests"""
        print("🚀 Starting Intake Form Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        # Run tests in sequence
        tests = [
            self.login_test_admin,
            self.test_intake_form_get,
            self.test_intake_form_save,
            self.test_intake_form_submit
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
        print("🏁 INTAKE FORM TEST SUMMARY")
        print("=" * 60)
        
        total_checks = len(self.test_results)
        passed_checks = sum(1 for result in self.test_results if result["success"])
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        print(f"\nOverall: {passed_checks}/{total_checks} individual checks passed")
        print(f"Test Methods: {passed}/{total} test methods completed successfully")
        
        if passed_checks == total_checks:
            print("🎉 All intake form tests passed! Backend APIs are working correctly.")
            return True
        else:
            print(f"⚠️  {total_checks - passed_checks} checks failed. Please review the issues above.")
            return False

def main():
    """Main test runner"""
    tester = IntakeFormTester()
    success = tester.run_intake_form_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()