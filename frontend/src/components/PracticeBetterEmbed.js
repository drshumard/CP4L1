import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

// Practice Better iframe URLs
const PRACTICE_BETTER_URLS = {
  booking: 'https://drshumard.practicebetter.io/?fl_wtc=0D9488&fl_wtac=0891B2#/601a127b2a9c2406dcc94437/widgets/bookings?r=6931baa6ac26faba7eb5602b',
  form: 'https://drshumard.practicebetter.io/?fl_wtc=0D9488&fl_wtac=0891B2#/601a127b2a9c2406dcc94437/widgets/forms?f=6021e5d42a9c2406f45aa20f'
};

// Direct links for fallback (opens in new tab)
const FALLBACK_URLS = {
  booking: 'https://drshumard.practicebetter.io/#/601a127b2a9c2406dcc94437/bookings?r=6931baa6ac26faba7eb5602b',
  form: 'https://drshumard.practicebetter.io/#/601a127b2a9c2406dcc94437/forms?f=6021e5d42a9c2406f45aa20f'
};

const PracticeBetterEmbed = ({ 
  type = 'booking', // 'booking' or 'form'
  onLoad,
  onError,
  className = '',
  minHeight = 800,
  fillContainer = false // When true, iframe fills container height instead of using minHeight
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [iframeHeight, setIframeHeight] = useState(type === 'form' ? 1200 : minHeight);
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);
  const maxRetries = 3;

  const iframeUrl = PRACTICE_BETTER_URLS[type];
  const fallbackUrl = FALLBACK_URLS[type];

  // Handle iframe load success
  const handleLoad = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setLoading(false);
    setError(false);
    onLoad?.();
  }, [onLoad]);

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
      onError?.();
    }
  }, [retryCount, onError]);

  // Retry manually
  const handleRetry = useCallback(() => {
    setRetryCount(0);
    setLoading(true);
    setError(false);
  }, []);

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

  // Listen for postMessage height updates from Practice Better
  useEffect(() => {
    const handleMessage = (event) => {
      // Validate origin - only trust Practice Better domain
      if (!event.origin.includes('practicebetter.io')) {
        return;
      }

      // Handle height updates
      if (event.data && typeof event.data === 'object') {
        if (event.data.height && typeof event.data.height === 'number') {
          setIframeHeight(Math.max(event.data.height, minHeight));
        } else if (event.data.frameHeight && typeof event.data.frameHeight === 'number') {
          setIframeHeight(Math.max(event.data.frameHeight, minHeight));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [minHeight]);

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
                Try Again
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
        className={`w-full border-0 rounded-lg transition-opacity duration-300 ${loading || error ? 'opacity-0' : 'opacity-100'}`}
        style={{ 
          height: `${iframeHeight}px`,
          minHeight: `${minHeight}px`
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="payment"
      />
    </div>
  );
};

export default PracticeBetterEmbed;
