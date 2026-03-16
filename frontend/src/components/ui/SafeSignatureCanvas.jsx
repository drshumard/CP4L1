import React, { forwardRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';

/**
 * A wrapper around SignatureCanvas that handles iOS in-app browser quirks.
 * Prevents the "undefined is not an object (evaluating 'this._data[this._data.length-1].push')"
 * error that occurs in Facebook/Instagram in-app browsers on iOS.
 */
const SafeSignatureCanvas = forwardRef(({ onEnd, ...props }, ref) => {
  useEffect(() => {
    // Add global error handler for signature_pad errors
    const handleError = (event) => {
      // Suppress signature_pad internal errors on iOS in-app browsers
      if (event.message?.includes('this._data') || 
          event.message?.includes('signature_pad')) {
        event.preventDefault();
        return true;
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const handleEnd = () => {
    try {
      if (onEnd) {
        onEnd();
      }
    } catch (e) {
      // Silently catch any signature pad errors
      console.debug('Signature canvas end event error (safe to ignore):', e.message);
    }
  };

  return (
    <SignatureCanvas
      ref={ref}
      onEnd={handleEnd}
      {...props}
    />
  );
});

SafeSignatureCanvas.displayName = 'SafeSignatureCanvas';

export default SafeSignatureCanvas;
