from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import secrets
import resend
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Resend Configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')

# Webhook Secret
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')

# Turnstile Secret Key (for server-side validation)
TURNSTILE_SECRET_KEY = os.environ.get('TURNSTILE_SECRET_KEY', '')

# Zapier Webhook URL for support requests
ZAPIER_SUPPORT_WEBHOOK = os.environ.get('ZAPIER_SUPPORT_WEBHOOK', 'https://hooks.zapier.com/hooks/catch/1815480/uf7u8ms/')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Activity Logging Utility
async def log_activity(
    event_type: str,
    user_email: str = None,
    user_id: str = None,
    details: dict = None,
    status: str = "success",
    ip_address: str = None,
    user_agent: str = None
):
    """Log backend activity to MongoDB with device info and geolocation"""
    import httpx
    
    try:
        # Parse user agent for device info
        device_info = {}
        if user_agent:
            ua_lower = user_agent.lower()
            
            # Detect device type
            if 'mobile' in ua_lower or 'android' in ua_lower or 'iphone' in ua_lower or 'ipad' in ua_lower:
                if 'ipad' in ua_lower or 'tablet' in ua_lower:
                    device_info['device_type'] = 'tablet'
                else:
                    device_info['device_type'] = 'mobile'
            else:
                device_info['device_type'] = 'desktop'
            
            # Detect OS
            if 'windows' in ua_lower:
                device_info['os'] = 'Windows'
            elif 'mac os' in ua_lower or 'macos' in ua_lower:
                device_info['os'] = 'macOS'
            elif 'iphone' in ua_lower or 'ipad' in ua_lower:
                device_info['os'] = 'iOS'
            elif 'android' in ua_lower:
                device_info['os'] = 'Android'
            elif 'linux' in ua_lower:
                device_info['os'] = 'Linux'
            else:
                device_info['os'] = 'Unknown'
            
            # Detect browser
            if 'chrome' in ua_lower and 'edg' not in ua_lower:
                device_info['browser'] = 'Chrome'
            elif 'safari' in ua_lower and 'chrome' not in ua_lower:
                device_info['browser'] = 'Safari'
            elif 'firefox' in ua_lower:
                device_info['browser'] = 'Firefox'
            elif 'edg' in ua_lower:
                device_info['browser'] = 'Edge'
            else:
                device_info['browser'] = 'Other'
            
            device_info['user_agent'] = user_agent[:500]  # Truncate if too long
        
        # Get location from IP using ipapi.co
        location_info = {}
        if ip_address and ip_address not in ['127.0.0.1', 'localhost', '::1']:
            location_info['ip_address'] = ip_address
            
            # Skip internal IPs
            if not ip_address.startswith('10.') and not ip_address.startswith('192.168.') and not ip_address.startswith('172.'):
                try:
                    async with httpx.AsyncClient(timeout=3.0) as http_client:
                        response = await http_client.get(f"https://ipapi.co/{ip_address}/json/")
                        if response.status_code == 200:
                            geo_data = response.json()
                            location_info['city'] = geo_data.get('city', '')
                            location_info['region'] = geo_data.get('region', '')
                            location_info['country'] = geo_data.get('country_name', '')
                            location_info['country_code'] = geo_data.get('country_code', '')
                            location_info['timezone'] = geo_data.get('timezone', '')
                            location_info['latitude'] = geo_data.get('latitude')
                            location_info['longitude'] = geo_data.get('longitude')
                except Exception as e:
                    logging.warning(f"Geolocation lookup failed for {ip_address}: {str(e)}")
        
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "user_email": user_email,
            "user_id": user_id,
            "details": details or {},
            "status": status,
            "ip_address": ip_address,
            "device_info": device_info,
            "location_info": location_info
        }
        
        await db.activity_logs.insert_one(log_entry)
        logging.debug(f"Activity logged: {event_type} for {user_email}")
        
    except Exception as e:
        logging.error(f"Failed to log activity {event_type}: {str(e)}")

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    password_hash: str
    current_step: int = 1
    role: str = "user"  # user or admin
    reset_token: Optional[str] = None
    reset_token_expires: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserProgress(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    step_number: int
    tasks_completed: List[str] = []
    completed_at: Optional[datetime] = None

# Request/Response Schemas
class SignupRequest(BaseModel):
    email: EmailStr
    name: str
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: Optional[str] = None
    email: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    current_step: int
    role: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class TaskCompleteRequest(BaseModel):
    task_id: str

class GHLWebhookData(BaseModel):
    email: EmailStr
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None

class AppointmentWebhookData(BaseModel):
    booking_id: str
    session_date: str  # UTC format: 2025-12-24T00:30:00Z
    first_name: str
    last_name: str
    email: EmailStr
    mobile_phone: Optional[str] = None

class AppointmentCancellationData(BaseModel):
    booking_id: str

class AppointmentResponse(BaseModel):
    booking_id: str
    session_date: str
    first_name: str
    last_name: str
    email: str
    mobile_phone: Optional[str] = None
    created_at: str

# Helper Functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def create_auto_login_token(user_id: str, email: str) -> str:
    """Create a one-time auto-login token valid for 7 days"""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    # Store token in database
    await db.auto_login_tokens.insert_one({
        "token": token,
        "user_id": user_id,
        "email": email,
        "expires_at": expires_at.isoformat(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return token

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise credentials_exception
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this resource"
        )
    return current_user

# Routes
@api_router.post("/webhook/ghl")
async def ghl_webhook(data: GHLWebhookData, webhook_secret: str = None):
    """Receive webhook from GHL after purchase - Protected by webhook secret"""
    
    # Validate webhook secret
    if not WEBHOOK_SECRET or webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret"
        )
    
    # Normalize email to lowercase
    email_lower = data.email.lower()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email_lower}, {"_id": 0})
    if existing_user:
        return {"message": "User already exists", "user_id": existing_user["id"]}
    
    # Build full name from first_name + last_name if provided, otherwise use name field
    if data.first_name and data.last_name:
        full_name = f"{data.first_name} {data.last_name}"
    else:
        full_name = data.name
    
    # Generate memorable password using random word combinations
    import random
    
    # Word lists for memorable passwords
    adjectives = [
        "Swift", "Bright", "Golden", "Silver", "Crystal", "Cosmic", "Solar", "Lunar",
        "Velvet", "Royal", "Noble", "Brave", "Clever", "Mighty", "Happy", "Lucky",
        "Gentle", "Bold", "Calm", "Wise", "Cool", "Fresh", "Warm", "Wild"
    ]
    
    nouns = [
        "Tiger", "Eagle", "Wolf", "Phoenix", "Dragon", "Falcon", "Lion", "Bear",
        "Dolphin", "Panther", "Hawk", "Raven", "Fox", "Owl", "Cobra", "Shark"
    ]
    
    elements = [
        "Carbon", "Helium", "Neon", "Argon", "Copper", "Silver", "Gold", "Iron",
        "Cobalt", "Nickel", "Zinc", "Titanium", "Platinum", "Mercury", "Radium", "Xenon"
    ]
    
    foods = [
        "Apple", "Mango", "Lemon", "Berry", "Peach", "Grape", "Melon", "Cherry",
        "Orange", "Banana", "Coconut", "Kiwi", "Plum", "Fig", "Lime", "Pear"
    ]
    
    # Choose password pattern randomly
    pattern = random.choice([1, 2, 3, 4])
    number = random.randint(10, 99)
    
    if pattern == 1:
        # Adjective + Number + Noun (e.g., Swift42Tiger)
        generated_password = random.choice(adjectives) + str(number) + random.choice(nouns)
    elif pattern == 2:
        # Element + Number + Food (e.g., Gold55Apple)
        generated_password = random.choice(elements) + str(number) + random.choice(foods)
    elif pattern == 3:
        # Food + Number + Noun (e.g., Mango23Eagle)
        generated_password = random.choice(foods) + str(number) + random.choice(nouns)
    else:
        # Adjective + Number + Element (e.g., Cosmic88Neon)
        generated_password = random.choice(adjectives) + str(number) + random.choice(elements)
    
    # Hash password
    hashed_password = get_password_hash(generated_password)
    
    # Create new user with generated password (email stored lowercase)
    user = User(
        email=email_lower,
        name=full_name,
        password_hash=hashed_password
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    # Store first_name and last_name separately if provided
    if data.first_name:
        user_dict['first_name'] = data.first_name
    if data.last_name:
        user_dict['last_name'] = data.last_name
    # Store phone if provided
    if data.phone:
        user_dict['phone'] = data.phone
    
    await db.users.insert_one(user_dict)
    
    # Log user creation
    await log_activity(
        event_type="USER_CREATED",
        user_email=data.email,
        user_id=user.id,
        details={"name": full_name, "first_name": data.first_name, "last_name": data.last_name, "phone": data.phone, "source": "ghl_webhook"},
        status="success"
    )
    
    # Generate auto-login token (valid for 7 days)
    auto_login_token = await create_auto_login_token(user.id, data.email)
    
    # Send welcome email immediately with credentials
    frontend_url = os.environ.get('FRONTEND_URL', 'https://portal.drshumard.com')
    # URL-encode email to handle special characters like + signs
    encoded_email = quote(data.email, safe='')
    encoded_name = quote(data.name, safe='')
    signup_url = f"{frontend_url}/signup?email={encoded_email}&name={encoded_name}"
    auto_login_url = f"{frontend_url}/auto-login/{auto_login_token}"
    
    try:
        resend.Emails.send({
            "from": "Dr. Shumard Portal <admin@portal.drshumard.com>",
            "to": data.email,
            "subject": "Welcome to Your Diabetes Reversal Journey",
            "html": f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to Dr. Shumard's Portal</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <tr>
                        <td>
                            <!-- Header -->
                            <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                                Welcome to Dr. Shumard's Portal
                            </h1>
                            
                            <!-- Greeting -->
                            <p style="font-size: 18px; margin: 20px 0;">
                                Hello {data.name},
                            </p>
                            
                            <!-- Main Message -->
                            <p style="margin: 20px 0;">
                                Thank you for joining us. Your account has been created and you can now access your wellness portal.
                            </p>
                            
                            <!-- Credentials Box -->
                            <table width="100%" cellpadding="15" cellspacing="0" border="1" style="border-color: #000000; border-collapse: collapse; margin: 25px 0;">
                                <tr>
                                    <td colspan="2" style="background-color: #f5f5f5; font-weight: bold; font-size: 18px;">
                                        Your Login Information
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-weight: bold; width: 120px;">Email:</td>
                                    <td style="font-size: 16px;">{email_lower}</td>
                                </tr>
                                <tr>
                                    <td style="font-weight: bold;">Password:</td>
                                    <td style="font-family: Courier, monospace; font-size: 18px; font-weight: bold; letter-spacing: 1px;">{generated_password}</td>
                                </tr>
                            </table>
                            
                            <!-- Important Note -->
                            <p style="margin: 25px 0; padding: 15px; border: 2px solid #000000; background-color: #fffde7;">
                                <strong>IMPORTANT:</strong> Please save your password in a safe place. You will need it to log into your portal.
                            </p>
                            
                            <!-- Login Button -->
                            <p style="margin: 30px 0; text-align: center;">
                                <a href="{frontend_url}/login" 
                                   style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                                    LOG IN TO YOUR PORTAL
                                </a>
                            </p>
                            
                            <!-- Alternative Link -->
                            <p style="margin: 20px 0; font-size: 14px;">
                                If the button above doesn't work, copy and paste this link into your browser:<br>
                                <span style="word-break: break-all;">{frontend_url}/login</span>
                            </p>
                            
                            <!-- What's Next -->
                            <h2 style="font-size: 18px; color: #000000; margin: 30px 0 15px 0; border-bottom: 1px solid #cccccc; padding-bottom: 10px;">
                                What to Do Next
                            </h2>
                            <ol style="margin: 15px 0; padding-left: 25px;">
                                <li style="margin: 10px 0;"><strong>Step 1:</strong> Book your initial consultation</li>
                                <li style="margin: 10px 0;"><strong>Step 2:</strong> Complete your health profile form</li>
                                <li style="margin: 10px 0;"><strong>Step 3:</strong> Review final preparations for your appointment</li>
                            </ol>
                            
                            <!-- Need Help -->
                            <p style="margin: 30px 0; padding: 15px; background-color: #f5f5f5;">
                                <strong>Need Help?</strong><br>
                                If you have any questions or need assistance, please reply to this email or contact our support team.
                            </p>
                            
                            <!-- Footer -->
                            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                                Best regards,<br>
                                <strong>Dr. Shumard's Team</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """
        })
        logging.info(f"Welcome email with credentials sent to {data.email}")
        await log_activity(
            event_type="EMAIL_SENT",
            user_email=data.email,
            user_id=user.id,
            details={"email_type": "welcome_email", "credentials_included": True},
            status="success"
        )
    except Exception as e:
        logging.error(f"Failed to send welcome email: {e}")
        await log_activity(
            event_type="EMAIL_FAILED",
            user_email=data.email,
            user_id=user.id,
            details={"email_type": "welcome_email", "error": str(e)},
            status="failure"
        )
        # Continue even if email fails - user account still created
    
    return {
        "message": "User created and welcome email sent", 
        "user_id": user.id,
        "signup_url": signup_url
    }

@api_router.post("/webhook/appointment")
async def appointment_webhook(data: AppointmentWebhookData, webhook_secret: str = None):
    """Receive appointment booking webhook from GHL - Protected by webhook secret"""
    
    # Validate webhook secret
    if not WEBHOOK_SECRET or webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret"
        )
    
    # Normalize email to lowercase
    email_lower = data.email.lower()
    
    # Check if user exists with this email
    user = await db.users.find_one({"email": email_lower}, {"_id": 0})
    matched_by = "email" if user else None
    
    # If no user found by email, try to match by first_name + last_name + phone
    if not user and data.mobile_phone:
        # Normalize phone number for comparison (remove spaces, dashes, etc.)
        normalized_phone = ''.join(filter(str.isdigit, data.mobile_phone))
        
        # Find users and check for matching name + phone
        async for potential_user in db.users.find({}, {"_id": 0}):
            user_phone = potential_user.get("phone", "")
            normalized_user_phone = ''.join(filter(str.isdigit, user_phone)) if user_phone else ""
            
            user_first = potential_user.get("first_name", "").lower().strip()
            user_last = potential_user.get("last_name", "").lower().strip()
            
            # Check exact match on first_name, last_name, and phone
            if (user_first == data.first_name.lower().strip() and 
                user_last == data.last_name.lower().strip() and
                normalized_user_phone and normalized_phone and
                normalized_user_phone == normalized_phone):
                user = potential_user
                matched_by = "name_phone"
                
                # Store appointment email as secondary_email for this user
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {"secondary_email": data.email}}
                )
                
                # Log the secondary email addition
                await log_activity(
                    event_type="SECONDARY_EMAIL_ADDED",
                    user_email=user["email"],
                    user_id=user["id"],
                    details={
                        "secondary_email": data.email,
                        "matched_by": "first_name + last_name + phone",
                        "booking_id": data.booking_id
                    },
                    status="success"
                )
                break
    
    # If still no user found, log to admin
    if not user:
        await log_activity(
            event_type="APPOINTMENT_NO_USER_MATCH",
            user_email=data.email,
            details={
                "booking_id": data.booking_id,
                "session_date": data.session_date,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "mobile_phone": data.mobile_phone,
                "message": "Appointment received but no matching user found by email or name+phone"
            },
            status="warning"
        )
    
    # Store appointment data
    appointment_data = {
        "booking_id": data.booking_id,
        "session_date": data.session_date,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "email": data.email,
        "mobile_phone": data.mobile_phone,
        "user_id": user["id"] if user else None,
        "matched_by": matched_by,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if appointment with this booking_id already exists
    existing_appointment = await db.appointments.find_one({"booking_id": data.booking_id})
    if existing_appointment:
        # Update existing appointment
        await db.appointments.update_one(
            {"booking_id": data.booking_id},
            {"$set": appointment_data}
        )
        action = "updated"
    else:
        # Insert new appointment
        await db.appointments.insert_one(appointment_data)
        action = "created"
    
    # AUTO-ADVANCE USER TO STEP 2 if user found and they're on step 1
    step_advanced = False
    if user and user.get("current_step", 1) == 1:
        # Mark booking task as complete in user_progress collection
        await db.user_progress.update_one(
            {"user_id": user["id"], "step_number": 1},
            {
                "$set": {"completed_at": datetime.now(timezone.utc).isoformat()},
                "$addToSet": {"tasks_completed": "book_consultation"}
            },
            upsert=True
        )
        
        # Advance to step 2 in users collection
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"current_step": 2}}
        )
        step_advanced = True
        
        # Send webhook to LeadConnector for Step 1 completion
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://services.leadconnectorhq.com/hooks/ygLPhGfHB5mDOoTJ86um/webhook-trigger/64b3e792-3c1e-4887-b8e3-efa79c58a704",
                    json={"email": user["email"], "step": 1},
                    timeout=10.0
                )
        except Exception as e:
            print(f"Failed to send step completion webhook: {e}")
        
        await log_activity(
            event_type="STEP_ADVANCED_VIA_WEBHOOK",
            user_email=user["email"],
            user_id=user["id"],
            details={
                "from_step": 1,
                "to_step": 2,
                "booking_id": data.booking_id,
                "trigger": "appointment_webhook"
            },
            status="success"
        )
    
    # Log appointment creation/update
    await log_activity(
        event_type="APPOINTMENT_BOOKED",
        user_email=data.email,
        user_id=user["id"] if user else None,
        details={
            "booking_id": data.booking_id,
            "session_date": data.session_date,
            "action": action,
            "matched_by": matched_by,
            "step_advanced": step_advanced
        },
        status="success"
    )
    
    return {
        "message": f"Appointment {action} successfully",
        "booking_id": data.booking_id,
        "user_found": user is not None,
        "matched_by": matched_by,
        "step_advanced": step_advanced
    }

