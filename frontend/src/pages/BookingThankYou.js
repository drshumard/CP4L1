import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * This page handles the redirect from Practice Better after booking.
 * It checks for authentication and redirects appropriately.
 * 
 * Flow:
 * 1. Practice Better redirects to /booking-complete?status=booked
 * 2. Check if user has valid session (localStorage token)
 * 3. If yes: redirect to /steps?booking=success
 * 4. If no: redirect to /login?booking=success&redirect=steps
 * 
 * Browser Compatibility:
 * - Works with Safari, Chrome, Firefox, Edge, DuckDuckGo
 * - Handles Private/Incognito mode (redirects to login)
 * - Fallback for localStorage disabled browsers
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    const handleRedirect = () => {
      try {
        // Check if localStorage is available (some browsers/modes disable it)
        let localStorageAvailable = false;
        let hasToken = false;
        
        try {
          // Test localStorage availability
          localStorage.setItem('__test__', 'test');
          localStorage.removeItem('__test__');
          localStorageAvailable = true;
          
          // Check for existing token
          hasToken = !!localStorage.getItem('access_token');
        } catch (e) {
          console.warn('localStorage not available:', e);
          localStorageAvailable = false;
        }

        if (bookingStatus === 'booked') {
          console.log('Booking detected');
          console.log('localStorage available:', localStorageAvailable);
          console.log('Has token:', hasToken);
          
          if (localStorageAvailable && hasToken) {
            // User is logged in - redirect to steps with success param
            console.log('Redirecting to steps with booking success...');
            navigate('/steps?booking=success', { replace: true });
          } else {
            // No token or localStorage issues - redirect to login
            // Pass booking=success so after login they see the success message
            console.log('No session found, redirecting to login...');
            navigate('/login?booking=success&message=booking_complete', { replace: true });
          }
        } else {
          // No valid booking status - check if logged in
          if (localStorageAvailable && hasToken) {
            navigate('/steps', { replace: true });
          } else {
            navigate('/login', { replace: true });
          }
        }
      } catch (error) {
        console.error('Redirect error:', error);
        setError('Something went wrong. Redirecting...');
        // Fallback - always try to go to login
        setTimeout(() => {
          window.location.href = '/login?booking=success&message=booking_complete';
        }, 1500);
      }
    };

    handleRedirect();
  }, [bookingStatus, navigate]);

  // Show a simple loading state (should be very brief)
  return (
    <div className="min-h-screen bg-[#F4F3F2] flex flex-col items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mb-4"></div>
      {error ? (
        <p className="text-gray-600 text-sm">{error}</p>
      ) : (
        <p className="text-gray-600 text-sm">Confirming your booking...</p>
      )}
    </div>
  );
};

export default BookingThankYou;
