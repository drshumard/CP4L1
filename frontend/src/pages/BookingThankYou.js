import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * Handles redirect from Practice Better after booking.
 * The backend webhook automatically advances the user to Step 2.
 * The original tab polls for changes and auto-updates.
 * 
 * Flow:
 * - token exists → /steps?booking=success (show success modal)
 * - no token → Show message that original tab will auto-update
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showMessage, setShowMessage] = useState(false);
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    const handleRedirect = () => {
      // Check if we have a token (same session)
      let hasToken = false;
      
      try {
        hasToken = !!localStorage.getItem('access_token');
      } catch (e) {
        console.warn('localStorage not available:', e);
      }

      console.log('Booking status:', bookingStatus);
      console.log('Has token:', hasToken);

      if (bookingStatus === 'booked') {
        if (hasToken) {
          // Same session - redirect to steps with success flag
          console.log('Same session: redirecting to /steps?booking=success');
          navigate('/steps?booking=success', { replace: true });
        } else {
          // Different tab/session - show message
          // The original tab will auto-update via polling
          console.log('Different session - showing confirmation message');
          setShowMessage(true);
        }
      } else {
        // No booking status
        if (hasToken) {
          navigate('/steps', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      }
    };

    handleRedirect();
  }, [bookingStatus, navigate]);

  // Show confirmation message for different tab scenario
  if (showMessage) {
    return (
      <div className="min-h-screen bg-[#F4F3F2] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600 mb-6">
            Your consultation has been successfully scheduled.
          </p>
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-teal-800">
              <strong>Your original tab will automatically update</strong> to Step 2 within a few seconds. You can close this tab now.
            </p>
          </div>
          <button
            onClick={() => window.close()}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white py-3 px-6 rounded-lg font-medium hover:from-teal-600 hover:to-cyan-700 transition-all"
          >
            Close This Tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F3F2] flex flex-col items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mb-4"></div>
      <p className="text-gray-600 text-sm">Confirming your booking...</p>
    </div>
  );
};

export default BookingThankYou;
