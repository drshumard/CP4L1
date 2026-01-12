/**
 * ================================================================================
 * ROACH CHECKPOINT - Step 1 Practice Better Booking Flow
 * ================================================================================
 * 
 * Created: ${new Date().toISOString()}
 * 
 * This checkpoint saves the complete Step 1 booking implementation including:
 * 
 * 1. PracticeBetterEmbed Component (saved separately)
 *    - File: ROACH_CHECKPOINT_PracticeBetterEmbed.js
 *    - Features: iframe embedding, localStorage session, retry logic
 * 
 * 2. Step 1 Flow Logic (in StepsPage.js):
 *    - URL redirect handling (?booking=success)
 *    - postMessage detection from Practice Better
 *    - Backend polling for step advancement
 *    - Manual "I've Booked My Call" fallback button
 *    - Booking success modal
 *    - Manual confirmation modal
 * 
 * TO RESTORE:
 * -----------
 * 1. Copy ROACH_CHECKPOINT_PracticeBetterEmbed.js back to PracticeBetterEmbed.js
 * 2. Uncomment the ROACH sections in StepsPage.js (search for "ROACH CHECKPOINT")
 * 
 * ================================================================================
 */

// ============================================================================
// STATE VARIABLES (add to StepsPage component state)
// ============================================================================
/*
const [showBookingSuccess, setShowBookingSuccess] = useState(false);
const [showBookingManualConfirm, setShowBookingManualConfirm] = useState(false);
const [bookingProcessing, setBookingProcessing] = useState(false);
const [manualConfirmLoading, setManualConfirmLoading] = useState(false);
*/

// ============================================================================
// POLLING LOGIC - Check for step advancement every 3 seconds while on Step 1
// ============================================================================
/*
useEffect(() => {
  // Only poll if user is on Step 1 and not currently processing a booking
  if (progressData?.current_step !== 1 || bookingProcessing || loading) {
    return;
  }

  let pollCount = 0;
  const maxPolls = 20; // Stop polling after 60 seconds (20 * 3s)

  const pollForStepChange = async () => {
    pollCount++;
    
    // Stop polling after max attempts
    if (pollCount > maxPolls) {
      console.log('Polling stopped after max attempts');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const res = await axios.get(\`\${API}/user/progress\`, {
        headers: { Authorization: \`Bearer \${token}\` }
      });

      // If user was advanced to Step 2 (by backend webhook), show success and refresh
      if (res.data?.current_step === 2 && progressData?.current_step === 1) {
        console.log('Step advancement detected via polling!');
        setBookingProcessing(true); // Prevent other handlers
        setShowBookingSuccess(true);
        
        // After 3 seconds, refresh data and show welcome message
        setTimeout(async () => {
          setShowBookingSuccess(false);
          setBookingProcessing(false);
          await fetchData();
          toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
        }, 3000);
      }
    } catch (error) {
      // Silently fail - polling shouldn't disrupt user experience
      console.log('Polling check failed:', error.message);
    }
  };

  // Poll every 3 seconds
  const pollInterval = setInterval(pollForStepChange, 3000);

  return () => clearInterval(pollInterval);
}, [progressData?.current_step, bookingProcessing, loading]);
*/

// ============================================================================
// URL PARAMETER HANDLING - Handle booking from URL parameter (redirected from Practice Better)
// ============================================================================
/*
useEffect(() => {
  const bookingParam = searchParams.get('booking');
  
  if (bookingParam === 'success' && !bookingProcessing) {
    setBookingProcessing(true);
    console.log('Booking success URL param detected');
    
    // Remove the query parameter from URL
    searchParams.delete('booking');
    setSearchParams(searchParams, { replace: true });
    
    // Show the success modal
    setShowBookingSuccess(true);
    
    // Check if user needs to be advanced (in case webhook was slow/failed)
    const ensureAdvancement = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        
        // Check current step
        const progressRes = await axios.get(\`\${API}/user/progress\`, {
          headers: { Authorization: \`Bearer \${token}\` }
        });
        
        // If still on Step 1, advance them (webhook may have failed)
        if (progressRes.data?.current_step === 1) {
          console.log('User still on Step 1, advancing via frontend...');
          
          await axios.post(
            \`\${API}/user/complete-task\`,
            { task_id: 'book_consultation' },
            { headers: { Authorization: \`Bearer \${token}\` } }
          );
          
          await axios.post(
            \`\${API}/user/advance-step\`,
            {},
            { headers: { Authorization: \`Bearer \${token}\` } }
          );
        }
      } catch (error) {
        console.error('Error ensuring advancement:', error);
      }
      
      // After 3 seconds, close modal and refresh
      setTimeout(async () => {
        setShowBookingSuccess(false);
        setBookingProcessing(false);
        await fetchData();
        toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
      }, 3000);
    };
    
    ensureAdvancement();
  }
  
  // Manual flow - show manual confirm modal (fallback for edge cases)
  if (bookingParam === 'manual' && !bookingProcessing) {
    console.log('Manual booking flow detected');
    
    // Remove the query parameter from URL
    searchParams.delete('booking');
    setSearchParams(searchParams, { replace: true });
    
    // Show the manual confirmation modal
    setShowBookingManualConfirm(true);
  }
}, [searchParams, setSearchParams, bookingProcessing]);
*/