@api_router.post("/webhook/appointment/cancel")
async def cancel_appointment_webhook(data: AppointmentCancellationData, webhook_secret: str = None):
    """Receive appointment cancellation webhook from GHL - Protected by webhook secret"""
    
    # Validate webhook secret
    if not WEBHOOK_SECRET or webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret"
        )
    
    # Find the appointment
    appointment = await db.appointments.find_one({"booking_id": data.booking_id}, {"_id": 0})
    
    if not appointment:
        # Log the cancellation attempt for non-existent appointment
        await log_activity(
            event_type="APPOINTMENT_CANCEL_NOT_FOUND",
            details={
                "booking_id": data.booking_id,
                "message": "Cancellation received but no matching appointment found"
            },
            status="warning"
        )
        return {
            "message": "Appointment not found",
            "booking_id": data.booking_id,
            "cancelled": False
        }
    
    # Delete the appointment
    await db.appointments.delete_one({"booking_id": data.booking_id})
    
    # Log the cancellation
    await log_activity(
        event_type="APPOINTMENT_CANCELLED",
        user_email=appointment.get("email"),
        user_id=appointment.get("user_id"),
        details={
            "booking_id": data.booking_id,
            "session_date": appointment.get("session_date"),
            "first_name": appointment.get("first_name"),
            "last_name": appointment.get("last_name")
        },
        status="success"
    )
    
    return {
        "message": "Appointment cancelled successfully",
        "booking_id": data.booking_id,
        "cancelled": True
    }

@api_router.get("/user/appointment")
async def get_user_appointment(current_user: dict = Depends(get_current_user)):
    """Get appointment details for the current user"""
    
    # Get user data to check for booking_info and secondary_email
    user_data = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    # First try to find appointment by user_id in appointments collection
    appointment = await db.appointments.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0}
    )
    
    # If not found, try to find by primary email
    if not appointment:
        appointment = await db.appointments.find_one(
            {"email": current_user["email"]},
            {"_id": 0}
        )
        
        # If found by email, update appointment with user_id for future lookups
        if appointment:
            await db.appointments.update_one(
                {"email": current_user["email"]},
                {"$set": {"user_id": current_user["id"]}}
            )
    
    # If still not found, check if user has secondary_email and search by that
    if not appointment:
        secondary_email = user_data.get("secondary_email") if user_data else None
        
        if secondary_email:
            appointment = await db.appointments.find_one(
                {"email": secondary_email},
                {"_id": 0}
            )
            
            # If found by secondary_email, update appointment with user_id
            if appointment:
                await db.appointments.update_one(
                    {"email": secondary_email},
                    {"$set": {"user_id": current_user["id"]}}
                )
    
    # If no appointment found in appointments collection, check booking_info on user
    if not appointment and user_data and user_data.get("booking_info"):
        booking_info = user_data["booking_info"]
        # Convert booking_info to appointment format for consistency
        appointment = {
            "session_date": booking_info.get("session_start") or booking_info.get("booking_datetime"),
            "first_name": user_data.get("first_name", ""),
            "last_name": user_data.get("last_name", ""),
            "email": user_data.get("email"),
            "mobile_phone": user_data.get("phone"),
            "user_id": current_user["id"],
            "source": booking_info.get("source", "booking_info"),
            "timezone": booking_info.get("timezone") or booking_info.get("booking_timezone")
        }
    
    # If we have both appointment from collection AND booking_info, prefer the most recent one
    if appointment and user_data and user_data.get("booking_info"):
        booking_info = user_data["booking_info"]
        booking_date_str = booking_info.get("session_start") or booking_info.get("booking_datetime")
        appt_date_str = appointment.get("session_date")
        
        if booking_date_str and appt_date_str:
            try:
                booking_date = datetime.fromisoformat(booking_date_str.replace('Z', '+00:00'))
                appt_date = datetime.fromisoformat(appt_date_str.replace('Z', '+00:00'))
                
                # If booking_info has a more recent date, use that instead
                # This handles cases where admin updated the booking
                if booking_info.get("updated_at"):
                    updated_at = datetime.fromisoformat(booking_info["updated_at"].replace('Z', '+00:00'))
                    appt_created = appointment.get("created_at")
                    if appt_created:
                        appt_created_dt = datetime.fromisoformat(appt_created.replace('Z', '+00:00'))
                        if updated_at > appt_created_dt:
                            # Admin update is more recent, use booking_info
                            appointment = {
                                "session_date": booking_date_str,
                                "first_name": user_data.get("first_name", ""),
                                "last_name": user_data.get("last_name", ""),
                                "email": user_data.get("email"),
                                "mobile_phone": user_data.get("phone"),
                                "user_id": current_user["id"],
                                "source": booking_info.get("source", "booking_info"),
                                "timezone": booking_info.get("timezone") or booking_info.get("booking_timezone"),
                                "updated_by": booking_info.get("updated_by"),
                                "update_notes": booking_info.get("update_notes")
                            }
            except (ValueError, TypeError):
                pass  # Keep the appointment from collection if date parsing fails
    
    if not appointment:
        return {"appointment": None}
    
    return {"appointment": appointment}

