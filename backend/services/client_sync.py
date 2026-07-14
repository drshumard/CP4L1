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
        # Share the booking service's token bucket so sync + bookings together stay under PB's limit.
        from services.practice_better_v2 import get_pb_rate_limiter
        await get_pb_rate_limiter().acquire()
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self.token_getter(client)
            
            params = {"limit": limit}
            
            if after_id:
                params["after_id"] = after_id
            if before_id:
                params["before_id"] = before_id
            
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
                newest_id = None  # first record of the first page = newest overall -> the bookmark
                seen_ids: set = set()
                max_pages = 100  # Safety: 100 × 100 = 10,000 clients max

                for page in range(max_pages):
                    # PB returns records newest-first; use before_id to walk toward older pages.
                    data = await self.fetch_clients_page(
                        limit=100,
                        before_id=last_id
                    )

                    items = data.get("items", [])

                    if not items:
                        break

                    if newest_id is None:
                        newest_id = items[0].get("id")

                    # Check for duplicate IDs to detect infinite loop
                    first_id = items[0].get("id")
                    if first_id in seen_ids:
                        logger.warning(f"Pagination looping detected at page {page}, breaking")
                        break
                    for item in items:
                        seen_ids.add(item.get("id"))

                    synced = self.cache.upsert_clients_batch(items)
                    total_synced += synced

                    last_id = items[-1].get("id")

                    if progress_callback:
                        progress_callback(total_synced, None)

                    # If we got fewer items than the limit, this is the last page
                    if len(items) < 100:
                        break
                    # Pacing is handled by the shared PB rate limiter — no extra sleep needed.

                # Bookmark the NEWEST id so the incremental sync only pulls clients created after it.
                self.cache.update_sync_state(
                    last_record_id=newest_id,
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
    
    async def sync_recent_clients(self, max_pages: int = 5) -> Dict:
        """Pull only clients created since the last sync — the cache already holds the older ones.
        PB returns newest-first, so we read from the newest and stop as soon as we reach the
        bookmarked id, then advance the bookmark to the newest id seen. Falls back to a full seed
        if there's no bookmark yet."""
        bookmark = (self.cache.get_last_sync_info() or {}).get("last_record_id")
        if not bookmark:
            return await self.sync_all_clients()

        new_items = []
        newest_id = None
        before_id = None
        try:
            for _ in range(max_pages):
                data = await self.fetch_clients_page(limit=100, before_id=before_id)
                items = data.get("items", [])
                if not items:
                    break
                if newest_id is None:
                    newest_id = items[0].get("id")  # newest overall -> next bookmark
                reached_bookmark = False
                for item in items:
                    if item.get("id") == bookmark:
                        reached_bookmark = True
                        break
                    new_items.append(item)
                if reached_bookmark or len(items) < 100:
                    break
                before_id = items[-1].get("id")

            if new_items:
                self.cache.upsert_clients_batch(new_items)
            if newest_id and newest_id != bookmark:
                self.cache.update_sync_state(
                    last_record_id=newest_id,
                    total_records=self.cache.get_total_cached_clients(),
                )
            logger.info(f"Synced {len(new_items)} new clients (incremental)")
            return {"status": "complete", "synced": len(new_items)}
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
