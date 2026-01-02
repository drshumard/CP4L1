import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Calendar, Loader2 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * BookingThankYou Page
 * 
 * This page handles the Practice Better booking confirmation redirect.
 * 
 * Two scenarios:
 * 1. Loaded in iframe - sends postMessage to parent
 * 2. Loaded as full page (Practice Better broke out of iframe) - advances step via API and redirects
 * 
 * URL Format: /booking-complete?status=booked
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  
  const bookingStatus = searchParams.get('status');
  const isInIframe = window.self !== window.top;

  useEffect(() => {
    if (bookingStatus !== 'booked') {
      setStatus('success');
      return;
    }

    const handleBookingComplete = async () => {
      // Send message to parent window (works if in iframe)
      const message = { 
        type: 'BOOKING_COMPLETE',
        action: 'advance_to_step_2',
        timestamp: Date.now()
      };
      
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
      if (window.top && window.top !== window) {
        window.top.postMessage(message, '*');
      }
      
      console.log('Booking complete message sent');

      // If NOT in iframe (page was redirected entirely), handle it ourselves
      if (!isInIframe) {
        console.log('Not in iframe - advancing step via API');
        
        const token = localStorage.getItem('access_token');
        
        if (token) {
          try {
            // Complete the booking task
            await axios.post(
              `${BACKEND_URL}/api/user/complete-task`,
              { task_id: 'book_consultation' },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // Advance to step 2
            await axios.post(
              `${BACKEND_URL}/api/user/advance-step`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
            
            setStatus('success');
            
            // Redirect to steps page after showing success
            setTimeout(() => {
              navigate('/steps', { replace: true });
            }, 2500);
            
          } catch (error) {
            console.error('Error advancing step:', error);
            setStatus('success');
            // Still redirect even if API call fails
            setTimeout(() => {
              navigate('/steps', { replace: true });
            }, 2500);
          }
        } else {
          // No token - redirect to login
          setStatus('success');
          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 2500);
        }
      } else {
        // In iframe - just show success, parent will handle the rest
        setStatus('success');
      }
    };

    handleBookingComplete();
  }, [bookingStatus, isInIframe, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-md w-full text-center"
      >
        {status === 'processing' ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 bg-teal-100 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
              Processing...
            </h1>
            <p className="text-gray-600">
              Confirming your booking...
            </p>
          </>
        ) : (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center"
            >
              <CheckCircle className="w-10 h-10 text-green-600" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
                Consultation Booked!
              </h1>
              
              <p className="text-gray-600 mb-6">
                Your consultation has been scheduled successfully.
              </p>
              
              <div className="bg-teal-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-teal-700">
                  <Calendar className="w-5 h-5" />
                  <span className="font-medium text-sm sm:text-base">Check your email for confirmation</span>
                </div>
              </div>
              
              {!isInIframe && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-center gap-2 text-teal-600"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Redirecting to Step 2...</span>
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default BookingThankYou;
