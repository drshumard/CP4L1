import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * Handles redirect from Practice Better after booking.
 * 
 * Flow:
 * - localStorage available + token → /steps?booking=success (auto advance)
 * - localStorage unavailable OR no token → /login?booking=success (re-auth then advance)
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    const handleRedirect = () => {
      try {
        // Check if localStorage is available
        let localStorageAvailable = false;
        let hasToken = false;
        
        try {
          localStorage.setItem('__test__', 'test');
          localStorage.removeItem('__test__');
          localStorageAvailable = true;
          hasToken = !!localStorage.getItem('access_token');
        } catch (e) {
          console.warn('localStorage not available:', e);
          localStorageAvailable = false;
        }

        console.log('Booking status:', bookingStatus);
        console.log('localStorage available:', localStorageAvailable);
        console.log('Has token:', hasToken);

        if (bookingStatus === 'booked') {
          if (localStorageAvailable && hasToken) {
            // Auto flow - localStorage works and user is logged in
            console.log('Auto flow: redirecting to /steps?booking=success');
            navigate('/steps?booking=success', { replace: true });
          } else {
            // User lost their session - redirect to login with booking success flag
            // After they log back in, they'll be advanced to step 2
            console.log('Session lost: redirecting to /login?booking=success');
            navigate('/login?booking=success', { replace: true });
          }
        } else {
          // No booking status - just go to steps or login
          if (hasToken) {
            navigate('/steps', { replace: true });
          } else {
            navigate('/login', { replace: true });
          }
        }
      } catch (error) {
        console.error('Redirect error:', error);
        setError('Something went wrong. Redirecting...');
        // Fallback - go to login with booking success
        setTimeout(() => {
          window.location.href = '/login?booking=success';
        }, 1500);
      }
    };

    handleRedirect();
  }, [bookingStatus, navigate]);

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
