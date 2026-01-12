from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
        # Mark booking task as complete
        progress = await db.progress.find_one({"user_id": user["id"]}, {"_id": 0})
        if progress:
            step_progress = next(
                (p for p in progress.get("progress", []) if p["step_number"] == 1),
                None
            )
            if step_progress and "book_consultation" not in step_progress.get("tasks_completed", []):
                step_progress["tasks_completed"].append("book_consultation")
                await db.progress.update_one(
                    {"user_id": user["id"]},
                    {"$set": {"progress": progress["progress"]}}
                )
        
        # Advance to step 2
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"current_step": 2}}
        )
        await db.progress.update_one(
            {"user_id": user["id"]},
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
    
    # First try to find appointment by user_id
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
        # Get fresh user data to check for secondary_email
        user_data = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
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
        await db.progress.update_one(
            {"user_id": user["id"]},
            {"$set": {"current_step": 1}}
        )
        
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
        current_step=current_user["current_step"],
        role=current_user.get("role", "user")  # Default to 'user' if role not present
    )

@api_router.get("/user/progress")
async def get_user_progress(current_user: dict = Depends(get_current_user)):
    progress = await db.user_progress.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    return {"current_step": current_user["current_step"], "progress": progress}

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
    
    # Mark current step as completed
    await db.user_progress.update_one(
        {"user_id": user_id, "step_number": current_step},
        {"$set": {"completed_at": datetime.now(timezone.utc).isoformat()}},
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
    
    # Prepare submission data
    submission_data = {
        "user_id": user_id,
        "user_email": user_email,
        "user_name": user_name,
        "form_data": request.form_data,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "status": "submitted",
        "ip_address": ip_address
    }
    
    # Generate PDF
    pdf_result = None
    dropbox_result = None
    drive_result = None
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
        pdf_bytes = create_intake_form_pdf(request.form_data, user_name, user_email)
        
        # Generate filename: Legal Name Diabetes Intake Form.pdf
        filename = f"{pdf_name} Diabetes Intake Form.pdf"
        
        # Upload to Dropbox
        dropbox_result = upload_pdf_to_dropbox(pdf_bytes, filename)
        
        if dropbox_result.get("success"):
            submission_data["pdf_dropbox_path"] = dropbox_result.get("dropbox_path")
            submission_data["pdf_dropbox_link"] = dropbox_result.get("shared_link")
            print(f"PDF uploaded to Dropbox: {filename}")
        else:
            print(f"Dropbox upload failed: {dropbox_result.get('error')}")
        
        # Upload to Google Drive
        drive_result = upload_pdf_to_drive(pdf_bytes, filename)
        
        if drive_result.get("success"):
            submission_data["pdf_drive_file_id"] = drive_result.get("file_id")
            submission_data["pdf_drive_link"] = drive_result.get("web_view_link")
            print(f"PDF uploaded to Google Drive: {filename}")
        else:
            print(f"Google Drive upload failed: {drive_result.get('error')}")
        
        # Set common filename
        submission_data["pdf_filename"] = filename
        
        # Consider upload successful if at least one service worked
        upload_success = dropbox_result.get("success") or drive_result.get("success")
        
        if upload_success:
            
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
                    else:
                        print(f"Zapier webhook failed: {webhook_response.status_code} - {webhook_response.text}")
                        
            except Exception as webhook_error:
                print(f"Error sending Zapier webhook: {str(webhook_error)}")
                # Continue even if webhook fails
        else:
            print(f"Failed to upload PDF to both services")
            
    except Exception as e:
        print(f"Error generating/uploading PDF: {str(e)}")
        # Continue with submission even if PDF fails
    
    # Update the intake form record
    await db.intake_forms.update_one(
        {"user_id": user_id},
        {"$set": submission_data},
        upsert=True
    )
    
    # Also store in a separate submissions collection for admin review
    submission_id = str(uuid.uuid4())
    await db.intake_form_submissions.insert_one({
        **submission_data,
        "submission_id": submission_id
    })
    
    # Log the submission
    await log_activity(
        event_type="INTAKE_FORM_SUBMITTED",
        user_email=user_email,
        user_id=user_id,
        details={
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
    
    return {
        "message": "Form submitted successfully",
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
    return {"users": users}

@api_router.get("/admin/analytics")
async def get_analytics(admin_user: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    
    # Count users by step
    step_distribution = {}
    for step in range(1, 8):
        count = await db.users.count_documents({"current_step": step})
        step_distribution[f"step_{step}"] = count
    
    # Count completed steps
    completed_steps = await db.user_progress.count_documents({"completed_at": {"$ne": None}})
    
    return {
        "total_users": total_users,
        "step_distribution": step_distribution,
        "completed_steps": completed_steps
    }

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
    
    # Reset user to step 1
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": 1}}
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
            "preserved_fields": list(preserved_data.keys())
        },
        status="success"
    )
    
    return {
        "message": "User progress and intake form reset successfully",
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
    
    # Also update progress collection
    await db.progress.update_one(
        {"user_id": user_id},
        {"$set": {"current_step": request.step}}
    )
    
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
    reset_token = str(uuid4())
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    # Shutdown Practice Better service
    try:
        from services.practice_better_v2 import shutdown_service
        await shutdown_service()
    except Exception as e:
        logger.warning(f"Error shutting down Practice Better service: {e}")