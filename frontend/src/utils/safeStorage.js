/**
 * Safe localStorage wrapper that handles Safari private mode
 * and other edge cases where localStorage is unavailable
 */

// In-memory fallback for when localStorage is unavailable
const memoryStorage = new Map();

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

const storageAvailable = isLocalStorageAvailable();

if (!storageAvailable) {
  console.warn('localStorage is not available. Using in-memory fallback. Data will not persist across page reloads.');
}

/**
 * Safely get an item from storage
 * @param {string} key - The key to retrieve
 * @returns {string|null} - The value or null if not found
 */
export function safeGetItem(key) {
  try {
    if (storageAvailable) {
      return window.localStorage.getItem(key);
    }
    return memoryStorage.get(key) || null;
  } catch (e) {
    console.warn(`Failed to get ${key} from storage:`, e);
    return memoryStorage.get(key) || null;
  }
}

/**
 * Safely set an item in storage
 * @param {string} key - The key to set
 * @param {string} value - The value to store
 * @returns {boolean} - Whether the operation succeeded
 */
export function safeSetItem(key, value) {
  try {
    if (storageAvailable) {
      window.localStorage.setItem(key, value);
    }
    // Always set in memory as backup
    memoryStorage.set(key, value);
    return true;
  } catch (e) {
    console.warn(`Failed to set ${key} in storage:`, e);
    memoryStorage.set(key, value);
    return false;
  }
}

/**
 * Safely remove an item from storage
 * @param {string} key - The key to remove
 */
export function safeRemoveItem(key) {
  try {
    if (storageAvailable) {
      window.localStorage.removeItem(key);
    }
    memoryStorage.delete(key);
  } catch (e) {
    console.warn(`Failed to remove ${key} from storage:`, e);
    memoryStorage.delete(key);
  }
}

/**
 * Safely clear all storage
 */
export function safeClear() {
  try {
    if (storageAvailable) {
      window.localStorage.clear();
    }
    memoryStorage.clear();
  } catch (e) {
    console.warn('Failed to clear storage:', e);
    memoryStorage.clear();
  }
}

/**
 * Check if storage is using fallback mode
 * @returns {boolean}
 */
export function isUsingFallback() {
  return !storageAvailable;
}

export default {
  getItem: safeGetItem,
  setItem: safeSetItem,
  removeItem: safeRemoveItem,
  clear: safeClear,
  isUsingFallback
};
