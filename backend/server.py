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
async def ghl_webhook(data: GHLWebhookData):
    """Receive webhook from GHL after purchase"""
    # Check if user already exists
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user:
        return {"message": "User already exists", "user_id": existing_user["id"]}
    
    # Create new user with empty password (to be set during signup)
    user = User(
        email=data.email,
        name=data.name,
        password_hash=""  # Will be set when user creates password
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    return {"message": "User created successfully", "user_id": user.id}

@api_router.post("/auth/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    """Complete signup by setting password"""
    # Check if user exists (from GHL webhook)
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found. Please complete purchase first."
        )
    
    if user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account already activated. Please login."
        )
    
    # Update user with password and name
    hashed_password = get_password_hash(request.password)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"password_hash": hashed_password, "name": request.name}}
    )
    
    # Create tokens
    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user or not user.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    access_token = create_access_token(
        data={"sub": user["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    
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
                "from": "DrJason Portal <noreply@drjasonshumard.com>",
                "to": request.email,
                "subject": "Password Reset Request",
                "html": f"""
                <html>
                    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Password Reset Request</h2>
                        <p>You requested to reset your password. Click the button below to reset it:</p>
                        <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
                        <p>This link will expire in 1 hour.</p>
                        <p>If you didn't request this, please ignore this email.</p>
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
        role=current_user["role"]
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
    
    # Advance to next step (max 7)
    next_step = min(current_step + 1, 7)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"current_step": next_step}}
    )
    
    return {"message": "Advanced to next step", "current_step": next_step}

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