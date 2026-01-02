import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * BookingThankYou - Redirect Handler
 * 
 * This page does NOT show any UI. It immediately redirects to /steps with a 
 * query parameter, which triggers a modal on the Steps page.
 * 
 * Flow:
 * 1. Practice Better redirects to /booking-complete?status=booked
 * 2. This page immediately redirects to /steps?booking=success
 * 3. StepsPage detects the param, shows modal, advances step
 * 
 * This ensures the user never leaves the portal's UI/design.
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    // Immediately redirect to steps page with booking success parameter
    if (bookingStatus === 'booked') {
      console.log('Booking detected, redirecting to steps with success param...');
      navigate('/steps?booking=success', { replace: true });
    } else {
      // If no valid status, just go to steps
      console.log('No booking status, redirecting to steps...');
      navigate('/steps', { replace: true });
    }
  }, [bookingStatus, navigate]);

  // Show nothing - this is just a redirect handler
  // A brief loading state in case redirect takes a moment
  return (
    <div className="min-h-screen bg-[#F4F3F2] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
    </div>
  );
};

export default BookingThankYou;
