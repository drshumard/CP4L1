#!/usr/bin/env python3
"""
Reset User Step - Admin utility script
Usage: python reset_user_step.py <email> [step_number]
  - email: The user's email address
  - step_number: The step to set (1, 2, or 3). Defaults to 1.

Example: python reset_user_step.py raymond@fireside360.co.uk 1
"""

import requests
import sys
import json

# Configuration
BACKEND_URL = "https://client-journey-6.preview.emergentagent.com/api"
WEBHOOK_SECRET = "your-webhook-secret-key-change-in-production"

# Admin credentials
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "test123"


def get_admin_token():
    """Login as admin and get access token"""
    print(f"🔐 Logging in as admin ({ADMIN_EMAIL})...")
    
    login_url = f"{BACKEND_URL}/auth/login"
    login_payload = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    
    response = requests.post(login_url, json=login_payload)
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        if token:
            print("✅ Admin login successful")
            return token
        else:
            print("❌ No access token in response")
            return None
    else:
        print(f"❌ Admin login failed: {response.status_code}")
        try:
            print(f"   Error: {response.json()}")
        except:
            print(f"   Response: {response.text}")
        return None


def find_user_by_email(admin_token, email):
    """Find user by email to get their ID"""
    print(f"🔍 Finding user: {email}...")
    
    users_url = f"{BACKEND_URL}/admin/users"
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    response = requests.get(users_url, headers=headers)
    
    if response.status_code == 200:
        users = response.json()
        
        # Handle both list and dict response formats
        if isinstance(users, dict):
            users = users.get("users", [])
        
        for user in users:
            if user.get("email", "").lower() == email.lower():
                print(f"✅ Found user: {user.get('name', 'N/A')} (ID: {user.get('id')})")
                print(f"   Current step: {user.get('current_step', 'N/A')}")
                return user
        
        print(f"❌ User not found with email: {email}")
        return None
    else:
        print(f"❌ Failed to get users: {response.status_code}")
        try:
            print(f"   Error: {response.json()}")
        except:
            print(f"   Response: {response.text}")
        return None


def set_user_step(admin_token, user_id, step):
    """Set user's step to the specified value"""
    print(f"🔄 Setting user step to {step}...")
    
    set_step_url = f"{BACKEND_URL}/admin/user/{user_id}/set-step"
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {"step": step}
    
    response = requests.post(set_step_url, json=payload, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ {data.get('message', 'Step updated successfully')}")
        print(f"   Old step: {data.get('old_step')}")
        print(f"   New step: {data.get('new_step')}")
        return True
    else:
        print(f"❌ Failed to set step: {response.status_code}")
        try:
            print(f"   Error: {response.json()}")
        except:
            print(f"   Response: {response.text}")
        return False


def reset_user_progress(admin_token, user_id):
    """Full reset - clears progress and intake form"""
    print(f"🗑️  Resetting user progress and intake form...")
    
    reset_url = f"{BACKEND_URL}/admin/user/{user_id}/reset"
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    response = requests.post(reset_url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ {data.get('message', 'User reset successfully')}")
        return True
    else:
        print(f"❌ Failed to reset user: {response.status_code}")
        try:
            print(f"   Error: {response.json()}")
        except:
            print(f"   Response: {response.text}")
        return False


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    email = sys.argv[1]
    step = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    full_reset = "--full" in sys.argv
    
    if step < 1 or step > 4:
        print("❌ Step must be between 1 and 4")
        sys.exit(1)
    
    print(f"\n{'='*50}")
    print(f"Reset User Step Tool")
    print(f"{'='*50}")
    print(f"Target user: {email}")
    print(f"Target step: {step}")
    print(f"Full reset: {full_reset}")
    print(f"{'='*50}\n")
    
    # Step 1: Login as admin
    admin_token = get_admin_token()
    if not admin_token:
        sys.exit(1)
    
    # Step 2: Find user
    user = find_user_by_email(admin_token, email)
    if not user:
        sys.exit(1)
    
    user_id = user.get("id")
    
    # Step 3: Reset or set step
    if full_reset:
        # Full reset clears progress and intake form
        success = reset_user_progress(admin_token, user_id)
    else:
        # Just set the step
        success = set_user_step(admin_token, user_id, step)
    
    if success:
        print(f"\n🎉 Done! User {email} is now at step {step}")
        print(f"   They can log in and continue from there.")
    else:
        print(f"\n💥 Failed to reset user")
        sys.exit(1)


if __name__ == "__main__":
    main()
