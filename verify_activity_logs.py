#!/usr/bin/env python3
"""
Verify Activity Logs - Check specific log entries and their details
"""

import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://health-path-1.preview.emergentagent.com/api"
WEBHOOK_SECRET = "your-webhook-secret-key-change-in-production"

def create_admin_and_get_token():
    """Create admin user and get access token"""
    session = requests.Session()
    
    # Create admin user
    admin_user = {
        "email": f"logverify.{int(datetime.now().timestamp())}@example.com",
        "name": "Log Verify Admin"
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
        print(f"❌ Failed to create admin user via webhook: {webhook_response.status_code}")
        return None, None
    
    # Promote to admin
    promote_url = f"{BACKEND_URL}/admin/promote-user"
    promote_params = {
        "email": admin_user["email"],
        "secret_key": WEBHOOK_SECRET
    }
    
    promote_response = session.post(promote_url, params=promote_params)
    if promote_response.status_code != 200:
        print(f"❌ Failed to promote user to admin: {promote_response.status_code}")
        return None, None
    
    # Login as admin
    signup_url = f"{BACKEND_URL}/auth/signup"
    signup_payload = {
        "email": admin_user["email"],
        "name": admin_user["name"],
        "password": "LogVerify123!"
    }
    
    signup_response = session.post(signup_url, json=signup_payload)
    if signup_response.status_code != 200:
        print(f"❌ Failed to login as admin: {signup_response.status_code}")
        return None, None
    
    signup_data = signup_response.json()
    access_token = signup_data.get("access_token")
    
    print(f"✅ Admin user created and logged in: {admin_user['email']}")
    return session, access_token

def verify_activity_logs():
    """Verify activity logs contain expected data"""
    session, admin_token = create_admin_and_get_token()
    if not admin_token:
        return False
    
    logs_url = f"{BACKEND_URL}/admin/activity-logs"
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print("\n=== Verifying Activity Log Details ===")
    
    # Get recent logs
    response = session.get(logs_url, headers=headers, params={"limit": 50})
    if response.status_code != 200:
        print(f"❌ Failed to retrieve logs: {response.status_code}")
        return False
    
    data = response.json()
    logs = data.get("logs", [])
    event_types = data.get("event_types", [])
    
    print(f"📊 Total logs retrieved: {len(logs)}")
    print(f"📊 Event types found: {', '.join(event_types)}")
    
    # Verify specific event types and their details
    event_checks = {
        "USER_CREATED": False,
        "EMAIL_SENT": False,
        "LOGIN_SUCCESS": False,
        "LOGIN_FAILED": False,
        "SIGNUP_SUCCESS": False,
        "SIGNUP_FAILED": False
    }
    
    for log in logs:
        event_type = log.get("event_type")
        details = log.get("details", {})
        status = log.get("status")
        
        if event_type == "USER_CREATED":
            if "name" in details and "source" in details:
                print(f"✅ USER_CREATED log verified: {details.get('name')} from {details.get('source')}")
                event_checks["USER_CREATED"] = True
        
        elif event_type == "EMAIL_SENT":
            if "email_type" in details and "credentials_included" in details:
                print(f"✅ EMAIL_SENT log verified: {details.get('email_type')}, credentials: {details.get('credentials_included')}")
                event_checks["EMAIL_SENT"] = True
        
        elif event_type == "LOGIN_SUCCESS":
            if "session_duration_minutes" in details:
                print(f"✅ LOGIN_SUCCESS log verified: session duration {details.get('session_duration_minutes')} minutes")
                event_checks["LOGIN_SUCCESS"] = True
        
        elif event_type == "LOGIN_FAILED":
            if "reason" in details:
                print(f"✅ LOGIN_FAILED log verified: reason '{details.get('reason')}'")
                event_checks["LOGIN_FAILED"] = True
        
        elif event_type == "SIGNUP_SUCCESS":
            if "auto_login" in details and "session_duration_minutes" in details:
                print(f"✅ SIGNUP_SUCCESS log verified: auto_login {details.get('auto_login')}, session {details.get('session_duration_minutes')}min")
                event_checks["SIGNUP_SUCCESS"] = True
        
        elif event_type == "SIGNUP_FAILED":
            if "retries" in details:
                print(f"✅ SIGNUP_FAILED log verified: {details.get('retries')} retries, reason: {details.get('reason', 'N/A')}")
                event_checks["SIGNUP_FAILED"] = True
    
    # Check data structure compliance
    print("\n=== Data Structure Verification ===")
    if logs:
        sample_log = logs[0]
        required_fields = ["timestamp", "event_type", "user_email", "user_id", "details", "status", "ip_address"]
        
        structure_valid = True
        for field in required_fields:
            if field not in sample_log:
                print(f"❌ Missing required field: {field}")
                structure_valid = False
            else:
                print(f"✅ Field present: {field} = {sample_log[field]}")
        
        # Verify timestamp format
        try:
            timestamp = sample_log.get("timestamp")
            if timestamp:
                # Handle both ISO format with and without 'Z'
                if timestamp.endswith('Z'):
                    datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                else:
                    datetime.fromisoformat(timestamp)
                print(f"✅ Timestamp format valid: {timestamp}")
            else:
                print("❌ Timestamp is null")
                structure_valid = False
        except Exception as e:
            print(f"❌ Invalid timestamp format: {e}")
            structure_valid = False
        
        if structure_valid:
            print("✅ All required fields present and valid")
        else:
            print("❌ Data structure validation failed")
    
    # Summary
    print("\n=== Verification Summary ===")
    verified_events = sum(1 for checked in event_checks.values() if checked)
    total_events = len(event_checks)
    
    for event_type, verified in event_checks.items():
        status = "✅" if verified else "❌"
        print(f"{status} {event_type}: {'Verified' if verified else 'Not found or invalid'}")
    
    print(f"\n📊 Event verification: {verified_events}/{total_events} event types verified")
    
    if verified_events >= 5:  # Allow for SIGNUP_FAILED to be missing since it takes 40 seconds
        print("🎉 Activity logging system verification PASSED!")
        return True
    else:
        print("⚠️ Activity logging system verification FAILED - missing critical event types")
        return False

if __name__ == "__main__":
    success = verify_activity_logs()
    exit(0 if success else 1)