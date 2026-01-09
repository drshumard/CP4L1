import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { Button } from './ui/button';
import axios from 'axios';
import { trackEvent } from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Practice Better iframe URLs
const PRACTICE_BETTER_URLS = {
  booking: 'https://drshumard.practicebetter.io/?fl_wtc=0D9488&fl_wtac=0891B2#/601a127b2a9c2406dcc94437/widgets/bookings?r=6957cec7123f30c97213ee38',
  form: 'https://drshumard.practicebetter.io/?fl_wtc=0D9488&fl_wtac=0891B2#/601a127b2a9c2406dcc94437/widgets/forms?f=6021e5d42a9c2406f45aa20f'
};

// Direct links for fallback (opens in new tab)
const FALLBACK_URLS = {
  booking: 'https://drshumard.practicebetter.io/#/601a127b2a9c2406dcc94437/bookings?r=6957cec7123f30c97213ee38',
  form: 'https://drshumard.practicebetter.io/#/601a127b2a9c2406dcc94437/forms?f=6021e5d42a9c2406f45aa20f'
};

// Storage keys
const STORAGE_KEY_PREFIX = 'pb_form_data_';
const getStorageKey = (type, userId) => `${STORAGE_KEY_PREFIX}${type}_${userId || 'anonymous'}`;

