"""
Dropbox integration - upload PDFs to practitioner > patient folder structure.
Uses OAuth2 refresh token for automatic token renewal.

Structure:
  /FM Protocol/
  ├── {Practitioner Name}/
  │   ├── {Patient Name}/
  │   │   ├── Patient - Name - Program Step.pdf
  │   │   └── HC - Name - Program Step.pdf
"""
import os
import dropbox
from dropbox.exceptions import ApiError

DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.environ.get("DROPBOX_APP_SECRET", "")
DROPBOX_REFRESH_TOKEN = os.environ.get("DROPBOX_REFRESH_TOKEN", "")
DROPBOX_ROOT = os.environ.get("DROPBOX_UPLOAD_FOLDER", "/FM Protocol")


def _get_client():
    """Create Dropbox client with auto-refreshing token."""
    if not DROPBOX_APP_KEY or not DROPBOX_REFRESH_TOKEN:
        raise Exception("Dropbox credentials not configured")
    return dropbox.Dropbox(
        app_key=DROPBOX_APP_KEY,
        app_secret=DROPBOX_APP_SECRET,
        oauth2_refresh_token=DROPBOX_REFRESH_TOKEN,
    )


def _ensure_folder(dbx, path):
    """Create folder if it doesn't exist. Returns the path."""
    try:
        dbx.files_get_metadata(path)
    except ApiError as e:
        if e.error.is_path() and e.error.get_path().is_not_found():
            dbx.files_create_folder_v2(path)
        else:
            raise
    return path


def _safe_name(name):
    """Sanitize a name for use in file/folder paths."""
    return name.replace("/", "-").replace("\\", "-").replace(":", "-").strip()


def get_practitioner_folder(dbx, practitioner_name):
    """Get or create the practitioner's folder. Returns path."""
    safe = _safe_name(practitioner_name)
    path = f"{DROPBOX_ROOT}/{safe}"
    return _ensure_folder(dbx, path)


def get_patient_folder(dbx, practitioner_folder, patient_name):
    """Get or create a patient folder inside practitioner's folder. Returns path."""
    safe = _safe_name(patient_name)
    path = f"{practitioner_folder}/{safe}"
    return _ensure_folder(dbx, path)


def upload_pdf(practitioner_name, patient_name, filename, pdf_bytes):
    """Upload a PDF to Dropbox: /FM Protocol/{Practitioner}/{Patient}/{filename}"""
    dbx = _get_client()
    prac_folder = get_practitioner_folder(dbx, practitioner_name)
    patient_folder = get_patient_folder(dbx, prac_folder, patient_name)
    
    safe_filename = _safe_name(filename)
    file_path = f"{patient_folder}/{safe_filename}"
    
    # Overwrite if exists (WriteMode.overwrite)
    result = dbx.files_upload(
        pdf_bytes,
        file_path,
        mode=dropbox.files.WriteMode.overwrite,
        mute=True,
    )
    
    # Create a shared link for the file
    try:
        links = dbx.sharing_list_shared_links(path=file_path).links
        if links:
            web_link = links[0].url
        else:
            shared = dbx.sharing_create_shared_link_with_settings(file_path)
            web_link = shared.url
    except Exception:
        web_link = None
    
    return {
        "file_path": result.path_display,
        "filename": safe_filename,
        "web_link": web_link,
        "size": result.size,
    }
