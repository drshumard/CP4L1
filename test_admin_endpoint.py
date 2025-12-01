#!/usr/bin/env python3
"""
Test Admin Activity Logs Endpoint - Comprehensive filtering and functionality test
"""

import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://wellness-portal-53.preview.emergentagent.com/api"
WEBHOOK_SECRET = "your-webhook-secret-key-change-in-production"

def create_admin_and_get_token():
    """Create admin user and get access token"""
    session = requests.Session()
    
    # Create admin user
    admin_user = {
        "email": f"admintest.{int(datetime.now().timestamp())}@example.com",
        "name": "Admin Test User"
    }
    
    # Create via webhook
    webhook_url = f"{BACKEND_URL}/webhook/ghl"
    webhook_payload = {
        "email": admin_user["email"],
        "name": admin_user["name"]
    }
    params = {"webhook_secret": WEBHOOK_SECRET}
    
    webhook_response = session.post(webhook_url, json=webhook_payload, params=params)
    if webhook_response.status_code != 200:
        return None, None
    
    # Promote to admin
    promote_url = f"{BACKEND_URL}/admin/promote-user"
    promote_params = {
        "email": admin_user["email"],
        "secret_key": WEBHOOK_SECRET
    }
    
    promote_response = session.post(promote_url, params=promote_params)
    if promote_response.status_code != 200:
        return None, None
    
    # Login as admin
    signup_url = f"{BACKEND_URL}/auth/signup"
    signup_payload = {
        "email": admin_user["email"],
        "name": admin_user["name"],
        "password": "AdminTest123!"
    }
    
    signup_response = session.post(signup_url, json=signup_payload)
    if signup_response.status_code != 200:
        return None, None
    
    signup_data = signup_response.json()
    access_token = signup_data.get("access_token")
    
    return session, access_token

def test_admin_endpoint():
    """Test admin activity logs endpoint comprehensively"""
    session, admin_token = create_admin_and_get_token()
    if not admin_token:
        print("❌ Failed to create admin user")
        return False
    
    logs_url = f"{BACKEND_URL}/admin/activity-logs"
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print("=== Testing Admin Activity Logs Endpoint ===")
    
    # Test 1: Basic endpoint
    print("\n1. Testing basic endpoint...")
    response = session.get(logs_url, headers=headers)
    if response.status_code != 200:
        print(f"❌ Basic endpoint failed: {response.status_code}")
        return False
    
    data = response.json()
    logs = data.get("logs", [])
    event_types = data.get("event_types", [])
    total_count = data.get("total_count", 0)
    
    print(f"✅ Basic endpoint working: {len(logs)} logs, {len(event_types)} event types, total: {total_count}")
    
    # Test 2: Event type filtering
    print("\n2. Testing event type filtering...")
    if "USER_CREATED" in event_types:
        filter_response = session.get(logs_url, headers=headers, params={"event_type": "USER_CREATED"})
        if filter_response.status_code == 200:
            filter_data = filter_response.json()
            user_created_logs = filter_data.get("logs", [])
            
            # Verify all logs are USER_CREATED
            all_correct = all(log.get("event_type") == "USER_CREATED" for log in user_created_logs)
            if all_correct:
                print(f"✅ Event type filter working: {len(user_created_logs)} USER_CREATED logs")
            else:
                print("❌ Event type filter returned incorrect logs")
                return False
        else:
            print(f"❌ Event type filter failed: {filter_response.status_code}")
            return False
    
    # Test 3: User email filtering
    print("\n3. Testing user email filtering...")
    if logs:
        test_email = logs[0].get("user_email")
        if test_email:
            email_response = session.get(logs_url, headers=headers, params={"user_email": test_email})
            if email_response.status_code == 200:
                email_data = email_response.json()
                email_logs = email_data.get("logs", [])
                
                # Verify all logs are for the correct email
                all_correct = all(log.get("user_email") == test_email for log in email_logs)
                if all_correct:
                    print(f"✅ User email filter working: {len(email_logs)} logs for {test_email}")
                else:
                    print("❌ User email filter returned incorrect logs")
                    return False
            else:
                print(f"❌ User email filter failed: {email_response.status_code}")
                return False
    
    # Test 4: Limit parameter
    print("\n4. Testing limit parameter...")
    limit_response = session.get(logs_url, headers=headers, params={"limit": 3})
    if limit_response.status_code == 200:
        limit_data = limit_response.json()
        limited_logs = limit_data.get("logs", [])
        
        if len(limited_logs) <= 3:
            print(f"✅ Limit parameter working: {len(limited_logs)} logs returned (limit: 3)")
        else:
            print(f"❌ Limit parameter not working: {len(limited_logs)} logs returned (expected ≤3)")
            return False
    else:
        print(f"❌ Limit parameter test failed: {limit_response.status_code}")
        return False
    
    # Test 5: Combined filters
    print("\n5. Testing combined filters...")
    if "LOGIN_SUCCESS" in event_types and logs:
        combined_response = session.get(logs_url, headers=headers, params={
            "event_type": "LOGIN_SUCCESS",
            "limit": 2
        })
        if combined_response.status_code == 200:
            combined_data = combined_response.json()
            combined_logs = combined_data.get("logs", [])
            
            # Verify filters work together
            correct_type = all(log.get("event_type") == "LOGIN_SUCCESS" for log in combined_logs)
            correct_limit = len(combined_logs) <= 2
            
            if correct_type and correct_limit:
                print(f"✅ Combined filters working: {len(combined_logs)} LOGIN_SUCCESS logs (limit: 2)")
            else:
                print("❌ Combined filters not working correctly")
                return False
        else:
            print(f"❌ Combined filters test failed: {combined_response.status_code}")
            return False
    
    # Test 6: Sorting (newest first)
    print("\n6. Testing sorting (newest first)...")
    if len(logs) >= 2:
        timestamps = [log.get("timestamp") for log in logs[:5]]  # Check first 5
        sorted_correctly = True
        
        for i in range(len(timestamps) - 1):
            if timestamps[i] and timestamps[i+1]:
                try:
                    ts1 = datetime.fromisoformat(timestamps[i].replace('Z', '+00:00'))
                    ts2 = datetime.fromisoformat(timestamps[i+1].replace('Z', '+00:00'))
                    if ts1 < ts2:  # Should be newest first
                        sorted_correctly = False
                        break
                except:
                    pass
        
        if sorted_correctly:
            print("✅ Logs sorted correctly (newest first)")
        else:
            print("❌ Logs not sorted correctly")
            return False
    
    # Test 7: Response structure validation
    print("\n7. Testing response structure...")
    required_response_fields = ["logs", "event_types", "total_count"]
    missing_fields = [field for field in required_response_fields if field not in data]
    
    if not missing_fields:
        print("✅ Response structure valid (logs, event_types, total_count)")
    else:
        print(f"❌ Missing response fields: {missing_fields}")
        return False
    
    # Test 8: Authorization check (without token)
    print("\n8. Testing authorization...")
    unauth_response = session.get(logs_url)  # No headers
    if unauth_response.status_code == 401:
        print("✅ Authorization working (401 without token)")
    else:
        print(f"❌ Authorization not working: {unauth_response.status_code} (expected 401)")
        return False
    
    print("\n🎉 All admin endpoint tests passed!")
    return True

if __name__ == "__main__":
    success = test_admin_endpoint()
    exit(0 if success else 1)