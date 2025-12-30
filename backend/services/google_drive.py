import os
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Path to service account credentials
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service_account.json')
SCOPES = ['https://www.googleapis.com/auth/drive']

# Target folder ID from environment or default (Shared Drive folder)
DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '1tsCj3ZScOgpPJK0WICFZqMPNTYpEZ8-o')

def get_drive_service():
    """Create and return a Google Drive service instance using service account."""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    service = build('drive', 'v3', credentials=credentials)
    return service

def upload_pdf_to_drive(pdf_bytes: bytes, filename: str, folder_id: str = None) -> dict:
    """
    Upload a PDF file to Google Drive Shared Drive using service account.
    
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
        
        # First, get the Shared Drive ID from the folder
        # The folder is in a Shared Drive, so we need to find the driveId
        folder_info = service.files().get(
            fileId=target_folder,
            supportsAllDrives=True,
            fields='driveId'
        ).execute()
        
        drive_id = folder_info.get('driveId')
        
        # File metadata - for Shared Drive uploads
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
        
        # Upload file to Shared Drive
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink',
            supportsAllDrives=True
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
            fields="files(id, name, createdTime)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        
        return results.get('files', [])
        
    except Exception as e:
        print(f"Error listing files: {str(e)}")
        return []
