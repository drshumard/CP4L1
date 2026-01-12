"""
Client Cache Service using SQLite

Provides local caching of Practice Better client records to:
- Speed up client lookups
- Reduce API calls
- Handle duplicate email detection
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class ClientCache:
    """SQLite-based cache for Practice Better clients"""
    
    def __init__(self, db_path: str = "client_cache.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize database schema"""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    record_id TEXT PRIMARY KEY,
                    email TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    phone TEXT,
                    status TEXT,
                    created_at TEXT,
                    modified_at TEXT,
                    synced_at TEXT
                )
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_clients_email 
                ON clients(email)
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sync_state (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    last_sync TEXT,
                    last_record_id TEXT,
                    total_records INTEGER DEFAULT 0
                )
            """)
            
            conn.execute("""
                INSERT OR IGNORE INTO sync_state (id) VALUES (1)
            """)
            
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with context manager"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def get_client_by_email(self, email: str) -> Optional[Dict]:
        """
        Look up client by email.
        Returns most recently modified record if duplicates exist.
        """
        normalized_email = email.lower().strip()
        
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM clients 
                WHERE LOWER(email) = ? 
                ORDER BY modified_at DESC, created_at DESC
                LIMIT 1
            """, (normalized_email,))
            
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def get_client_by_record_id(self, record_id: str) -> Optional[Dict]:
        """Look up client by Practice Better record ID"""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM clients WHERE record_id = ?",
                (record_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def upsert_client(self, client: Dict) -> bool:
        """Insert or update a single client record"""
        try:
            profile = client.get("profile", {})
            
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO clients (
                        record_id, email, first_name, last_name, phone,
                        status, created_at, modified_at, synced_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(record_id) DO UPDATE SET
                        email = excluded.email,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        phone = excluded.phone,
                        status = excluded.status,
                        modified_at = excluded.modified_at,
                        synced_at = excluded.synced_at
                """, (
                    client.get("id"),
                    profile.get("emailAddress", "").lower().strip() if profile.get("emailAddress") else None,
                    profile.get("firstName"),
                    profile.get("lastName"),
                    profile.get("mobilePhone"),
                    client.get("status"),
                    client.get("dateCreated"),
                    client.get("dateModified"),
                    datetime.utcnow().isoformat()
                ))
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error upserting client {client.get('id')}: {e}")
            return False
    
    def upsert_clients_batch(self, clients: List[Dict]) -> int:
        """Insert or update multiple client records"""
        count = 0
        
        with self._get_connection() as conn:
            for client in clients:
                try:
                    profile = client.get("profile", {})
                    
                    conn.execute("""
                        INSERT INTO clients (
                            record_id, email, first_name, last_name, phone,
                            status, created_at, modified_at, synced_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(record_id) DO UPDATE SET
                            email = excluded.email,
                            first_name = excluded.first_name,
                            last_name = excluded.last_name,
                            phone = excluded.phone,
                            status = excluded.status,
                            modified_at = excluded.modified_at,
                            synced_at = excluded.synced_at
                    """, (
                        client.get("id"),
                        profile.get("emailAddress", "").lower().strip() if profile.get("emailAddress") else None,
                        profile.get("firstName"),
                        profile.get("lastName"),
                        profile.get("mobilePhone"),
                        client.get("status"),
                        client.get("dateCreated"),
                        client.get("dateModified"),
                        datetime.utcnow().isoformat()
                    ))
                    count += 1
                except Exception as e:
                    logger.warning(f"Error inserting client {client.get('id')}: {e}")
            
            conn.commit()
        
        return count
    
    def get_last_sync_info(self) -> Dict:
        """Get information about the last sync"""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM sync_state WHERE id = 1"
            )
            row = cursor.fetchone()
            return dict(row) if row else {}
    
    def update_sync_state(self, last_record_id: str = None, total_records: int = None):
        """Update the sync state"""
        with self._get_connection() as conn:
            updates = ["last_sync = ?"]
            params = [datetime.utcnow().isoformat()]
            
            if last_record_id:
                updates.append("last_record_id = ?")
                params.append(last_record_id)
            
            if total_records is not None:
                updates.append("total_records = ?")
                params.append(total_records)
            
            conn.execute(
                f"UPDATE sync_state SET {', '.join(updates)} WHERE id = 1",
                params
            )
            conn.commit()
    
    def get_total_cached_clients(self) -> int:
        """Get count of cached clients"""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM clients")
            return cursor.fetchone()[0]
    
    def needs_sync(self, max_age_minutes: int = 60) -> bool:
        """Check if cache needs to be synced"""
        sync_info = self.get_last_sync_info()
        last_sync = sync_info.get("last_sync")
        
        if not last_sync:
            return True
        
        try:
            last_sync_dt = datetime.fromisoformat(last_sync)
            age = datetime.utcnow() - last_sync_dt
            return age > timedelta(minutes=max_age_minutes)
        except:
            return True


# Global cache instance
_client_cache: Optional[ClientCache] = None


def get_client_cache(db_path: str = "client_cache.db") -> ClientCache:
    """Get or create the global client cache instance"""
    global _client_cache
    if _client_cache is None:
        _client_cache = ClientCache(db_path)
    return _client_cache
