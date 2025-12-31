"""
Dropbox Service for uploading PDF files to a specific folder.
Uses OAuth2 with refresh tokens for automatic token renewal.
"""

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import WriteMode
import os
import logging

logger = logging.getLogger(__name__)

# Get configuration from environment
DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.environ.get("DROPBOX_APP_SECRET", "")
DROPBOX_REFRESH_TOKEN = os.environ.get("DROPBOX_REFRESH_TOKEN", "")
DROPBOX_UPLOAD_FOLDER = os.environ.get("DROPBOX_UPLOAD_FOLDER", "/Patient Intake Forms")


def get_dropbox_client():
    """
    Create a Dropbox client with automatic token refresh.
    
    Using refresh token allows the SDK to automatically obtain new access tokens
    when they expire (every 4 hours), without requiring user re-authorization.
    """
    if not all([DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN]):
        logger.error("Dropbox credentials not fully configured")
        return None
    
    try:
        dbx = dropbox.Dropbox(
            app_key=DROPBOX_APP_KEY,
            app_secret=DROPBOX_APP_SECRET,
            oauth2_refresh_token=DROPBOX_REFRESH_TOKEN
        )
        return dbx
    except Exception as e:
        logger.error(f"Failed to create Dropbox client: {e}")
        return None


def upload_pdf_to_dropbox(pdf_bytes: bytes, filename: str) -> dict:
    """
    Upload a PDF file to Dropbox.
    
    Args:
        pdf_bytes: Binary content of the PDF file
        filename: Name for the file in Dropbox
        
    Returns:
        dict with success status, dropbox_path, and shared_link (if successful)
    """
    dbx = get_dropbox_client()
    
    if not dbx:
        return {
            "success": False,
            "error": "Dropbox client not configured. Check DROPBOX_APP_KEY, DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN."
        }
    
    try:
        # Verify the connection is valid
        try:
            dbx.users_get_current_account()
        except AuthError as e:
            logger.error(f"Dropbox authentication failed: {e}")
            return {
                "success": False,
                "error": "Dropbox authentication failed - refresh token may be invalid"
            }
        
        # Construct full path (must start with /)
        dropbox_path = f"{DROPBOX_UPLOAD_FOLDER}/{filename}"
        if not dropbox_path.startswith("/"):
            dropbox_path = f"/{dropbox_path}"
        
        logger.info(f"Uploading to Dropbox: {dropbox_path}")
        
        # Upload file to Dropbox
        # Using overwrite mode to replace if file exists
        result = dbx.files_upload(
            pdf_bytes,
            dropbox_path,
            mode=WriteMode("overwrite"),
            autorename=False
        )
        
        logger.info(f"File uploaded successfully: {result.path_display}")
        
        # Try to create a shared link for the file
        shared_link = None
        try:
            # First check if a shared link already exists
            existing_links = dbx.sharing_list_shared_links(path=dropbox_path)
            if existing_links.links:
                shared_link = existing_links.links[0].url
            else:
                # Create a new shared link
                link_metadata = dbx.sharing_create_shared_link_with_settings(dropbox_path)
                shared_link = link_metadata.url
                
            logger.info(f"Shared link created: {shared_link}")
        except ApiError as e:
            # If we can't create a shared link, still consider the upload successful
            logger.warning(f"Could not create shared link: {e}")
            shared_link = None
        
        return {
            "success": True,
            "dropbox_path": result.path_display,
            "shared_link": shared_link,
            "file_id": result.id,
            "size": result.size
        }
        
    except ApiError as e:
        error_message = _handle_api_error(e)
        logger.error(f"Dropbox API error: {error_message}")
        return {
            "success": False,
            "error": error_message
        }
    except Exception as e:
        error_message = f"Unexpected error uploading to Dropbox: {str(e)}"
        logger.error(error_message)
        return {
            "success": False,
            "error": error_message
        }


def _handle_api_error(error: ApiError) -> str:
    """Handle various Dropbox API errors with appropriate messages"""
    error_summary = str(error.error) if hasattr(error, 'error') else str(error)
    
    if "invalid_access_token" in error_summary.lower():
        return "Authentication failed: Invalid or expired access token"
    elif "path/not_found" in error_summary.lower():
        return f"Target folder not found. Please ensure the folder exists in Dropbox."
    elif "path/conflict" in error_summary.lower():
        return "File conflict: A file with this name already exists"
    elif "insufficient_space" in error_summary.lower():
        return "Dropbox storage is full"
    elif "rate_limit" in error_summary.lower():
        return "Rate limit exceeded: Too many requests to Dropbox"
    else:
        return f"Dropbox error: {error_summary}"


def verify_dropbox_connection() -> dict:
    """
    Verify the Dropbox connection is working.
    
    Returns:
        dict with success status and account info or error
    """
    dbx = get_dropbox_client()
    
    if not dbx:
        return {
            "success": False,
            "error": "Dropbox credentials not configured"
        }
    
    try:
        account = dbx.users_get_current_account()
        
        return {
            "success": True,
            "account_name": account.name.display_name,
            "account_email": account.email,
            "upload_folder": DROPBOX_UPLOAD_FOLDER
        }
    except AuthError as e:
        return {
            "success": False,
            "error": f"Authentication failed: {e}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Connection error: {e}"
        }
