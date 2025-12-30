import os
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Path to service account credentials
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service_account.json')
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Target folder ID from environment or default
DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '1TPYIRtU47rNsUuY2YRqIEvSUJJUf8MPj')

def get_drive_service():
    """Create and return a Google Drive service instance using service account."""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    service = build('drive', 'v3', credentials=credentials)
    return service

def upload_pdf_to_drive(pdf_bytes: bytes, filename: str, folder_id: str = None) -> dict:
    """
    Upload a PDF file to Google Drive using service account.
    
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
        
        # File metadata - for Shared Drive, use supportsAllDrives
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
        
        # Upload file with supportsAllDrives for Shared Drive support
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
        print(f"Error uploading to Google Drive: {str(e)}")
        return {
            'success': False,
            'error': str(e)
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
