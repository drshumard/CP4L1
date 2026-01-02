import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Calendar, Loader2 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * BookingThankYou Page
 * 
 * This page is designed to be embedded in Practice Better's "Thank You" page
 * after a user books their consultation. It automatically advances the user
 * to Step 2 and displays a success message.
 * 
 * URL Format: /booking-complete?email=user@example.com&status=booked
 * 
 * Practice Better Configuration:
 * Set the Thank You page redirect URL to:
 * https://YOUR_DOMAIN/booking-complete?email={{client.email}}&status=booked
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [message, setMessage] = useState('Processing your booking...');
  
  const email = searchParams.get('email');
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    const advanceToStep2 = async () => {
      // Validate required parameters
      if (!email || bookingStatus !== 'booked') {
        setStatus('success'); // Still show success, just don't advance
        setMessage('Your consultation has been booked!');
        return;
      }

      try {
        // Try to get token from localStorage first
        const token = localStorage.getItem('token');
        
        if (token) {
          // User is logged in - advance their step
          await axios.post(
            `${BACKEND_URL}/api/user/complete-task`,
            { step_number: 1, task_id: 'book_consultation' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          await axios.post(
            `${BACKEND_URL}/api/user/advance-step`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          setStatus('success');
          setMessage('Consultation booked! Redirecting to Step 2...');
          
          // Notify parent window if embedded in iframe
          if (window.parent !== window) {
            window.parent.postMessage({ 
              type: 'booking_complete', 
              email: email,
              action: 'advance_to_step_2'
            }, '*');
          }
          
          // Redirect to step 2 after a short delay
          setTimeout(() => {
            // Try to redirect the parent window if in iframe
            if (window.parent !== window) {
              window.parent.postMessage({ 
                type: 'redirect', 
                url: '/steps?step=2'
              }, '*');
            }
            // Also try direct navigation (works if not in iframe)
            window.location.href = '/steps?step=2';
          }, 2000);
          
        } else {
          // No token - just show success message
          // The user will need to log in to see their progress
          setStatus('success');
          setMessage('Your consultation has been booked successfully!');
          
          // Still notify parent window
          if (window.parent !== window) {
            window.parent.postMessage({ 
              type: 'booking_complete', 
              email: email,
              action: 'show_success'
            }, '*');
          }
        }
      } catch (error) {
        console.error('Error advancing to step 2:', error);
        // Even if the API call fails, show success to the user
        setStatus('success');
        setMessage('Your consultation has been booked!');
      }
    };

    advanceToStep2();
  }, [email, bookingStatus]);

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
              {message}
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
                {message}
              </p>
              
              <div className="bg-teal-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-teal-700">
                  <Calendar className="w-5 h-5" />
                  <span className="font-medium">Check your email for confirmation</span>
                </div>
              </div>
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center justify-center gap-2 text-teal-600"
              >
                <span className="text-sm">Continuing to Step 2</span>
                <ArrowRight className="w-4 h-4 animate-pulse" />
              </motion.div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default BookingThankYou;
