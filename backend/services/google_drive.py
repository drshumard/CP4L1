import os
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Path to service account credentials
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service_account.json')
SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']

# Target folder ID from environment (personal Drive folder)
DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '1TPYIRtU47rNsUuY2YRqIEvSUJJUf8MPj')

# User email to impersonate for domain-wide delegation
IMPERSONATE_USER = os.environ.get('GOOGLE_DRIVE_IMPERSONATE_USER', 'drjason@drshumard.com')

def get_drive_service():
    """Create and return a Google Drive service instance using service account with domain-wide delegation."""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    
    # Impersonate the user for domain-wide delegation to access their personal Drive
    delegated_credentials = credentials.with_subject(IMPERSONATE_USER)
    
    service = build('drive', 'v3', credentials=delegated_credentials)
    return service

def upload_pdf_to_drive(pdf_bytes: bytes, filename: str, folder_id: str = None) -> dict:
    """
    Upload a PDF file to Google Drive using domain-wide delegation.
    
    Args:
        pdf_bytes: The PDF file content as bytes
        filename: The name for the file in Google Drive
        folder_id: Optional folder ID (defaults to DRIVE_FOLDER_ID)
    
    Returns:
        dict with file_id and web_view_link
    """
    try:
        service = get_drive_service()
        
        # Use provided folder_id or default
        target_folder = folder_id or DRIVE_FOLDER_ID
        
        # File metadata for personal Drive upload
        file_metadata = {
            'name': filename,
            'parents': [target_folder]
        }
        
        # Create media upload
        media = MediaIoBaseUpload(
            io.BytesIO(pdf_bytes),
            mimetype='application/pdf',
            resumable=True
        )
        
        # Upload file to personal Drive (no supportsAllDrives needed)
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        return {
            'success': True,
            'file_id': file.get('id'),
            'web_view_link': file.get('webViewLink'),
            'filename': filename
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error uploading to Google Drive: {error_msg}")
        return {
            'success': False,
            'error': error_msg
        }

def list_files_in_folder(folder_id: str = None) -> list:
    """List files in a Google Drive folder."""
    try:
        service = get_drive_service()
        target_folder = folder_id or DRIVE_FOLDER_ID
        
        results = service.files().list(
            q=f"'{target_folder}' in parents",
            pageSize=100,
            fields="files(id, name, createdTime)"
        ).execute()
        
        return results.get('files', [])
        
    except Exception as e:
        print(f"Error listing files: {str(e)}")
        return []