@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    """Auto-login user (password already sent via webhook)"""
    import asyncio
    
    # Normalize email to lowercase
    email_lower = request.email.lower()
    
    # Initial wait: 10 seconds to give webhook time to process
    logging.info(f"Signup request for {email_lower}. Waiting 10 seconds for webhook processing...")
    await asyncio.sleep(10)
    
    # Retry logic: Check for user with 5-second intervals for up to 30 seconds (6 retries)
    max_retries = 6
    retry_delay = 5
    user = None
    
    for attempt in range(max_retries + 1):
        user = await db.users.find_one({"email": email_lower}, {"_id": 0})
        
        if user:
            logging.info(f"User {email_lower} found after {attempt} retries")
            break
        
        if attempt < max_retries:
            logging.info(f"User {email_lower} not found yet. Retry {attempt + 1}/{max_retries} in {retry_delay} seconds...")
            await asyncio.sleep(retry_delay)
    
    # After all retries, if still no user, raise error
    if not user:
        logging.error(f"User {email_lower} not found after {max_retries} retries (total wait: {10 + (max_retries * retry_delay)} seconds)")
        await log_activity(
            event_type="SIGNUP_FAILED",
            user_email=email_lower,
            details={"reason": "user_not_found", "retries": max_retries},
            status="failure"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found. Please complete purchase first."
        )
    
    if not user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not properly initialized. Please contact support."
        )
    
    # Check if user was in "refunded" state (step 0)
    # If so, reset them to step 1 and send notification email
    was_refunded = user.get("current_step", 1) == 0
    
    if was_refunded:
        # Reset user to step 1
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"current_step": 1}}
        )
        # Note: user_progress tracks step completion, not current_step
        # The current_step is only on the users collection
        
        # Send notification email to admin
        try:
            notification_email = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "drjason@drshumard.com")
            resend.Emails.send({
                "from": "Dr. Shumard's Office <noreply@email.drshumard.com>",
                "to": notification_email,
                "subject": f"🔔 Refunded User Re-entered Portal: {user['email']}",
                "html": f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #333;">Refunded User Re-entered Portal</h2>
                        <p>A previously refunded user has re-entered the portal onboarding:</p>
                        <ul style="line-height: 1.8;">
                            <li><strong>Name:</strong> {user.get('name', 'N/A')}</li>
                            <li><strong>Email:</strong> {user['email']}</li>
                            <li><strong>Phone:</strong> {user.get('phone', 'N/A')}</li>
                            <li><strong>Time:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</li>
                        </ul>
                        <p style="color: #666;">Please check if they have repurchased before their consultation.</p>
                    </div>
                """
            })
            logging.info(f"Sent refunded user re-entry notification for {email_lower}")
        except Exception as e:
            logging.error(f"Failed to send refunded user notification: {e}")
        
        # Log the re-entry
        await log_activity(
            event_type="REFUNDED_USER_REENTERED",
            user_email=user["email"],
            user_id=user["id"],
            details={
                "previous_step": 0,
                "new_step": 1,
                "notification_sent": True
            },
            status="success"
        )
    
    # User already has password (set via webhook), just login them
    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    
    # Log successful signup/auto-login
    await log_activity(
        event_type="SIGNUP_SUCCESS",
        user_email=user["email"],
        user_id=user["id"],
        details={
            "auto_login": True, 
            "session_duration_minutes": ACCESS_TOKEN_EXPIRE_MINUTES,
            "was_refunded": was_refunded
        },
        status="success"
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest, req: Request):
    # Get client info
    ip_address = req.headers.get("X-Forwarded-For", req.client.host if req.client else None)
    if ip_address and "," in ip_address:
        ip_address = ip_address.split(",")[0].strip()
    user_agent = req.headers.get("User-Agent", "")
    
    # Normalize email to lowercase for case-insensitive lookup
    email_lower = request.email.lower()
    user = await db.users.find_one({"email": email_lower}, {"_id": 0})
    
    if not user or not user.get("password_hash"):
        await log_activity(
            event_type="LOGIN_FAILED",
            user_email=request.email,
            details={"reason": "user_not_found_or_no_password"},
            status="failure",
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not verify_password(request.password, user["password_hash"]):
        await log_activity(
            event_type="LOGIN_FAILED",
            user_email=request.email,
            user_id=user["id"],
            details={"reason": "incorrect_password"},
            status="failure",
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    
    # SELF-HEALING: Check if user is stuck on Step 1 but has a booking
    # This fixes users who booked but weren't advanced due to webhook issues
    if user.get("current_step", 1) == 1:
        # Check if they have an appointment or booking_info
        has_booking = False
        
        # Check appointments collection
        appointment = await db.appointments.find_one({
            "$or": [
                {"user_id": user["id"]},
                {"email": email_lower}
            ]
        })
        if appointment:
            has_booking = True
        
        # Check booking_info on user record
        if not has_booking and user.get("booking_info"):
            booking_info = user.get("booking_info")
            # Only count if it has a valid session time
            if booking_info.get("session_start") or booking_info.get("booking_datetime"):
                has_booking = True
        
        if has_booking:
            # Auto-advance to step 2
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"current_step": 2}}
            )
            await db.user_progress.update_one(
                {"user_id": user["id"], "step_number": 1},
                {
                    "$set": {"completed_at": datetime.now(timezone.utc).isoformat()},
                    "$addToSet": {"tasks_completed": "book_consultation"}
                },
                upsert=True
            )
            await log_activity(
                event_type="STEP_AUTO_CORRECTED",
                user_email=user["email"],
                user_id=user["id"],
                details={
                    "from_step": 1,
                    "to_step": 2,
                    "reason": "user_has_booking_but_stuck_on_step_1",
                    "trigger": "login_self_healing"
                },
                status="success",
                ip_address=ip_address,
                user_agent=user_agent
            )
    
    # Log successful login
    await log_activity(
        event_type="LOGIN_SUCCESS",
        user_email=user["email"],
        user_id=user["id"],
        details={"session_duration_minutes": ACCESS_TOKEN_EXPIRE_MINUTES},
        status="success",
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user["id"]
    )

@api_router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(refresh_token: str):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user_id = payload.get("sub")
        access_token = create_access_token(
            data={"sub": user_id},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        new_refresh_token = create_refresh_token(data={"sub": user_id})
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.get("/auth/auto-login/{token}", response_model=TokenResponse)
async def auto_login(token: str):
    """Auto-login user using a one-time token from email"""
    # Find the token
    token_doc = await db.auto_login_tokens.find_one({"token": token}, {"_id": 0})
    
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid or expired login link")
    
    # Check if token is expired
    expires_at = datetime.fromisoformat(token_doc["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=401, detail="Login link has expired. Please use your email and password to login.")
    
    # Check if already used (optional - can allow multiple uses within validity period)
    # if token_doc.get("used"):
    #     raise HTTPException(status_code=401, detail="Login link has already been used")
    
    # Find the user
    user = await db.users.find_one({"id": token_doc["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Mark token as used (optional)
    await db.auto_login_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Generate access tokens
    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    
    # Log auto-login
    await log_activity(
        event_type="AUTO_LOGIN_SUCCESS",
        user_email=user["email"],
        user_id=user["id"],
        details={"method": "email_link"},
        status="success"
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )

@api_router.post("/auth/request-reset")
async def request_password_reset(request: PasswordResetRequest):
    # Normalize email to lowercase
    email_lower = request.email.lower()
    user = await db.users.find_one({"email": email_lower}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        await db.users.update_one(
            {"email": email_lower},
            {"$set": {
                "reset_token": reset_token,
                "reset_token_expires": expires_at.isoformat()
            }}
        )
        
        # Send email with Resend
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        
        try:
            resend.Emails.send({
                "from": "Dr. Shumard Portal <noreply@portal.drshumard.com>",
                "to": request.email,
                "subject": "Password Reset Request",
                "html": f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%);">
                    <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);">
                        <div style="background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Password Reset Request</h1>
                        </div>
                        <div style="padding: 40px 30px;">
                            <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
                                You requested to reset your password for your wellness portal account. Click the button below to create a new password:
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{reset_url}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);">Reset Password</a>
                            </div>
                            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 24px 0; color: #92400e; font-size: 14px;">
                                <strong>⚠️ Important:</strong> This link will expire in 1 hour for security reasons.
                            </div>
                            <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                            </p>
                        </div>
                        <div style="background: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px;">
                            <p style="margin: 0 0 8px 0;">Dr. Jason Shumard Wellness Portal</p>
                            <p style="margin: 0;">If you have any questions, our support team is here to help.</p>
                        </div>
                    </div>
                </body>
                </html>
                """
            })
        except Exception as e:
            logging.error(f"Failed to send reset email: {e}")
    
    return {"message": "If the email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    user = await db.users.find_one({"reset_token": request.token}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check expiration
    expires_at = datetime.fromisoformat(user["reset_token_expires"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Update password and clear reset token
    hashed_password = get_password_hash(request.new_password)
    await db.users.update_one(
        {"reset_token": request.token},
        {"$set": {
            "password_hash": hashed_password,
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Password reset successful"}

@api_router.get("/user/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        first_name=current_user.get("first_name"),
        last_name=current_user.get("last_name"),
        phone=current_user.get("phone"),
        current_step=current_user["current_step"],
        role=current_user.get("role", "user")  # Default to 'user' if role not present
    )

@api_router.get("/user/progress")
async def get_user_progress(current_user: dict = Depends(get_current_user)):
    progress = await db.user_progress.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    return {
        "current_step": current_user["current_step"], 
        "progress": progress,
        "pb_client_record_id": current_user.get("pb_client_record_id")
    }


class PBClientRecordRequest(BaseModel):
    client_record_id: str


@api_router.post("/user/save-pb-client")
async def save_pb_client_record(request: PBClientRecordRequest, current_user: dict = Depends(get_current_user)):
    """Save the Practice Better client record ID to the user's database record.
    This persists the ID so it survives browser refreshes and device changes."""
    
    # Update user document with the PB client record ID
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"pb_client_record_id": request.client_record_id}}
    )
    
    return {"message": "Practice Better client ID saved", "client_record_id": request.client_record_id}

@api_router.post("/user/complete-task")
async def complete_task(request: TaskCompleteRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    current_step = current_user["current_step"]
    
    # Get or create progress for current step
    progress = await db.user_progress.find_one(
        {"user_id": user_id, "step_number": current_step},
        {"_id": 0}
    )
    
    if not progress:
        progress = UserProgress(
            user_id=user_id,
            step_number=current_step,
            tasks_completed=[request.task_id]
        )
        progress_dict = progress.model_dump()
        await db.user_progress.insert_one(progress_dict)
    else:
        # Add task if not already completed
        if request.task_id not in progress["tasks_completed"]:
            await db.user_progress.update_one(
                {"user_id": user_id, "step_number": current_step},
                {"$push": {"tasks_completed": request.task_id}}
            )
    
    return {"message": "Task completed"}

@api_router.post("/user/advance-step")
async def advance_step(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    current_step = current_user["current_step"]
    user_email = current_user["email"]
    
    # Mark current step as completed
    completion_time = datetime.now(timezone.utc)
    await db.user_progress.update_one(
        {"user_id": user_id, "step_number": current_step},
        {"$set": {"completed_at": completion_time.isoformat()}},
        upsert=True
    )
    
    # Move to next step (4 means program complete)
    next_step = current_step + 1
    if next_step > 4:
        next_step = 4  # Cap at 4 (complete)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": next_step}}
    )
    
    # If we just moved to step 4 (completed), also record step 4 completion
    # This is needed for "Total Journey" analytics
    if next_step == 4:
        await db.user_progress.update_one(
            {"user_id": user_id, "step_number": 4},
            {"$set": {"completed_at": completion_time.isoformat()}},
            upsert=True
        )
    
    # Send LeadConnector webhook for Step 1 or Step 2 completion
    if current_step in [1, 2]:
        try:
            import httpx
            
            webhook_payload = {
                "email": user_email,
                "step": current_step,
                "submission_date": completion_time.strftime("%Y-%m-%d"),
                "submission_time": completion_time.strftime("%H:%M:%S")
            }
            
            # For Step 1, try to get booking info
            if current_step == 1:
                user_data = await db.users.find_one({"id": user_id}, {"_id": 0, "booking_info": 1})
                if user_data and user_data.get("booking_info"):
                    booking_info = user_data["booking_info"]
                    session_start = booking_info.get("session_start")
                    if session_start:
                        try:
                            # Parse the ISO datetime string
                            from dateutil import parser
                            dt = parser.parse(session_start)
                            webhook_payload["booking_date"] = dt.strftime("%Y-%m-%d")
                            webhook_payload["booking_time"] = dt.strftime("%H:%M:%S")
                        except:
                            pass
            
            async with httpx.AsyncClient() as http_client:
                await http_client.post(
                    "https://services.leadconnectorhq.com/hooks/ygLPhGfHB5mDOoTJ86um/webhook-trigger/64b3e792-3c1e-4887-b8e3-efa79c58a704",
                    json=webhook_payload,
                    timeout=10.0
                )
            logging.info(f"Step {current_step} LeadConnector webhook sent for {user_email}")
        except Exception as e:
            logging.warning(f"Failed to send Step {current_step} webhook for {user_email}: {e}")
    
    return {"message": "Advanced to next step", "current_step": next_step}

@api_router.post("/user/go-back-step")
async def go_back_step(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    current_step = current_user["current_step"]
    
    # Can only go back if not on step 1
    if current_step <= 1:
        raise HTTPException(status_code=400, detail="Already on first step")
    
    # Go back to previous step
    prev_step = current_step - 1
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": prev_step}}
    )
    
    return {"message": "Returned to previous step", "current_step": prev_step}

# Intake Form Routes
class IntakeFormSaveRequest(BaseModel):
    form_data: dict

class IntakeFormSubmitRequest(BaseModel):
    form_data: dict

@api_router.get("/user/intake-form")
async def get_intake_form(current_user: dict = Depends(get_current_user)):
    """Get saved intake form data for the current user"""
    form = await db.intake_forms.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0}
    )
    
    if not form:
        return {"form_data": None, "last_saved": None}
    
    return {
        "form_data": form.get("form_data"),
        "last_saved": form.get("last_saved")
    }

@api_router.post("/user/intake-form/save")
async def save_intake_form(request: IntakeFormSaveRequest, current_user: dict = Depends(get_current_user)):
    """Save intake form progress (auto-save)"""
    user_id = current_user["id"]
    
    form_data = {
        "user_id": user_id,
        "form_data": request.form_data,
        "last_saved": datetime.now(timezone.utc).isoformat(),
        "status": "in_progress"
    }
    
    # Upsert - update if exists, insert if not
    await db.intake_forms.update_one(
        {"user_id": user_id},
        {"$set": form_data},
        upsert=True
    )
    
    return {"message": "Form progress saved", "last_saved": form_data["last_saved"]}

@api_router.post("/user/intake-form/submit")
async def submit_intake_form(request: IntakeFormSubmitRequest, req: Request, current_user: dict = Depends(get_current_user)):
    """Submit the completed intake form, generate PDF, and upload to Google Drive"""
    user_id = current_user["id"]
    user_name = current_user.get("name", "Unknown")
    user_email = current_user.get("email", "unknown@email.com")
    
    # Get client info
    ip_address = req.headers.get("X-Forwarded-For", req.client.host if req.client else None)
    if ip_address and "," in ip_address:
        ip_address = ip_address.split(",")[0].strip()
    user_agent = req.headers.get("User-Agent", "")
    
    # Create submission ID for tracking
    submission_id = str(uuid.uuid4())
    
    # Prepare submission data with status tracking
    submission_data = {
        "submission_id": submission_id,
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "form_data": request.form_data,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "status": "processing",  # Initial status
        "pdf_status": "pending",  # PDF generation status
        "ip_address": ip_address
    }
    
    # Save initial submission immediately (so we don't lose data if PDF fails)
    await db.intake_forms.update_one(
        {"user_id": user_id},
        {"$set": submission_data},
        upsert=True
    )
    
    # Generate PDF
    pdf_result = None
    dropbox_result = None
    drive_result = None
    pdf_errors = []
    
    try:
        from services.pdf_generator import create_intake_form_pdf
        from services.dropbox_service import upload_pdf_to_dropbox
        from services.google_drive import upload_pdf_to_drive
        
        # Get legal name from form for filename
        profile_data = request.form_data.get('profileData', {})
        legal_first_name = profile_data.get('legalFirstName', '').strip()
        legal_last_name = profile_data.get('legalLastName', '').strip()
        
        # Use legal name if available, otherwise fall back to user_name
        if legal_first_name and legal_last_name:
            pdf_name = f"{legal_first_name} {legal_last_name}"
        else:
            pdf_name = user_name
        
        # Create PDF
        try:
            pdf_bytes = create_intake_form_pdf(request.form_data, user_name, user_email)
            submission_data["pdf_status"] = "generated"
        except Exception as pdf_gen_error:
            pdf_errors.append(f"PDF generation failed: {str(pdf_gen_error)}")
            submission_data["pdf_status"] = "generation_failed"
            submission_data["pdf_error"] = str(pdf_gen_error)
            raise pdf_gen_error
        
        # Generate filename: Legal Name Diabetes Intake Form.pdf
        filename = f"{pdf_name} Diabetes Intake Form.pdf"
        submission_data["pdf_filename"] = filename
        
        # Upload to Dropbox
        try:
            dropbox_result = upload_pdf_to_dropbox(pdf_bytes, filename)
            if dropbox_result.get("success"):
                submission_data["pdf_dropbox_path"] = dropbox_result.get("dropbox_path")
                submission_data["pdf_dropbox_link"] = dropbox_result.get("shared_link")
                print(f"PDF uploaded to Dropbox: {filename}")
            else:
                pdf_errors.append(f"Dropbox upload failed: {dropbox_result.get('error')}")
        except Exception as dropbox_error:
            pdf_errors.append(f"Dropbox upload error: {str(dropbox_error)}")
        
        # Upload to Google Drive
        try:
            drive_result = upload_pdf_to_drive(pdf_bytes, filename)
            if drive_result.get("success"):
                submission_data["pdf_drive_file_id"] = drive_result.get("file_id")
                submission_data["pdf_drive_link"] = drive_result.get("web_view_link")
                print(f"PDF uploaded to Google Drive: {filename}")
            else:
                pdf_errors.append(f"Google Drive upload failed: {drive_result.get('error')}")
        except Exception as drive_error:
            pdf_errors.append(f"Google Drive upload error: {str(drive_error)}")
        
        # Determine final PDF status
        dropbox_success = dropbox_result and dropbox_result.get("success")
        drive_success = drive_result and drive_result.get("success")
        
        if dropbox_success and drive_success:
            submission_data["pdf_status"] = "uploaded_both"
        elif dropbox_success:
            submission_data["pdf_status"] = "uploaded_dropbox_only"
        elif drive_success:
            submission_data["pdf_status"] = "uploaded_drive_only"
        else:
            submission_data["pdf_status"] = "upload_failed"
            submission_data["pdf_errors"] = pdf_errors
        
        # Consider upload successful if at least one service worked
        upload_success = dropbox_success or drive_success
        
        if upload_success:
            submission_data["status"] = "completed"
            
            # Send webhook to Zapier with email, full name, and PDF file
            try:
                import base64
                import httpx
                
                ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/1815480/uw4ih9b/"
                
                # Prepare webhook payload with PDF as base64
                pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
                
                webhook_payload = {
                    "email": user_email,
                    "full_name": pdf_name,
                    "file_name": filename,
                    "file_content": pdf_base64,
                    "file_type": "application/pdf",
                    "dropbox_link": dropbox_result.get("shared_link") if dropbox_result else None,
                    "google_drive_link": drive_result.get("web_view_link") if drive_result else None,
                    "submitted_at": submission_data["submitted_at"]
                }
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    webhook_response = await client.post(
                        ZAPIER_WEBHOOK_URL,
                        json=webhook_payload
                    )
                    
                    if webhook_response.status_code == 200:
                        print(f"Zapier webhook sent successfully for {user_email}")
                        submission_data["webhook_status"] = "sent"
                    else:
                        print(f"Zapier webhook failed: {webhook_response.status_code} - {webhook_response.text}")
                        submission_data["webhook_status"] = "failed"
                        
            except Exception as webhook_error:
                print(f"Error sending Zapier webhook: {str(webhook_error)}")
                submission_data["webhook_status"] = "error"
                # Continue even if webhook fails
        else:
            submission_data["status"] = "completed_with_errors"
            print(f"Failed to upload PDF to both services")
            
    except Exception as e:
        print(f"Error generating/uploading PDF: {str(e)}")
        submission_data["status"] = "completed_pdf_failed"
        submission_data["pdf_status"] = "failed"
        submission_data["pdf_error"] = str(e)
        # Continue with submission even if PDF fails - form data is already saved
    
    # Update the intake form record with final status
    submission_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    await db.intake_forms.update_one(
        {"user_id": user_id},
        {"$set": submission_data},
        upsert=True
    )
    
    # Also store in a separate submissions collection for admin review
    await db.intake_form_submissions.insert_one({
        **submission_data
    })
    
    # Log the submission
    await log_activity(
        event_type="INTAKE_FORM_SUBMITTED",
        user_email=user_email,
        user_id=user_id,
        details={
            "submission_id": submission_id,
            "status": submission_data.get("status"),
            "pdf_status": submission_data.get("pdf_status"),
            "has_hipaa_signature": bool(request.form_data.get("hipaaSignature")),
            "has_telehealth_signature": bool(request.form_data.get("telehealthSignature")),
            "profile_data_fields": list(request.form_data.get("profileData", {}).keys()) if request.form_data.get("profileData") else [],
            "pdf_uploaded_dropbox": dropbox_result.get("success") if dropbox_result else False,
            "pdf_uploaded_drive": drive_result.get("success") if drive_result else False,
            "pdf_filename": submission_data.get("pdf_filename")
        },
        status="success",
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Determine user-friendly message based on status
    if submission_data.get("status") == "completed":
        message = "Form submitted successfully! Your documents have been saved."
    elif submission_data.get("status") == "completed_with_errors":
        message = "Form submitted successfully! Some documents may still be processing."
    else:
        message = "Form submitted successfully! Your information has been saved."
    
    return {
        "message": message,
        "submission_id": submission_id,
        "status": submission_data.get("status"),
        "pdf_status": submission_data.get("pdf_status"),
        "submitted_at": submission_data["submitted_at"],
        "pdf_uploaded_dropbox": dropbox_result.get("success") if dropbox_result else False,
        "pdf_uploaded_drive": drive_result.get("success") if drive_result else False,
        "dropbox_link": dropbox_result.get("shared_link") if dropbox_result and dropbox_result.get("success") else None,
        "drive_link": drive_result.get("web_view_link") if drive_result and drive_result.get("success") else None
    }

# Admin Routes
@api_router.get("/admin/users")
async def get_all_users(admin_user: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    # Fetch appointments for all users
    appointments = await db.appointments.find({}, {"_id": 0}).to_list(1000)
    
    # Create a map of user_id to appointment
    user_appointments = {}
    for appt in appointments:
        user_id = appt.get("user_id")
        if user_id:
            # Store the most recent appointment for each user
            if user_id not in user_appointments or appt.get("created_at", "") > user_appointments[user_id].get("created_at", ""):
                user_appointments[user_id] = appt
    
    # Attach appointment info to each user
    for user in users:
        user_id = user.get("id")
        if user_id and user_id in user_appointments:
            appt = user_appointments[user_id]
            # Merge appointment into booking_info if not already set
            if not user.get("booking_info"):
                user["booking_info"] = {
                    "session_start": appt.get("session_date"),
                    "booking_id": appt.get("booking_id"),
                    "source": "webhook",
                    "created_at": appt.get("created_at")
                }
            else:
                # Add webhook data to existing booking_info
                user["booking_info"]["webhook_booking_id"] = appt.get("booking_id")
                user["booking_info"]["webhook_session_date"] = appt.get("session_date")
    
    return {"users": users}

@api_router.get("/admin/analytics")
async def get_analytics(
    admin_user: dict = Depends(get_admin_user),
    start_date: str = None,
    end_date: str = None
):
    """
    Get comprehensive analytics with optional date filtering.
    Date format: YYYY-MM-DD (interpreted as Pacific timezone)
    Excludes staff users from all analytics.
    """
    import pytz
    pacific = pytz.timezone('America/Los_Angeles')
    
    # Build date filter query - dates are in Pacific timezone
    date_filter = {}
    if start_date:
        try:
            # Parse as Pacific timezone, convert to UTC for querying
            start_dt_pacific = pacific.localize(datetime.strptime(start_date, "%Y-%m-%d"))
            start_dt_utc = start_dt_pacific.astimezone(pytz.UTC)
            date_filter["$gte"] = start_dt_utc.isoformat()
        except ValueError:
            pass
    if end_date:
        try:
            # Parse as Pacific timezone end of day, convert to UTC
            end_dt_pacific = pacific.localize(datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
            end_dt_utc = end_dt_pacific.astimezone(pytz.UTC)
            date_filter["$lte"] = end_dt_utc.isoformat()
        except ValueError:
            pass
    
    # Build user query with date filter - EXCLUDE staff and admin from analytics
    user_query = {"role": {"$nin": ["staff", "admin"]}}
    if date_filter:
        user_query["created_at"] = date_filter
    
    total_users = await db.users.count_documents(user_query)
    
    # Count users by step (including step 0 for refunded users)
    step_distribution = {}
    
    # Count refunded users (step 0)
    refunded_query = {**user_query, "current_step": 0}
    refunded_count = await db.users.count_documents(refunded_query)
    step_distribution["refunded"] = refunded_count
    
    # Count users in steps 1-7
    for step in range(1, 8):
        step_query = {**user_query, "current_step": step}
        count = await db.users.count_documents(step_query)
        step_distribution[f"step_{step}"] = count
    
    # Day 1 Ready: Users who have completed step 1 AND step 2 (currently on step 3+)
    day1_ready_count = await db.users.count_documents({**user_query, "current_step": {"$gte": 3}})
    
    # Count completed steps
    completed_steps = await db.user_progress.count_documents({"completed_at": {"$ne": None}})
    
    # Calculate step transition times
    step_transition_times = await calculate_step_transition_times(user_query)
    
    # Get completion funnel data
    funnel_data = await get_completion_funnel(user_query)
    
    # Get daily signup trends (filtered by date range)
    signup_trends = await get_signup_trends(start_date, end_date)
    
    # Get average completion rates
    completion_stats = await get_completion_stats(user_query)
    
    # Get realtime stats (always fresh, not filtered by date)
    realtime_stats = await get_realtime_stats()
    
    # Get hourly activity for last 24 hours
    hourly_activity = await get_hourly_activity()
    
    # Get completion rate trends (daily completions over time)
    completion_trends = await get_completion_trends(start_date, end_date, user_query)
    
    return {
        "total_users": total_users,
        "day1_ready": day1_ready_count,
        "step_distribution": step_distribution,
        "completed_steps": completed_steps,
        "step_transition_times": step_transition_times,
        "funnel_data": funnel_data,
        "signup_trends": signup_trends,
        "completion_stats": completion_stats,
        "realtime_stats": realtime_stats,
        "hourly_activity": hourly_activity,
        "completion_trends": completion_trends,
        "filters_applied": {
            "start_date": start_date,
            "end_date": end_date
        }
    }


@api_router.get("/admin/analytics/debug")
async def debug_analytics_filter(
    admin_user: dict = Depends(get_admin_user),
    start_date: str = None,
    end_date: str = None
):
    """
    Debug endpoint to see exactly how date filtering works.
    Shows the UTC boundaries being used and lists users near those boundaries.
    """
    import pytz
    pacific = pytz.timezone('America/Los_Angeles')
    
    debug_info = {
        "input": {
            "start_date": start_date,
            "end_date": end_date
        },
        "converted_boundaries": {},
        "users_near_boundaries": [],
        "all_users_in_range": [],
        "users_just_outside_range": []
    }
    
    # Calculate UTC boundaries
    start_dt_utc = None
    end_dt_utc = None
    
    if start_date:
        start_dt_pacific = pacific.localize(datetime.strptime(start_date, "%Y-%m-%d"))
        start_dt_utc = start_dt_pacific.astimezone(pytz.UTC)
        debug_info["converted_boundaries"]["start_pacific"] = start_dt_pacific.isoformat()
        debug_info["converted_boundaries"]["start_utc"] = start_dt_utc.isoformat()
    
    if end_date:
        end_dt_pacific = pacific.localize(datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
        end_dt_utc = end_dt_pacific.astimezone(pytz.UTC)
        debug_info["converted_boundaries"]["end_pacific"] = end_dt_pacific.isoformat()
        debug_info["converted_boundaries"]["end_utc"] = end_dt_utc.isoformat()
    
    # Get all users (excluding staff/admin) with their created_at
    all_users = await db.users.find(
        {"role": {"$nin": ["staff", "admin"]}},
        {"_id": 0, "email": 1, "created_at": 1, "current_step": 1}
    ).to_list(10000)
    
    # Categorize users
    for user in all_users:
        created_at_str = user.get("created_at")
        if not created_at_str:
            continue
            
        try:
            # Parse the stored datetime
            from dateutil import parser as date_parser
            created_dt = date_parser.parse(created_at_str)
            
            # Make timezone aware if not already
            if created_dt.tzinfo is None:
                created_dt = pytz.UTC.localize(created_dt)
            
            # Convert to Pacific for display
            created_pacific = created_dt.astimezone(pacific)
            
            user_info = {
                "email": user.get("email"),
                "created_at_utc": created_dt.isoformat(),
                "created_at_pacific": created_pacific.strftime("%Y-%m-%d %H:%M:%S %Z"),
                "current_step": user.get("current_step")
            }
            
            # Check if in range
            in_range = True
            if start_dt_utc and created_dt < start_dt_utc:
                in_range = False
            if end_dt_utc and created_dt > end_dt_utc:
                in_range = False
            
            if in_range:
                debug_info["all_users_in_range"].append(user_info)
            else:
                # Check if just outside range (within 24 hours of boundary)
                from datetime import timedelta
                near_boundary = False
                if start_dt_utc and start_dt_utc - timedelta(hours=24) <= created_dt < start_dt_utc:
                    near_boundary = True
                    user_info["boundary_note"] = "Just BEFORE start boundary"
                if end_dt_utc and end_dt_utc < created_dt <= end_dt_utc + timedelta(hours=24):
                    near_boundary = True
                    user_info["boundary_note"] = "Just AFTER end boundary"
                
                if near_boundary:
                    debug_info["users_just_outside_range"].append(user_info)
        except Exception as e:
            debug_info["users_near_boundaries"].append({
                "email": user.get("email"),
                "error": str(e),
                "raw_created_at": created_at_str
            })
    
    debug_info["summary"] = {
        "total_in_range": len(debug_info["all_users_in_range"]),
        "total_just_outside": len(debug_info["users_just_outside_range"])
    }
    
    return debug_info
    """Calculate average time between steps for users matching the query"""
    from dateutil import parser as date_parser
    
    # Get user IDs matching the query
    user_ids = None
    if user_query:
        matching_users = await db.users.find(user_query, {"id": 1, "_id": 0}).to_list(10000)
        user_ids = [u["id"] for u in matching_users]
    
    # Get progress records (filtered by user IDs if query provided)
    progress_query = {}
    if user_ids is not None:
        progress_query["user_id"] = {"$in": user_ids}
    
    progress_records = await db.user_progress.find(progress_query).to_list(10000)
    
    # Group by user
    user_progress = {}
    for record in progress_records:
        user_id = record.get("user_id")
        if user_ids is not None and user_id not in user_ids:
            continue
        if user_id not in user_progress:
            user_progress[user_id] = {}
        step_num = record.get("step_number")
        completed_at = record.get("completed_at")
        if step_num and completed_at:
            user_progress[user_id][step_num] = completed_at
    
    # Calculate transition times
    transitions = {
        "step_1_to_2": [],  # Booking to Intake Form
        "step_2_to_3": [],  # Intake Form to Completion
        "step_3_to_4": [],  # Completion to Portal Activated
        "total_completion": []  # Step 1 to final completion
    }
    
    for user_id, steps in user_progress.items():
        try:
            # Step 1 to 2
            if 1 in steps and 2 in steps:
                t1 = date_parser.parse(steps[1])
                t2 = date_parser.parse(steps[2])
                diff_hours = (t2 - t1).total_seconds() / 3600
                if diff_hours >= 0:
                    transitions["step_1_to_2"].append(diff_hours)
            
            # Step 2 to 3
            if 2 in steps and 3 in steps:
                t2 = date_parser.parse(steps[2])
                t3 = date_parser.parse(steps[3])
                diff_hours = (t3 - t2).total_seconds() / 3600
                if diff_hours >= 0:
                    transitions["step_2_to_3"].append(diff_hours)
            
            # Step 3 to 4
            if 3 in steps and 4 in steps:
                t3 = date_parser.parse(steps[3])
                t4 = date_parser.parse(steps[4])
                diff_hours = (t4 - t3).total_seconds() / 3600
                if diff_hours >= 0:
                    transitions["step_3_to_4"].append(diff_hours)
            
            # Total completion time (step 1 to step 4 or 3)
            if 1 in steps:
                t1 = date_parser.parse(steps[1])
                final_step = 4 if 4 in steps else (3 if 3 in steps else None)
                if final_step:
                    tf = date_parser.parse(steps[final_step])
                    diff_hours = (tf - t1).total_seconds() / 3600
                    if diff_hours >= 0:
                        transitions["total_completion"].append(diff_hours)
        except Exception:
            continue
    
    # Calculate averages and format
    def format_time(hours_list):
        if not hours_list:
            return {"avg_hours": None, "min_hours": None, "max_hours": None, "count": 0}
        avg = sum(hours_list) / len(hours_list)
        return {
            "avg_hours": round(avg, 1),
            "avg_formatted": format_duration(avg),
            "min_hours": round(min(hours_list), 1),
            "max_hours": round(max(hours_list), 1),
            "count": len(hours_list)
        }
    
    def format_duration(hours):
        if hours < 1:
            return f"{int(hours * 60)} min"
        elif hours < 24:
            return f"{round(hours, 1)} hrs"
        else:
            days = hours / 24
            return f"{round(days, 1)} days"
    
    return {
        "booking_to_intake": format_time(transitions["step_1_to_2"]),
        "intake_to_completion": format_time(transitions["step_2_to_3"]),
        "completion_to_activated": format_time(transitions["step_3_to_4"]),
        "total_journey": format_time(transitions["total_completion"])
    }


async def get_completion_funnel(user_query: dict = None):
    """Get funnel showing drop-off at each stage"""
    query = user_query or {}
    
    total = await db.users.count_documents(query)
    
    # Users who reached or passed each step
    reached_step_2 = await db.users.count_documents({**query, "current_step": {"$gte": 2}})
    reached_step_3 = await db.users.count_documents({**query, "current_step": {"$gte": 3}})
    reached_step_4 = await db.users.count_documents({**query, "current_step": {"$gte": 4}})
    
    return {
        "started": {"count": total, "percentage": 100},
        "completed_booking": {
            "count": reached_step_2,
            "percentage": round((reached_step_2 / total) * 100, 1) if total > 0 else 0,
            "drop_off": total - reached_step_2
        },
        "completed_intake": {
            "count": reached_step_3,
            "percentage": round((reached_step_3 / total) * 100, 1) if total > 0 else 0,
            "drop_off": reached_step_2 - reached_step_3
        },
        "activated_portal": {
            "count": reached_step_4,
            "percentage": round((reached_step_4 / total) * 100, 1) if total > 0 else 0,
            "drop_off": reached_step_3 - reached_step_4
        }
    }


async def get_signup_trends(start_date: str = None, end_date: str = None):
    """Get daily signup counts for the specified date range or last 30 days"""
    from datetime import timedelta
    from dateutil import parser as date_parser
    
    # Determine date range
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        except:
            # Fallback to last 30 days
            end_dt = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59)
            start_dt = end_dt - timedelta(days=30)
    else:
        end_dt = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59)
        start_dt = end_dt - timedelta(days=30)
    
    # Get all users created in the date range
    users = await db.users.find(
        {"created_at": {"$gte": start_dt.isoformat(), "$lte": end_dt.isoformat()}},
        {"created_at": 1, "_id": 0}
    ).to_list(10000)
    
    # Count by date
    daily_counts = {}
    num_days = (end_dt - start_dt).days + 1
    for i in range(num_days):
        date = (start_dt + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_counts[date] = 0
    
    for user in users:
        try:
            created = date_parser.parse(user["created_at"])
            date_str = created.strftime("%Y-%m-%d")
            if date_str in daily_counts:
                daily_counts[date_str] += 1
        except:
            continue
    
    return [{"date": k, "count": v} for k, v in sorted(daily_counts.items())]


async def get_completion_stats(user_query: dict = None):
    """Get overall completion statistics"""
    query = user_query or {}
    
    total = await db.users.count_documents(query)
    completed = await db.users.count_documents({**query, "current_step": {"$gte": 4}})
    in_progress = await db.users.count_documents({**query, "current_step": {"$in": [1, 2, 3]}})
    refunded = await db.users.count_documents({**query, "current_step": 0})
    
    return {
        "total_users": total,
        "completed": completed,
        "completion_rate": round((completed / total) * 100, 1) if total > 0 else 0,
        "in_progress": in_progress,
        "in_progress_rate": round((in_progress / total) * 100, 1) if total > 0 else 0,
        "refunded": refunded,
        "refund_rate": round((refunded / total) * 100, 1) if total > 0 else 0
    }


async def get_realtime_stats():
    """Get realtime statistics - today, this week, recent activity (Pacific timezone)"""
    from datetime import timedelta
    import pytz
    
    pacific = pytz.timezone('America/Los_Angeles')
    now_pacific = datetime.now(pacific)
    today_start_pacific = now_pacific.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_pacific.astimezone(pytz.UTC)
    
    # Week start (Monday in Pacific)
    days_since_monday = today_start_pacific.weekday()
    week_start_pacific = today_start_pacific - timedelta(days=days_since_monday)
    week_start_utc = week_start_pacific.astimezone(pytz.UTC)
    
    # Today's stats (Pacific timezone day)
    today_signups = await db.users.count_documents({
        "created_at": {"$gte": today_start_utc.isoformat()}
    })
    
    today_logins = await db.activity_logs.count_documents({
        "event_type": "LOGIN_SUCCESS",
        "timestamp": {"$gte": today_start_utc.isoformat()}
    })
    
    today_bookings = await db.activity_logs.count_documents({
        "event_type": "APPOINTMENT_BOOKED",
        "timestamp": {"$gte": today_start_utc.isoformat()}
    })
    
    today_form_submissions = await db.activity_logs.count_documents({
        "event_type": "INTAKE_FORM_SUBMITTED",
        "timestamp": {"$gte": today_start_utc.isoformat()}
    })
    
    # This week's stats (Pacific timezone week)
    week_signups = await db.users.count_documents({
        "created_at": {"$gte": week_start_utc.isoformat()}
    })
    
    week_completions = await db.activity_logs.count_documents({
        "event_type": {"$in": ["STEP_ADVANCED", "PORTAL_ACTIVATED"]},
        "timestamp": {"$gte": week_start_utc.isoformat()}
    })
    
    # Recent activity (last 10 events)
    recent_activities = await db.activity_logs.find(
        {"event_type": {"$in": ["LOGIN_SUCCESS", "SIGNUP_SUCCESS", "APPOINTMENT_BOOKED", "INTAKE_FORM_SUBMITTED", "PORTAL_ACTIVATED"]}},
        {"_id": 0, "event_type": 1, "user_email": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(10).to_list(10)
    
    # Format recent activities
    formatted_activities = []
    for activity in recent_activities:
        formatted_activities.append({
            "event": activity.get("event_type", "").replace("_", " ").title(),
            "email": activity.get("user_email", "Unknown"),
            "time": activity.get("timestamp", "")
        })
    
    return {
        "today": {
            "signups": today_signups,
            "logins": today_logins,
            "bookings": today_bookings,
            "form_submissions": today_form_submissions
        },
        "this_week": {
            "signups": week_signups,
            "completions": week_completions
        },
        "recent_activity": formatted_activities,
        "last_updated": now_pacific.isoformat()
    }


async def get_hourly_activity():
    """Get activity breakdown by hour for the last 24 hours"""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)
    
    # Get all activity logs from last 24 hours
    logs = await db.activity_logs.find(
        {"timestamp": {"$gte": yesterday.isoformat()}},
        {"_id": 0, "timestamp": 1, "event_type": 1}
    ).to_list(10000)
    
    # Initialize hourly buckets
    hourly_data = {}
    for i in range(24):
        hour = (now - timedelta(hours=23-i)).strftime("%H:00")
        hourly_data[hour] = 0
    
    # Count events per hour
    for log in logs:
        try:
            from dateutil import parser
            ts = parser.parse(log["timestamp"])
            hour_key = ts.strftime("%H:00")
            if hour_key in hourly_data:
                hourly_data[hour_key] += 1
        except:
            continue
    
    return [{"hour": k, "count": v} for k, v in hourly_data.items()]


async def get_completion_trends(start_date: str = None, end_date: str = None, user_query: dict = None):
    """Get daily step completion counts over time for line graph"""
    from datetime import timedelta
    from dateutil import parser as date_parser
    
    # Get user IDs to filter (exclude staff/admin)
    user_ids = None
    if user_query:
        matching_users = await db.users.find(user_query, {"id": 1, "_id": 0}).to_list(10000)
        user_ids = [u["id"] for u in matching_users]
    
    # Build progress query - filter by user_ids if provided
    progress_query = {"completed_at": {"$ne": None}, "step_number": {"$in": [1, 2, 3]}}
    if user_ids is not None:
        progress_query["user_id"] = {"$in": user_ids}
    
    # Get all progress records (we'll filter by date after)
    progress_records = await db.user_progress.find(progress_query).to_list(10000)
    
    if not progress_records:
        return []
    
    # Parse all dates and find the range
    parsed_records = []
    for record in progress_records:
        try:
            completed_at = record.get("completed_at")
            step_num = record.get("step_number")
            if completed_at and step_num:
                dt = date_parser.parse(completed_at)
                parsed_records.append({"date": dt, "step": step_num})
        except:
            continue
    
    if not parsed_records:
        return []
    
    # Determine date range
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        except:
            # Use data range
            all_dates = [r["date"] for r in parsed_records]
            start_dt = min(all_dates).replace(hour=0, minute=0, second=0)
            end_dt = max(all_dates).replace(hour=23, minute=59, second=59)
    else:
        # No filter - use the actual data range
        all_dates = [r["date"] for r in parsed_records]
        start_dt = min(all_dates).replace(hour=0, minute=0, second=0)
        end_dt = max(all_dates).replace(hour=23, minute=59, second=59)
    
    # Initialize daily buckets for each step
    num_days = (end_dt - start_dt).days + 1
    # Limit to max 90 days to avoid huge arrays
    if num_days > 90:
        start_dt = end_dt - timedelta(days=90)
        num_days = 91
    
    daily_data = {}
    for i in range(num_days):
        date = (start_dt + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[date] = {"step_1": 0, "step_2": 0, "step_3": 0}
    
    # Count completions by date and step
    for record in parsed_records:
        dt = record["date"]
        step_num = record["step"]
        # Check if within our display range
        if start_dt <= dt <= end_dt:
            date_str = dt.strftime("%Y-%m-%d")
            if date_str in daily_data:
                daily_data[date_str][f"step_{step_num}"] += 1
    
    return [{"date": k, **v} for k, v in sorted(daily_data.items())]


# Staff role promotion endpoint
class PromoteUserRequest(BaseModel):
    role: str  # 'staff' or 'user'

@api_router.post("/admin/user/{user_id}/promote")
async def promote_user(
    user_id: str,
    request: PromoteUserRequest,
    admin_user: dict = Depends(get_admin_user)
):
    """Promote or demote a user to/from staff role. Only admins can do this."""
    if request.role not in ["staff", "user"]:
        raise HTTPException(status_code=400, detail="Role must be 'staff' or 'user'")
    
    # Find the user
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Can't change admin roles
    if user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot change admin roles")
    
    # Update the role
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": request.role}}
    )
    
    # Log the activity
    await log_activity(
        event_type="USER_ROLE_CHANGED",
        user_email=user.get("email"),
        user_id=user_id,
        details={
            "old_role": user.get("role", "user"),
            "new_role": request.role,
            "changed_by": admin_user.get("email")
        },
        status="success"
    )
    
    return {"message": f"User role changed to {request.role}", "role": request.role}


@api_router.get("/admin/activity-logs")
async def get_activity_logs(
    admin_user: dict = Depends(get_admin_user),
    page: int = 1,
    per_page: int = 50,
    event_type: str = None,
    user_email: str = None
):
    """Get activity logs with pagination and filtering"""
    # Cap per_page at 500
    per_page = min(max(per_page, 10), 500)
    page = max(page, 1)
    skip = (page - 1) * per_page
    
    query = {}
    
    if event_type:
        query["event_type"] = event_type
    
    if user_email:
        query["user_email"] = user_email.lower()
    
    # Get total count for pagination
    total_count = await db.activity_logs.count_documents(query)
    total_pages = (total_count + per_page - 1) // per_page  # Ceiling division
    
    # Fetch logs - first normalize all timestamps to ensure consistent sorting
    logs = await db.activity_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).skip(skip).limit(per_page).to_list(per_page)
    
    # Convert datetime objects to ISO strings for JSON serialization
    for log in logs:
        if isinstance(log.get("timestamp"), datetime):
            log["timestamp"] = log["timestamp"].isoformat()
    
    # Sort logs by timestamp string (ensures consistent ordering)
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    # Get unique event types for filtering
    event_types = await db.activity_logs.distinct("event_type")
    
    return {
        "logs": logs,
        "event_types": event_types,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }

@api_router.post("/admin/normalize-log-timestamps")
async def normalize_log_timestamps(secret_key: str):
    """
    One-time migration to normalize all activity log timestamps to ISO strings.
    This fixes the sorting issue between datetime objects and ISO strings.
    Protected by webhook secret.
    """
    if not WEBHOOK_SECRET or secret_key != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid secret key"
        )
    
    # Find all logs with datetime timestamps and convert to ISO strings
    logs = await db.activity_logs.find({}).to_list(100000)
    fixed = 0
    
    for log in logs:
        ts = log.get("timestamp")
        if isinstance(ts, datetime):
            # Convert to ISO string with timezone
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            await db.activity_logs.update_one(
                {"_id": log["_id"]},
                {"$set": {"timestamp": ts.isoformat()}}
            )
            fixed += 1
    
    return {
        "message": f"Migration complete. Normalized {fixed} timestamps.",
        "total_logs": len(logs),
        "fixed": fixed
    }

@api_router.post("/admin/user/{user_id}/reset")
async def reset_user_progress(user_id: str, admin_user: dict = Depends(get_admin_user)):
    # Get user info to preserve auto-filled data
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Reset user to step 1 and clear Practice Better client ID
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {"current_step": 1},
            "$unset": {"pb_client_record_id": ""}  # Clear the PB client ID for fresh booking
        }
    )
    
    # Delete all progress
    await db.user_progress.delete_many({"user_id": user_id})
    
    # Clear intake form data but preserve auto-filled info (first_name, last_name)
    # Create a fresh form with only the auto-filled fields preserved
    preserved_data = {}
    if user.get("first_name"):
        preserved_data["legalFirstName"] = user.get("first_name")
    if user.get("last_name"):
        preserved_data["legalLastName"] = user.get("last_name")
    
    # Delete existing intake form
    await db.intake_forms.delete_many({"user_id": user_id})
    
    # Log the reset action
    await log_activity(
        event_type="USER_PROGRESS_RESET",
        user_email=user.get("email"),
        user_id=user_id,
        details={
            "reset_by": admin_user.get("email"),
            "intake_form_cleared": True,
            "pb_client_record_id_cleared": True,
            "preserved_fields": list(preserved_data.keys())
        },
        status="success"
    )
    
    return {
        "message": "User progress, intake form, and Practice Better client ID reset successfully",
        "preserved_fields": list(preserved_data.keys())
    }

class SetStepRequest(BaseModel):
    step: int

@api_router.post("/admin/user/{user_id}/set-step")
async def set_user_step(user_id: str, request: SetStepRequest, admin_user: dict = Depends(get_admin_user)):
    """Set a user's current step to a specific value (0=refunded, 1-4 normal steps)"""
    # Validate step is within range (0 = refunded, 1-4 = normal steps)
    if request.step < 0 or request.step > 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step must be between 0 (refunded) and 4"
        )
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    old_step = user.get("current_step", 1)
    
    # Update user's step
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": request.step}}
    )
    
    # Note: user_progress tracks step completion records, not current_step
    # The current_step is only stored on the users collection
    
    # Log the activity
    step_name = "Refunded" if request.step == 0 else f"Step {request.step}"
    old_step_name = "Refunded" if old_step == 0 else f"Step {old_step}"
    
    await log_activity(
        event_type="USER_STEP_CHANGED",
        user_email=user.get("email"),
        user_id=user_id,
        details={
            "old_step": old_step,
            "new_step": request.step,
            "old_step_name": old_step_name,
            "new_step_name": step_name,
            "changed_by": admin_user.get("email")
        },
        status="success"
    )
    
    return {
        "message": f"User moved from {old_step_name} to {step_name}",
        "old_step": old_step,
        "new_step": request.step
    }

