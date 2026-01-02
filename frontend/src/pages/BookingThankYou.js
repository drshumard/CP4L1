import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * Handles redirect from Practice Better after booking.
 * 
 * Flow:
 * - localStorage available + token → /steps?booking=success (auto advance)
 * - localStorage unavailable OR no token → /steps?booking=manual (manual confirm modal)
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
            // Manual flow - localStorage issue or not logged in
            // Redirect to steps with manual param so they can confirm manually
            console.log('Manual flow: redirecting to /steps?booking=manual');
            navigate('/steps?booking=manual', { replace: true });
          }
        } else {
          // No booking status - just go to steps
          navigate('/steps', { replace: true });
        }
      } catch (error) {
        console.error('Redirect error:', error);
        setError('Something went wrong. Redirecting...');
        // Fallback - go to steps with manual confirmation
        setTimeout(() => {
          window.location.href = '/steps?booking=manual';
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