// ============================================================================
// MANUAL BOOKING CONFIRMATION HANDLER
// ============================================================================
/*
const handleManualBookingConfirm = async () => {
  setManualConfirmLoading(true);
  
  try {
    const token = localStorage.getItem('access_token');
    
    if (token) {
      await axios.post(
        \`\${API}/user/complete-task\`,
        { task_id: 'book_consultation' },
        { headers: { Authorization: \`Bearer \${token}\` } }
      );
      
      await axios.post(
        \`\${API}/user/advance-step\`,
        {},
        { headers: { Authorization: \`Bearer \${token}\` } }
      );
    }
    
    setShowBookingManualConfirm(false);
    await fetchData();
    toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
  } catch (error) {
    console.error('Error confirming booking:', error);
    toast.error('Failed to update progress. Please try again.', { id: 'booking-error' });
  } finally {
    setManualConfirmLoading(false);
  }
};
*/

// ============================================================================
// PRACTICE BETTER EMBED JSX (in Step 1 Right Column - Booking Calendar)
// ============================================================================
/*
<PracticeBetterEmbed 
  type="booking"
  minHeight={750}
  onLoad={() => console.log('Booking calendar loaded successfully')}
  onError={() => console.log('Booking calendar failed to load')}
  onBookingComplete={async () => {
    // Safari fallback: Practice Better couldn't redirect, handle it here
    console.log('Booking completion detected via postMessage (Safari fallback)');
    if (!bookingProcessing) {
      setBookingProcessing(true);
      setShowBookingSuccess(true);
      
      // Advance user to Step 2
      try {
        const token = localStorage.getItem('access_token');
        if (token) {
          await axios.post(
            \`\${API}/user/complete-task\`,
            { task_id: 'book_consultation' },
            { headers: { Authorization: \`Bearer \${token}\` } }
          );
          await axios.post(
            \`\${API}/user/advance-step\`,
            {},
            { headers: { Authorization: \`Bearer \${token}\` } }
          );
        }
      } catch (error) {
        console.error('Error advancing step:', error);
      }
      
      setTimeout(async () => {
        setShowBookingSuccess(false);
        setBookingProcessing(false);
        await fetchData();
        toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
      }, 3000);
    }
  }}
/>
*/

// ============================================================================
// MANUAL "I'VE BOOKED MY CALL" BUTTON JSX
// ============================================================================
/*
<Button
  onClick={() => setShowBookingManualConfirm(true)}
  className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-xl"
>
  I&apos;ve Booked My Call
</Button>
*/

// ============================================================================
// BOOKING SUCCESS MODAL JSX
// ============================================================================
/*
{showBookingSuccess && (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
    />
    
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="max-w-md w-full"
      >
        <Card className="shadow-2xl border-0 overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 sm:p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
              >
                <CheckCircle className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Consultation Booked!
              </h2>
              <p className="text-white/90 text-sm sm:text-base">
                Your appointment has been scheduled successfully
              </p>
            </div>
            
            <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
              <div className="flex items-center justify-center gap-2 text-gray-600 mb-4">
                <Calendar className="w-5 h-5 text-teal-600" />
                <span className="text-sm sm:text-base">Check your email for confirmation details</span>
              </div>
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-teal-600"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="w-5 h-5" />
                </motion.div>
                <span className="font-medium">Moving to Step 2...</span>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  </>
)}
*/

// ============================================================================
// MANUAL BOOKING CONFIRMATION MODAL JSX
// ============================================================================
/*
{showBookingManualConfirm && (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
    />
    
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="max-w-md w-full"
      >
        <Card className="shadow-2xl border-0 overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-6 sm:p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
              >
                <Calendar className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Booking Detected
              </h2>
              <p className="text-white/90 text-sm sm:text-base">
                It looks like you just booked a consultation
              </p>
            </div>
            
            <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
              <p className="text-gray-600 mb-6 text-sm sm:text-base">
                Please confirm your booking to continue to the next step.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setShowBookingManualConfirm(false)}
                  variant="outline"
                  className="flex-1 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl"
                  disabled={manualConfirmLoading}
                >
                  Not Yet
                </Button>
                <Button
                  onClick={handleManualBookingConfirm}
                  disabled={manualConfirmLoading}
                  className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold py-3 rounded-xl shadow-lg"
                >
                  {manualConfirmLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Confirming...
                    </span>
                  ) : (
                    "Yes, I Booked!"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  </>
)}
*/

export default null; // This file is for reference only