class UpdateBookingRequest(BaseModel):
    booking_datetime: str  # ISO format datetime string
    booking_timezone: Optional[str] = None  # Optional timezone override
    notes: Optional[str] = None

@api_router.post("/admin/user/{user_id}/update-booking")
async def update_user_booking(user_id: str, request: UpdateBookingRequest, admin_user: dict = Depends(get_admin_user)):
    """Update or set a user's booking time - for when users call to reschedule"""
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Parse and validate the datetime
    try:
        booking_dt = datetime.fromisoformat(request.booking_datetime.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid datetime format. Use ISO format (e.g., 2024-01-15T14:30:00)"
        )
    
    # Get user's original timezone from signup
    user_timezone = user.get("signup_location", {}).get("timezone") or user.get("location_info", {}).get("timezone") or "Unknown"
    
    # Build booking info
    booking_info = {
        "session_start": request.booking_datetime,
        "booking_datetime": request.booking_datetime,
        "booking_datetime_utc": booking_dt.astimezone(timezone.utc).isoformat() if booking_dt.tzinfo else booking_dt.isoformat(),
        "timezone": request.booking_timezone or user_timezone,
        "booking_timezone": request.booking_timezone or user_timezone,
        "updated_by": admin_user.get("email"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "update_notes": request.notes,
        "source": "admin_manual"
    }
    
    # Update user with booking info
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"booking_info": booking_info}}
    )
    
    # Also update or create appointment in appointments collection
    appointment_data = {
        "session_date": request.booking_datetime,
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
        "email": user.get("email"),
        "mobile_phone": user.get("phone"),
        "user_id": user_id,
        "matched_by": "admin_manual",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin_user.get("email"),
        "update_notes": request.notes
    }
    
    # Check if user already has an appointment
    existing_appt = await db.appointments.find_one({"user_id": user_id})
    if existing_appt:
        await db.appointments.update_one(
            {"user_id": user_id},
            {"$set": appointment_data}
        )
    else:
        appointment_data["booking_id"] = f"admin_manual_{user_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        appointment_data["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.appointments.insert_one(appointment_data)
    
    # Log the action
    await log_activity(
        event_type="ADMIN_BOOKING_UPDATE",
        user_email=user.get("email"),
        user_id=user_id,
        details={
            "updated_by": admin_user.get("email"),
            "new_booking_datetime": request.booking_datetime,
            "booking_timezone": request.booking_timezone or user_timezone,
            "notes": request.notes
        },
        status="success"
    )
    
    return {
        "message": "Booking updated successfully",
        "booking_info": booking_info,
        "user_timezone": user_timezone
    }

