import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Calendar, Loader2 } from 'lucide-react';

/**
 * BookingThankYou Page
 * 
 * This page is embedded inside the Practice Better iframe after a booking.
 * It communicates with the parent window (StepsPage) via postMessage
 * to trigger the step advancement.
 * 
 * URL Format: /booking-complete?status=booked
 * 
 * Practice Better Configuration:
 * Set the Thank You page redirect URL to:
 * https://YOUR_DOMAIN/booking-complete?status=booked
 */
const BookingThankYou = () => {
  const [searchParams] = useSearchParams();
  const [messageSent, setMessageSent] = useState(false);
  
  const bookingStatus = searchParams.get('status');

  useEffect(() => {
    // Only proceed if status=booked
    if (bookingStatus === 'booked' && !messageSent) {
      setMessageSent(true);
      
      // Send message to parent window (StepsPage) to advance to Step 2
      // This works because the thank you page is loaded inside the Practice Better iframe
      // which is inside our StepsPage
      
      // Try multiple times to ensure the message is received
      const sendMessage = () => {
        const message = { 
          type: 'BOOKING_COMPLETE',
          action: 'advance_to_step_2',
          timestamp: Date.now()
        };
        
        // Send to parent (in case of single iframe)
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
        
        // Send to top (in case of nested iframes)
        if (window.top && window.top !== window) {
          window.top.postMessage(message, '*');
        }
        
        console.log('Booking complete message sent to parent');
      };
      
      // Send immediately
      sendMessage();
      
      // Also send after short delays to ensure delivery
      setTimeout(sendMessage, 500);
      setTimeout(sendMessage, 1000);
      setTimeout(sendMessage, 2000);
    }
  }, [bookingStatus, messageSent]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-md w-full text-center"
      >
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
              <span className="font-medium text-sm sm:text-base">Check your email for confirmation details</span>
            </div>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-2 text-teal-600"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Updating your progress...</span>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default BookingThankYou;
