import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PatientSkeleton from './PatientSkeleton';
import { ArrowRight, CheckCheck, CircleHelp, LockKeyhole } from 'lucide-react';
import logo from './checkout/dr-shumard-logo.png';
import './checkout/checkout.css';

/**
 * BookingThankYou - Redirect Handler
 * 
 * Handles redirect from Practice Better after booking.
 * The backend webhook automatically advances the user to Step 2.
 * The original tab polls for changes and auto-updates.
 * 
 * Flow:
 * - token exists → /steps?booking=success (show success modal)
 * - no token → the checkout's "You're booked." confirmation, with sign-in to continue
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

  // Booked, but this tab isn't signed in: the checkout's "You're booked." confirmation (pages/checkout/CheckoutComplete)
  // — its design, with sign-in as the way on.
  if (showMessage) {
    return (
      <div className="co min-h-screen">
        <header className="site-header"><div className="header-inner">
          <a href="https://drshumardworkshop.com" className="brand" aria-label="Dr. Shumard home"><img src={logo} alt="Dr. Shumard" width={1024} height={152} className="brand-logo" /></a>
          <a className="help-link" href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer"><CircleHelp size={17} /><span>Need help?</span></a>
        </div></header>
        <main className="page-shell">
          <div className="complete-shell">
            <div className="checkout-card">
              <div className="confirmation" role="status" aria-live="polite">
                <div className="confirmation-icon"><CheckCheck size={28} /></div>
                <h3>You’re booked.</h3>
                <p>30-minute video call. We’ve emailed your confirmation and next steps.</p>
                <a className="primary-button" href="/login">Sign in to continue<ArrowRight size={17} /></a>
              </div>
              <div className="checkout-footer"><span><LockKeyhole size={15} /> Private &amp; secure</span></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return <PatientSkeleton label="Confirming your booking…" />;
};

export default BookingThankYou;