@api_router.delete("/admin/user/{user_id}/booking")
async def delete_user_booking(user_id: str, admin_user: dict = Depends(get_admin_user)):
    """Remove a user's booking info"""
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Remove booking info
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"booking_info": ""}}
    )
    
    # Log the action
    await log_activity(
        event_type="ADMIN_BOOKING_DELETED",
        user_email=user.get("email"),
        user_id=user_id,
        details={
            "deleted_by": admin_user.get("email")
        },
        status="success"
    )
    
    return {"message": "Booking removed successfully"}

@api_router.post("/admin/promote-user")
async def promote_user_to_admin(email: EmailStr, secret_key: str):
    """
    Promote a user to admin role - Protected by webhook secret
    This is a one-time setup endpoint for creating the first admin
    """
    if not WEBHOOK_SECRET or secret_key != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid secret key"
        )
    
    # Normalize email to lowercase
    email_lower = email.lower()
    user = await db.users.find_one({"email": email_lower}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.get("role") == "admin":
        return {"message": "User is already an admin", "email": email_lower}
    
    await db.users.update_one(
        {"email": email_lower},
        {"$set": {"role": "admin"}}
    )
    
    return {"message": "User promoted to admin successfully", "email": email_lower}

@api_router.post("/admin/migrate-emails")
async def migrate_emails_to_lowercase(secret_key: str):
    """
    One-time migration to normalize all emails to lowercase.
    Protected by webhook secret.
    """
    if not WEBHOOK_SECRET or secret_key != WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid secret key"
        )
    
    # Find and fix all users with uppercase emails
    users = await db.users.find({}, {"_id": 1, "email": 1}).to_list(10000)
    fixed = []
    
    for user in users:
        email = user.get("email", "")
        if email and email != email.lower():
            old_email = email
            new_email = email.lower()
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"email": new_email}}
            )
            fixed.append({"old": old_email, "new": new_email})
    
    return {
        "message": f"Migration complete. Fixed {len(fixed)} emails.",
        "fixed_emails": fixed
    }

