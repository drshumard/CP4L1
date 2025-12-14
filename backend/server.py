from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
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
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Resend Configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')

# Webhook Secret
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')

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
    ip_address: str = None
):
    """Log backend activity to MongoDB"""
    log_entry = {
        "timestamp": datetime.now(timezone.utc),
        "event_type": event_type,
        "user_email": user_email,
        "user_id": user_id,
        "details": details or {},
        "status": status,
        "ip_address": ip_address
    }
    try:
        await db.activity_logs.insert_one(log_entry)
    except Exception as e:
        logging.error(f"Failed to log activity: {str(e)}")

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

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
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
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user:
        return {"message": "User already exists", "user_id": existing_user["id"]}
    
    # Build full name from first_name + last_name if provided, otherwise use name field
    if data.first_name and data.last_name:
        full_name = f"{data.first_name} {data.last_name}"
    else:
        full_name = data.name
    
    # Generate simple password using user's name + 2026@ or 2026!
    import random
    # Split name and get first or last name (prefer longer one for better security)
    name_parts = full_name.strip().split()
    if len(name_parts) >= 2:
        # Choose the longer name part
        base_name = max(name_parts, key=len)
    else:
        # Use the full name if only one part
        base_name = name_parts[0] if name_parts else "User"
    
    # Capitalize first letter and add 2026@ or 2026! randomly
    suffix = random.choice(["2026@", "2026!"])
    generated_password = base_name.capitalize() + suffix
    
    # Hash password
    hashed_password = get_password_hash(generated_password)
    
    # Create new user with generated password
    user = User(
        email=data.email,
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
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="color-scheme" content="light only">
                <meta name="supported-color-schemes" content="light">
                <style>
                    body {{
                        margin: 0;
                        padding: 0;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                        background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%);
                    }}
                    .container {{
                        max-width: 600px;
                        margin: 40px auto;
                        background: white;
                        border-radius: 16px;
                        overflow: hidden;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
                    }}
                    .header {{
                        background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
                        padding: 40px 30px;
                        text-align: center;
                    }}
                    .header h1 {{
                        color: white;
                        margin: 0;
                        font-size: 28px;
                        font-weight: 700;
                    }}
                    .content {{
                        padding: 40px 30px;
                    }}
                    .greeting {{
                        font-size: 24px;
                        color: #1e293b;
                        font-weight: 600;
                        margin-bottom: 16px;
                    }}
                    .message {{
                        color: #64748b;
                        font-size: 16px;
                        line-height: 1.6;
                        margin-bottom: 30px;
                    }}
                    .credentials-card {{
                        background: linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 100%);
                        border-radius: 12px;
                        padding: 24px;
                        margin: 24px 0;
                        border: 1px solid #A5F3FC;
                    }}
                    .credentials-title {{
                        color: #0d9488;
                        font-size: 18px;
                        font-weight: 600;
                        margin-bottom: 16px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }}
                    .credential-row {{
                        margin: 12px 0;
                        color: #475569;
                    }}
                    .credential-label {{
                        font-weight: 600;
                        margin-right: 8px;
                        color: #000000;
                    }}
                    .credential-value {{
                        font-family: 'Courier New', monospace;
                        background: white !important;
                        padding: 8px 12px;
                        border-radius: 6px;
                        display: inline-block;
                        font-size: 16px;
                        font-weight: bold;
                        color: #1e293b !important;
                        border: 1px solid #cbd5e1;
                    }}
                    .button {{
                        display: inline-block;
                        margin-top: 24px;
                        padding: 16px 32px;
                        background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 16px;
                        box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
                    }}
                    .button:hover {{
                        background: linear-gradient(135deg, #0f766e 0%, #0e7490 100%);
                    }}
                    .important-note {{
                        background: #fef3c7;
                        border-left: 4px solid #f59e0b;
                        padding: 16px;
                        border-radius: 6px;
                        margin: 24px 0;
                        color: #92400e;
                        font-size: 14px;
                    }}
                    .footer {{
                        background: #f8fafc;
                        padding: 30px;
                        text-align: center;
                        border-top: 1px solid #e2e8f0;
                        color: #94a3b8;
                        font-size: 13px;
                    }}
                    .divider {{
                        height: 1px;
                        background: #e2e8f0;
                        margin: 30px 0;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Your Wellness Portal</h1>
                    </div>
                    
                    <div class="content">
                        <div class="greeting">Hello {data.name}!</div>
                        
                        <p class="message">
                            We're thrilled to have you begin your diabetes wellness journey with us! Your account has been created and is ready to go.
                        </p>
                        
                        <div class="credentials-card">
                            <div class="credentials-title">
                                🔐 Your Login Credentials
                            </div>
                            <div style="margin: 12px 0;">
                                <span style="font-weight: 600; margin-right: 8px; color: #0d9488 !important; -webkit-text-fill-color: #0d9488 !important;">Email:</span>
                                <span class="credential-value">{data.email}</span>
                            </div>
                            <div style="margin: 12px 0;">
                                <span style="font-weight: 600; margin-right: 8px; color: #0d9488 !important; -webkit-text-fill-color: #0d9488 !important;">Password:</span>
                                <span class="credential-value">{generated_password}</span>
                            </div>
                        </div>
                        
                        <div class="important-note">
                            <strong>⚠️ Important:</strong> Please save this password securely. You can change it anytime after logging in to your account settings.
                        </div>
                        
                        <center>
                            <a href="{auto_login_url}" class="button">
                                Access Your Portal Now →
                            </a>
                        </center>
                        
                        <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 12px;">
                            This link will automatically log you in and is valid for 7 days.
                        </p>
                        
                        <div class="divider"></div>
                        
                        <p class="message" style="margin-bottom: 0;">
                            <strong>What's Next?</strong><br>
                            Click the button above to access your personalized wellness portal and begin your 3-step journey to better health.
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p style="margin: 0 0 8px 0;">Dr. Jason Shumard Wellness Portal</p>
                        <p style="margin: 0;">If you have any questions, our support team is here to help.</p>
                    </div>
                </div>
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
    
    # Check if user exists with this email
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
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
    
    # Log appointment creation/update
    await log_activity(
        event_type="APPOINTMENT_BOOKED",
        user_email=data.email,
        user_id=user["id"] if user else None,
        details={
            "booking_id": data.booking_id,
            "session_date": data.session_date,
            "action": action,
            "matched_by": matched_by
        },
        status="success"
    )
    
    return {
        "message": f"Appointment {action} successfully",
        "booking_id": data.booking_id,
        "user_found": user is not None,
        "matched_by": matched_by
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
    
    # Initial wait: 10 seconds to give webhook time to process
    logging.info(f"Signup request for {request.email}. Waiting 10 seconds for webhook processing...")
    await asyncio.sleep(10)
    
    # Retry logic: Check for user with 5-second intervals for up to 30 seconds (6 retries)
    max_retries = 6
    retry_delay = 5
    user = None
    
    for attempt in range(max_retries + 1):
        user = await db.users.find_one({"email": request.email}, {"_id": 0})
        
        if user:
            logging.info(f"User {request.email} found after {attempt} retries")
            break
        
        if attempt < max_retries:
            logging.info(f"User {request.email} not found yet. Retry {attempt + 1}/{max_retries} in {retry_delay} seconds...")
            await asyncio.sleep(retry_delay)
    
    # After all retries, if still no user, raise error
    if not user:
        logging.error(f"User {request.email} not found after {max_retries} retries (total wait: {10 + (max_retries * retry_delay)} seconds)")
        await log_activity(
            event_type="SIGNUP_FAILED",
            user_email=request.email,
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
        details={"auto_login": True, "session_duration_minutes": ACCESS_TOKEN_EXPIRE_MINUTES},
        status="success"
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user or not user.get("password_hash"):
        await log_activity(
            event_type="LOGIN_FAILED",
            user_email=request.email,
            details={"reason": "user_not_found_or_no_password"},
            status="failure"
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
            status="failure"
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
        status="success"
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
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
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        await db.users.update_one(
            {"email": request.email},
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
    
    # Advance to next step (max 3)
    next_step = min(current_step + 1, 3)
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
    limit: int = 100,
    event_type: str = None,
    user_email: str = None
):
    """Get activity logs with optional filtering"""
    query = {}
    
    if event_type:
        query["event_type"] = event_type
    
    if user_email:
        query["user_email"] = user_email
    
    logs = await db.activity_logs.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # Convert datetime objects to ISO strings for JSON serialization
    for log in logs:
        if isinstance(log.get("timestamp"), datetime):
            log["timestamp"] = log["timestamp"].isoformat()
    
    # Get unique event types for filtering
    event_types = await db.activity_logs.distinct("event_type")
    
    return {
        "logs": logs,
        "event_types": event_types,
        "total_count": await db.activity_logs.count_documents(query)
    }

@api_router.post("/admin/user/{user_id}/reset")
async def reset_user_progress(user_id: str, admin_user: dict = Depends(get_admin_user)):
    # Reset user to step 1
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": 1}}
    )
    
    # Delete all progress
    await db.user_progress.delete_many({"user_id": user_id})
    
    return {"message": "User progress reset successfully"}

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
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.get("role") == "admin":
        return {"message": "User is already an admin", "email": email}
    
    await db.users.update_one(
        {"email": email},
        {"$set": {"role": "admin"}}
    )
    
    return {"message": "User promoted to admin successfully", "email": email}

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

# Include router
app.include_router(api_router)

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