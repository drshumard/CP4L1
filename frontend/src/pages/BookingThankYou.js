import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * Handles redirect from Practice Better after booking.
 * The backend webhook automatically advances the user to Step 2.
 * 
 * Flow:
 * - token exists → /steps?booking=success (show success modal, refresh data)
 * - no token → Show friendly message to return to original tab
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showReturnMessage, setShowReturnMessage] = useState(false);
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    const handleRedirect = () => {
      try {
        // Check if localStorage is available and has token
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
            // User is logged in - redirect to steps with success
            console.log('Auto flow: redirecting to /steps?booking=success');
            navigate('/steps?booking=success', { replace: true });
          } else {
            // User's session not available in this tab
            // The backend webhook already advanced them to Step 2
            // Show a message to return to their original tab
            console.log('No session in this tab - showing return message');
            setShowReturnMessage(true);
          }
        } else {
          // No booking status - redirect based on auth state
          if (hasToken) {
            navigate('/steps', { replace: true });
          } else {
            navigate('/login', { replace: true });
          }
        }
      } catch (error) {
        console.error('Redirect error:', error);
        setShowReturnMessage(true);
      }
    };

    handleRedirect();
  }, [bookingStatus, navigate]);

  // Show return to original tab message
  if (showReturnMessage) {
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
            Your consultation has been successfully scheduled. Please return to your original browser tab to continue with Step 2.
          </p>
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-teal-800">
              <strong>Tip:</strong> You can close this tab and go back to where you started the booking.
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