@api_router.delete("/admin/user/{user_id}")
async def delete_user(user_id: str, admin_user: dict = Depends(get_admin_user)):
    """
    Delete a user - Admin only
    """
    # Check if user exists
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from deleting themselves
    if user.get("id") == admin_user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account"
        )
    
    # Delete user's progress
    await db.user_progress.delete_many({"user_id": user_id})
    
    # Delete user
    result = await db.users.delete_one({"id": user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user"
        )
    
    return {"message": "User deleted successfully", "user_id": user_id}

class SetPasswordRequest(BaseModel):
    password: str

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None

@api_router.post("/admin/user/{user_id}/resend-welcome")
async def resend_welcome_email(user_id: str, admin_user: dict = Depends(get_admin_user)):
    """Resend welcome email to user - Admin only (uses Resend API)"""
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate new auto-login token
    auto_login_token = await create_auto_login_token(user_id, user["email"])
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://portal.drshumard.com')
    auto_login_url = f"{frontend_url}/auto-login/{auto_login_token}"
    
    try:
        # Use Resend API - Simple accessible design for 50+ users
        resend.Emails.send({
            "from": "Dr. Shumard Portal <admin@portal.drshumard.com>",
            "to": user["email"],
            "subject": "Access Your Dr. Shumard Portal",
            "html": f"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Portal Access</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; color: #333333; background-color: #ffffff;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <tr>
                        <td>
                            <!-- Header -->
                            <h1 style="font-size: 24px; color: #000000; margin: 0 0 20px 0; border-bottom: 2px solid #000000; padding-bottom: 10px;">
                                Access Your Portal
                            </h1>
                            
                            <!-- Greeting -->
                            <p style="font-size: 18px; margin: 20px 0;">
                                Hello {user.get('name', 'there')},
                            </p>
                            
                            <!-- Main Message -->
                            <p style="margin: 20px 0;">
                                Click the button below to access your wellness portal. This link will log you in automatically.
                            </p>
                            
                            <!-- Login Button -->
                            <p style="margin: 30px 0; text-align: center;">
                                <a href="{auto_login_url}" 
                                   style="display: inline-block; padding: 15px 40px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: bold;">
                                    ACCESS YOUR PORTAL
                                </a>
                            </p>
                            
                            <!-- Alternative Link -->
                            <p style="margin: 20px 0; font-size: 14px;">
                                If the button doesn't work, copy and paste this link into your browser:<br>
                                <span style="word-break: break-all;">{auto_login_url}</span>
                            </p>
                            
                            <!-- Note -->
                            <p style="margin: 25px 0; padding: 15px; border: 1px solid #cccccc; background-color: #f5f5f5;">
                                <strong>Note:</strong> This link is valid for 7 days. If it expires, you can always log in with your email and password at {frontend_url}/login
                            </p>
                            
                            <!-- Need Help -->
                            <p style="margin: 30px 0;">
                                <strong>Need Help?</strong><br>
                                If you have any questions, please reply to this email or contact our support team.
                            </p>
                            
                            <!-- Footer -->
                            <p style="margin: 30px 0 0 0; padding-top: 20px; border-top: 1px solid #cccccc; font-size: 14px; color: #666666;">
                                Best regards,<br>
                                <strong>Dr. Shumard's Team</strong>
                            </p>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """
        })
        
        logging.info(f"Welcome email resent to {user['email']} via Resend API")
        
        await log_activity(
            event_type="WELCOME_EMAIL_RESENT",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "method": "resend_api"},
            status="success"
        )
        
        return {"message": "Welcome email sent successfully"}
    except Exception as e:
        logging.error(f"Failed to send welcome email via Resend: {e}")
        await log_activity(
            event_type="WELCOME_EMAIL_RESENT",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "error": str(e)},
            status="failure"
        )
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@api_router.post("/admin/user/{user_id}/set-password")
async def set_user_password(user_id: str, request: SetPasswordRequest, admin_user: dict = Depends(get_admin_user)):
    """Set a new password for user and email it to them - Admin only (uses Resend API)"""
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Hash and update password
    hashed_password = get_password_hash(request.password)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hashed_password}})
    
    # Generate auto-login token
    auto_login_token = await create_auto_login_token(user_id, user["email"])
    frontend_url = os.environ.get('FRONTEND_URL', 'https://portal.drshumard.com')
    auto_login_url = f"{frontend_url}/auto-login/{auto_login_token}"
    
    # Send email with new password using Resend API
    try:
        resend.Emails.send({
            "from": "Dr. Shumard Portal <admin@portal.drshumard.com>",
            "to": user["email"],
            "subject": "Your Password Has Been Updated",
            "html": f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 100%);">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); padding: 40px 30px; text-align: center;">
                        <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Logo" style="max-width: 180px; margin-bottom: 15px;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Password Updated</h1>
                    </div>
                    <div style="padding: 30px;">
                        <p style="color: #333; font-size: 16px;">Hello {user.get('name', 'there')},</p>
                        <p style="color: #666; font-size: 15px;">Your password has been updated by an administrator. Here are your new credentials:</p>
                        <div style="background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #99f6e4;">
                            <p style="margin: 8px 0; color: #0f766e;"><strong>Email:</strong> {user['email']}</p>
                            <p style="margin: 8px 0; color: #0f766e;"><strong>New Password:</strong> {request.password}</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{auto_login_url}" style="display: inline-block; background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                                Login Now
                            </a>
                        </div>
                        <p style="color: #999; font-size: 13px; text-align: center;">If you did not request this change, please contact support immediately.</p>
                    </div>
                </div>
            </body>
            </html>
            """
        })
        
        logging.info(f"Password update email sent to {user['email']} via Resend API")
        
        await log_activity(
            event_type="PASSWORD_SET_BY_ADMIN",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "method": "resend_api"},
            status="success"
        )
        
        return {"message": "Password updated and email sent"}
    except Exception as e:
        logging.error(f"Failed to send password email via Resend: {e}")
        await log_activity(
            event_type="PASSWORD_SET_BY_ADMIN",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "error": str(e), "email_sent": False},
            status="partial"
        )
        # Password was still updated, just email failed
        return {"message": f"Password updated but email failed to send: {str(e)}"}

