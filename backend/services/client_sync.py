"""
Client Synchronization Service

Syncs client records from Practice Better API to local cache.
Supports background tasks and on-demand syncing.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Callable, List

import httpx

from services.client_cache import ClientCache, get_client_cache

logger = logging.getLogger(__name__)


class ClientSyncService:
    """
    Syncs Practice Better client records to local cache.
    
    Usage:
        sync_service = ClientSyncService(
            base_url="https://api.practicebetter.io",
            token_getter=token_manager.get_token
        )
        await sync_service.sync_all_clients()
    """
    
    def __init__(
        self,
        base_url: str,
        token_getter: Callable,
        cache: ClientCache = None
    ):
        self.base_url = base_url
        self.token_getter = token_getter
        self.cache = cache or get_client_cache()
        self._sync_lock = asyncio.Lock()
        self._is_syncing = False
    
    async def fetch_clients_page(
        self,
        limit: int = 100,
        after_id: str = None,
        before_id: str = None
    ) -> Dict:
        """Fetch a page of client records from Practice Better"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self.token_getter(client)
            
            params = {
                "type": "client",
                "status": "active",
                "limit": limit
            }
            
            if after_id:
                params["afterId"] = after_id
            if before_id:
                params["beforeId"] = before_id
            
            response = await client.get(
                f"{self.base_url}/consultant/records",
                headers={
                    "Authorization": f"Bearer {token}"
                },
                params=params
            )
            response.raise_for_status()
            
            return response.json()
    
    async def sync_all_clients(
        self,
        progress_callback: Callable[[int, int], None] = None
    ) -> Dict:
        """
        Sync all client records from Practice Better.
        
        Args:
            progress_callback: Optional callback(synced_count, total) for progress updates
            
        Returns:
            Dict with sync status and counts
        """
        if self._is_syncing:
            return {"status": "already_running"}
        
        async with self._sync_lock:
            self._is_syncing = True
            
            try:
                total_synced = 0
                last_id = None
                
                while True:
                    data = await self.fetch_clients_page(
                        limit=100,
                        after_id=last_id
                    )
                    
                    items = data.get("items", [])
                    
                    if not items:
                        break
                    
                    synced = self.cache.upsert_clients_batch(items)
                    total_synced += synced
                    last_id = items[-1].get("id")
                    
                    if progress_callback:
                        progress_callback(total_synced, None)
                    
                    await asyncio.sleep(0.1)
                
                self.cache.update_sync_state(
                    last_record_id=last_id,
                    total_records=total_synced
                )
                
                logger.info(f"Client sync complete: {total_synced} records")
                
                return {
                    "status": "complete",
                    "total_synced": total_synced,
                    "synced_at": datetime.utcnow().isoformat()
                }
                
            finally:
                self._is_syncing = False
    
    async def sync_recent_clients(self, limit: int = 50) -> Dict:
        """Sync only recently updated clients since last sync"""
        sync_info = self.cache.get_last_sync_info()
        last_record_id = sync_info.get("last_record_id")
        
        try:
            data = await self.fetch_clients_page(
                limit=limit,
                after_id=last_record_id
            )
            
            items = data.get("items", [])
            
            if items:
                synced = self.cache.upsert_clients_batch(items)
                new_last_id = items[-1].get("id")
                
                self.cache.update_sync_state(
                    last_record_id=new_last_id,
                    total_records=self.cache.get_total_cached_clients()
                )
                
                logger.info(f"Synced {synced} recent clients")
                
                return {
                    "status": "complete",
                    "synced": synced
                }
            
            return {"status": "complete", "synced": 0}
        
        except Exception as e:
            logger.error(f"Error syncing recent clients: {e}")
            return {"status": "error", "error": str(e)}
    
    async def lookup_client_by_email(self, email: str) -> Optional[Dict]:
        """
        Look up a client by email, checking cache first then API.
        
        Returns:
            Client record dict or None
        """
        cached = self.cache.get_client_by_email(email)
        if cached:
            logger.debug(f"Found client in cache: {email}")
            return cached
        
        if self.cache.needs_sync(max_age_minutes=30):
            await self.sync_recent_clients()
            
            cached = self.cache.get_client_by_email(email)
            if cached:
                return cached
        
        return None
    
    def get_cached_client_by_email(self, email: str) -> Optional[Dict]:
        """
        Synchronous cache lookup only (no API call).
        Use this when you need a quick check.
        """
        return self.cache.get_client_by_email(email)


# Global sync service instance
_sync_service: Optional[ClientSyncService] = None


def get_client_sync_service(
    base_url: str = None,
    token_getter = None
) -> Optional[ClientSyncService]:
    """Get the global sync service instance"""
    global _sync_service
    return _sync_service


def init_client_sync_service(base_url: str, token_getter) -> ClientSyncService:
    """Initialize the global sync service"""
    global _sync_service
    _sync_service = ClientSyncService(base_url, token_getter)
    return _sync_service