const PracticeBetterEmbed = ({ 
  type = 'booking', // 'booking' or 'form'
  onLoad,
  onError,
  className = '',
  minHeight = 800,
  fillContainer = false, // When true, iframe fills container height instead of using minHeight
  userId = null // User ID for backend storage
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [iframeHeight, setIframeHeight] = useState(type === 'form' ? 1200 : minHeight);
  const [capturedData, setCapturedData] = useState({});
  const [lastSaved, setLastSaved] = useState(null);
  const [isInView, setIsInView] = useState(false);
  const [timeOnEmbed, setTimeOnEmbed] = useState(0);
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const timeTrackingRef = useRef(null);
  const pageLoadTimeRef = useRef(Date.now());
  const maxRetries = 3;

  const iframeUrl = PRACTICE_BETTER_URLS[type];
  const fallbackUrl = FALLBACK_URLS[type];
  const storageKey = getStorageKey(type, userId);

  // Track scroll to iframe section using Intersection Observer
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isInView) {
            setIsInView(true);
            trackEvent('iframe_scrolled_into_view', {
              iframe_type: type,
              time_to_scroll_seconds: Math.round((Date.now() - pageLoadTimeRef.current) / 1000)
            });
          }
        });
      },
      { threshold: 0.5 } // Trigger when 50% of iframe is visible
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [type, isInView]);

  // Track time spent on page with iframe
  useEffect(() => {
    // Start tracking time when component mounts
    timeTrackingRef.current = setInterval(() => {
      setTimeOnEmbed(prev => prev + 1);
    }, 1000);

    // Track time when user leaves the page
    const handleBeforeUnload = () => {
      trackEvent('iframe_time_spent', {
        iframe_type: type,
        time_spent_seconds: timeOnEmbed,
        iframe_loaded: !loading && !error
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timeTrackingRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Track time when component unmounts (navigation)
      if (timeOnEmbed > 5) { // Only track if spent more than 5 seconds
        trackEvent('iframe_time_spent', {
          iframe_type: type,
          time_spent_seconds: timeOnEmbed,
          iframe_loaded: !loading && !error
        });
      }
    };
  }, [type, loading, error, timeOnEmbed]);

  // Track time milestones (30s, 1min, 2min, 5min)
  useEffect(() => {
    const milestones = [30, 60, 120, 300];
    if (milestones.includes(timeOnEmbed)) {
      trackEvent('iframe_time_milestone', {
        iframe_type: type,
        milestone_seconds: timeOnEmbed,
        milestone_label: timeOnEmbed === 30 ? '30_seconds' : 
                        timeOnEmbed === 60 ? '1_minute' : 
                        timeOnEmbed === 120 ? '2_minutes' : '5_minutes'
      });
    }
  }, [timeOnEmbed, type]);

  // Save data to all storage mechanisms
  const saveFormData = useCallback(async (data) => {
    if (!data || Object.keys(data).length === 0) return;
    
    const dataToSave = {
      ...data,
      savedAt: new Date().toISOString(),
      type,
      userId
    };

    // Save to localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      console.log('[PB Form] Saved to localStorage:', storageKey);
    } catch (e) {
      console.warn('[PB Form] localStorage save failed:', e);
    }

    // Save to sessionStorage
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(dataToSave));
      console.log('[PB Form] Saved to sessionStorage:', storageKey);
    } catch (e) {
      console.warn('[PB Form] sessionStorage save failed:', e);
    }

    // Save to backend
    if (userId && BACKEND_URL) {
      try {
        const token = localStorage.getItem('access_token');
        await axios.post(`${BACKEND_URL}/api/form-draft/save`, {
          form_type: type,
          form_data: dataToSave
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('[PB Form] Saved to backend');
        setLastSaved(new Date());
      } catch (e) {
        console.warn('[PB Form] Backend save failed:', e);
      }
    }
  }, [storageKey, type, userId]);

  // Load saved data from storage
  const loadSavedData = useCallback(async () => {
    let savedData = null;

    // Try backend first (most reliable)
    if (userId && BACKEND_URL) {
      try {
        const token = localStorage.getItem('access_token');
        const response = await axios.get(`${BACKEND_URL}/api/form-draft/${type}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data?.form_data) {
          savedData = response.data.form_data;
          console.log('[PB Form] Loaded from backend:', savedData);
        }
      } catch (e) {
        console.log('[PB Form] No backend data found');
      }
    }

    // Fallback to localStorage
    if (!savedData) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          savedData = JSON.parse(stored);
          console.log('[PB Form] Loaded from localStorage:', savedData);
        }
      } catch (e) {
        console.warn('[PB Form] localStorage load failed:', e);
      }
    }

    // Fallback to sessionStorage
    if (!savedData) {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          savedData = JSON.parse(stored);
          console.log('[PB Form] Loaded from sessionStorage:', savedData);
        }
      } catch (e) {
        console.warn('[PB Form] sessionStorage load failed:', e);
      }
    }

    if (savedData) {
      setCapturedData(savedData);
      setLastSaved(savedData.savedAt ? new Date(savedData.savedAt) : null);
    }

    return savedData;
  }, [storageKey, type, userId]);

  // Handle iframe load success
  const handleLoad = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setLoading(false);
    setError(false);
    
    // Track iframe load
    const loadTime = Math.round((Date.now() - pageLoadTimeRef.current) / 1000);
    trackEvent('iframe_loaded', {
      iframe_type: type,
      load_time_seconds: loadTime,
      retry_count: retryCount
    });
    
    onLoad?.();

    // Load any saved data
    const savedData = await loadSavedData();
    
    // Try to send saved data to iframe (might work if PB supports it)
    if (savedData && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: 'RESTORE_FORM_DATA',
          data: savedData
        }, '*');
        console.log('[PB Form] Sent restore message to iframe');
      } catch (e) {
        console.log('[PB Form] Could not send restore message:', e);
      }
    }
  }, [onLoad, loadSavedData, type, retryCount]);

  // Handle iframe load error
  const handleError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (retryCount < maxRetries) {
      // Exponential backoff retry
      const delay = Math.pow(2, retryCount) * 1000;
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setLoading(true);
        setError(false);
      }, delay);
    } else {
      setLoading(false);
      setError(true);
      
      // Track iframe load failure
      trackEvent('iframe_load_failed', {
        iframe_type: type,
        retry_count: retryCount
      });
      
      onError?.();
    }
  }, [retryCount, onError, type]);

  // Retry manually
  const handleRetry = useCallback(() => {
    trackEvent('iframe_retry_clicked', {
      iframe_type: type,
      previous_retry_count: retryCount
    });
    setRetryCount(0);
    setLoading(true);
    setError(false);
  }, [type, retryCount]);

  // Set up load timeout
  useEffect(() => {
    if (loading) {
      // 20 second timeout for iframe to load
      timeoutRef.current = setTimeout(() => {
        handleError();
      }, 20000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [loading, retryCount, handleError]);

  // Listen for ALL postMessages from Practice Better and capture form data
  useEffect(() => {
    const handleMessage = (event) => {
      // Only process messages from Practice Better
      if (!event.origin.includes('practicebetter.io')) {
        return;
      }

      // Log ALL messages for debugging
      console.log('[PB Form] Received postMessage:', event.data);

      if (event.data && typeof event.data === 'object') {
        // Handle height updates
        if (event.data.height && typeof event.data.height === 'number') {
          setIframeHeight(Math.max(event.data.height, minHeight));
        } else if (event.data.frameHeight && typeof event.data.frameHeight === 'number') {
          setIframeHeight(Math.max(event.data.frameHeight, minHeight));
        }

        // Capture ANY form-related data that might be sent
        if (event.data.formData || event.data.form_data || event.data.data) {
          const formData = event.data.formData || event.data.form_data || event.data.data;
          console.log('[PB Form] Captured form data:', formData);
          setCapturedData(prev => ({ ...prev, ...formData }));
          saveFormData(formData);
        }

        // Capture field-level changes
        if (event.data.field || event.data.fieldName || event.data.name) {
          const fieldName = event.data.field || event.data.fieldName || event.data.name;
          const fieldValue = event.data.value;
          if (fieldName && fieldValue !== undefined) {
            console.log(`[PB Form] Field change: ${fieldName} = ${fieldValue}`);
            setCapturedData(prev => {
              const updated = { ...prev, [fieldName]: fieldValue };
              saveFormData(updated);
              return updated;
            });
          }
        }

        // Capture form submission events
        if (event.data.type === 'form_submitted' || event.data.event === 'submit') {
          console.log('[PB Form] Form submitted!');
          // Clear saved data on successful submission
          localStorage.removeItem(storageKey);
          sessionStorage.removeItem(storageKey);
          setCapturedData({});
        }

        // Store entire message if it contains useful data
        if (event.data.type || event.data.action || event.data.event) {
          console.log('[PB Form] Event captured:', event.data.type || event.data.action || event.data.event);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [minHeight, saveFormData, storageKey]);

  // Auto-save interval (every 10 seconds)
  useEffect(() => {
    if (type === 'form' && !loading && !error) {
      autoSaveIntervalRef.current = setInterval(() => {
        if (Object.keys(capturedData).length > 0) {
          console.log('[PB Form] Auto-saving...');
          saveFormData(capturedData);
        }
        
        // Also try to request form data from iframe
        if (iframeRef.current?.contentWindow) {
          try {
            iframeRef.current.contentWindow.postMessage({
              type: 'REQUEST_FORM_DATA'
            }, '*');
          } catch (e) {
            // Silent fail - expected if cross-origin
          }
        }
      }, 10000);
    }

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [type, loading, error, capturedData, saveFormData]);

  // Generate unique key for iframe to force reload on retry
  const iframeKey = `pb-${type}-${retryCount}`;

  // Determine container style based on fillContainer prop
  const containerStyle = fillContainer 
    ? { height: '100%' } 
    : { minHeight: `${minHeight}px` };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full ${fillContainer ? 'h-full' : ''} ${className}`}
      style={containerStyle}
    >
      {/* Loading Overlay */}
      <AnimatePresence>
        {loading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-12 h-12 text-teal-600" />
            </motion.div>
            <p className="mt-4 text-gray-600 font-medium">
              Loading {type === 'booking' ? 'booking calendar' : 'health form'}...
            </p>
            {retryCount > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                Retry attempt {retryCount} of {maxRetries}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Fallback */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-6"
          >
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
              Having trouble loading?
            </h3>
            <p className="text-gray-600 text-center mb-6 max-w-md">
              The {type === 'booking' ? 'booking calendar' : 'health form'} is taking longer than expected to load.
            </p>
            
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Button
                onClick={handleRetry}
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
              >
                <RefreshCw size={18} />
                {type === 'booking' ? 'Reload Calendar' : 'Reload Form'}
              </Button>
              
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button
                  variant="outline"
                  className="w-full border-2 border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  {type === 'booking' ? 'Book Directly' : 'Fill Form Directly'}
                </Button>
              </a>
              
              <p className="text-xs text-gray-500 text-center mt-2">
                Click above to open in a new tab, then return here to continue
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Iframe */}
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={iframeUrl}
        title={type === 'booking' ? 'Book Appointment' : 'Health Form'}
        onLoad={handleLoad}
        onError={handleError}
        className={`w-full border-0 rounded-lg transition-opacity duration-300 ${loading || error ? 'opacity-0' : 'opacity-100'} ${fillContainer ? 'h-full' : ''}`}
        style={fillContainer ? {} : { 
          height: `${iframeHeight}px`,
          minHeight: `${minHeight}px`
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-top-navigation-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="payment"
      />
    </div>
  );
};

export default PracticeBetterEmbed;