@api_router.post("/admin/user/{user_id}/send-reset-link")
async def send_password_reset_link(user_id: str, admin_user: dict = Depends(get_admin_user)):
    """Send password reset link to user - Admin only (uses Resend API)"""
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate reset token (24 hour validity)
    reset_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # Store reset token
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"reset_token": reset_token, "reset_token_expires": expires_at.isoformat()}}
    )
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://portal.drshumard.com')
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    
    try:
        # Use Resend API
        resend.Emails.send({
            "from": "Dr. Shumard Portal <admin@portal.drshumard.com>",
            "to": user["email"],
            "subject": "Reset Your Password",
            "html": f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 100%);">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%); padding: 40px 30px; text-align: center;">
                        <img src="https://portal-drshumard.b-cdn.net/logo.png" alt="Logo" style="max-width: 180px; margin-bottom: 15px;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Password Reset</h1>
                    </div>
                    <div style="padding: 30px;">
                        <p style="color: #333; font-size: 16px;">Hello {user.get('name', 'there')},</p>
                        <p style="color: #666; font-size: 15px;">A password reset was requested for your account. Click the button below to set a new password:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{reset_url}" style="display: inline-block; background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                                Reset Password
                            </a>
                        </div>
                        <p style="color: #999; font-size: 13px; text-align: center;">This link is valid for 24 hours. If you didn't request this, please ignore this email.</p>
                    </div>
                </div>
            </body>
            </html>
            """
        })
        
        logging.info(f"Password reset link sent to {user['email']} via Resend API")
        
        await log_activity(
            event_type="PASSWORD_RESET_LINK_SENT",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "method": "resend_api"},
            status="success"
        )
        
        return {"message": "Password reset link sent"}
    except Exception as e:
        logging.error(f"Failed to send reset link via Resend: {e}")
        await log_activity(
            event_type="PASSWORD_RESET_LINK_SENT",
            user_email=user["email"],
            user_id=user_id,
            details={"admin_id": admin_user["id"], "error": str(e)},
            status="failure"
        )
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@api_router.put("/admin/user/{user_id}")
async def update_user(user_id: str, request: UpdateUserRequest, admin_user: dict = Depends(get_admin_user)):
    """Update user information - Admin only"""
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update dict with only provided fields
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.email is not None:
        # Normalize email to lowercase
        email_lower = request.email.lower()
        # Check if email is already taken by another user
        existing = await db.users.find_one({"email": email_lower, "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        update_data["email"] = email_lower
    if request.phone is not None:
        update_data["phone"] = request.phone
    if request.first_name is not None:
        update_data["first_name"] = request.first_name
    if request.last_name is not None:
        update_data["last_name"] = request.last_name
    
    if not update_data:
        return {"message": "No changes made"}
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    await log_activity(
        event_type="USER_UPDATED_BY_ADMIN",
        user_email=request.email or user["email"],
        user_id=user_id,
        details={"admin_id": admin_user["id"], "updated_fields": list(update_data.keys())},
        status="success"
    )
    
    return {"message": "User updated successfully", "updated_fields": list(update_data.keys())}

# Support Request Model
class SupportRequest(BaseModel):
    email: EmailStr
    phone: Optional[str] = None
    subject: str
    message: str
    turnstile_token: str

@api_router.post("/support/submit")
async def submit_support_request(request: SupportRequest):
    """
    Submit a support request with Turnstile verification.
    Validates the Turnstile token server-side before forwarding to Zapier.
    """
    import httpx
    
    # Verify Turnstile token with Cloudflare
    if not TURNSTILE_SECRET_KEY:
        logging.error("TURNSTILE_SECRET_KEY not configured")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error. Please contact administrator."
        )
    
    try:
        async with httpx.AsyncClient() as client:
            turnstile_response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": TURNSTILE_SECRET_KEY,
                    "response": request.turnstile_token
                }
            )
            turnstile_result = turnstile_response.json()
            
            logging.info(f"Turnstile verification result: {turnstile_result}")
            
            if not turnstile_result.get("success"):
                error_codes = turnstile_result.get("error-codes", [])
                logging.warning(f"Turnstile verification failed: {error_codes}")
                raise HTTPException(
                    status_code=400,
                    detail="Security verification failed. Please try again."
                )
    except httpx.RequestError as e:
        logging.error(f"Turnstile API request failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Could not verify security token. Please try again."
        )
    
    # Turnstile verified - now forward to Zapier
    try:
        async with httpx.AsyncClient() as client:
            zapier_response = await client.post(
                ZAPIER_SUPPORT_WEBHOOK,
                json={
                    "purchase_email": request.email,
                    "phone_number": request.phone or "",
                    "subject": request.subject,
                    "issue_description": request.message,
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "verified": True  # Indicates Turnstile was verified
                },
                timeout=10.0
            )
            logging.info(f"Zapier webhook response: {zapier_response.status_code}")
    except httpx.RequestError as e:
        logging.error(f"Zapier webhook failed: {e}")
        # Still return success since Turnstile was verified - Zapier might just be slow
        pass
    
    # Log the support request
    await log_activity(
        event_type="SUPPORT_REQUEST_SUBMITTED",
        user_email=request.email,
        details={
            "subject": request.subject,
            "has_phone": bool(request.phone),
            "turnstile_verified": True
        },
        status="success"
    )
    
    return {"message": "Support request submitted successfully"}

# Include routers
app.include_router(api_router)

# Include booking router for the new custom calendar
from booking import router as booking_router
app.include_router(booking_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Pre-populate availability cache on startup for instant loading"""
    try:
        from booking import start_background_refresh
        start_background_refresh()
        logger.info("Started background availability cache refresh")
    except Exception as e:
        logger.warning(f"Could not start background cache refresh: {e}")
    
    # Initialize client cache (SQLite database auto-creates on first access)
    try:
        from services.client_cache import get_client_cache
        cache = get_client_cache()
        logger.info(f"Client cache initialized: {cache.db_path}")
        
        # Note: Client sync requires Practice Better token and runs on-demand
        # To force initial sync, use: python -c "from services.client_sync import ..."
        # or call the /api/admin/sync-clients endpoint
    except Exception as e:
        logger.warning(f"Could not initialize client cache: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    # Stop background cache refresh
    try:
        from booking import stop_background_refresh
        stop_background_refresh()
    except Exception as e:
        logger.warning(f"Error stopping background cache refresh: {e}")
    # Shutdown Practice Better service
    try:
        from services.practice_better_v2 import shutdown_service
        await shutdown_service()
    except Exception as e:
        logger.warning(f"Error shutting down Practice Better service: {e}")