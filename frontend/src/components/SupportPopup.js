import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const TURNSTILE_SITE_KEY = '0x4AAAAAACGpT_eiqf1jAJaS';

const SupportPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    subject: '',
    message: ''
  });

  // Check if Turnstile is loaded
  useEffect(() => {
    const checkTurnstile = () => {
      if (window.turnstile) {
        setTurnstileReady(true);
      } else {
        setTimeout(checkTurnstile, 100);
      }
    };
    checkTurnstile();
  }, []);

  // Render Turnstile widget when modal opens and Turnstile is ready
  const renderTurnstile = useCallback(() => {
    if (!turnstileRef.current || !window.turnstile || !isOpen) return;

    // Clear any existing widget
    if (widgetIdRef.current !== null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      } catch (e) {
        console.log('Error removing widget:', e);
      }
    }

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      if (turnstileRef.current && window.turnstile && isOpen) {
        try {
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => {
              console.log('Turnstile token received');
              setTurnstileToken(token);
            },
            'expired-callback': () => {
              console.log('Turnstile token expired');
              setTurnstileToken(null);
            },
            'error-callback': (error) => {
              console.log('Turnstile error:', error);
              setTurnstileToken(null);
            },
            theme: 'light',
            size: 'normal'
          });
          console.log('Turnstile widget rendered, ID:', widgetIdRef.current);
        } catch (e) {
          console.error('Error rendering Turnstile:', e);
        }
      }
    }, 200);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && turnstileReady) {
      renderTurnstile();
    }
  }, [isOpen, turnstileReady, renderTurnstile]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      setTurnstileToken(null);
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        } catch (e) {
          // Widget might already be removed
        }
      }
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.email || !formData.subject || !formData.message) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!turnstileToken) {
      toast.error('Please complete the security verification');
      return;
    }

    setIsSubmitting(true);

    try {
      await fetch('https://hooks.zapier.com/hooks/catch/1815480/uf7u8ms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'no-cors', // Zapier webhooks require no-cors mode
        body: JSON.stringify({
          purchase_email: formData.email,
          phone_number: formData.phone,
          subject: formData.subject,
          issue_description: formData.message,
          turnstile_token: turnstileToken,
          submitted_at: new Date().toISOString()
        }),
      });

      // With no-cors, we can't read the response, but the request was sent
      toast.success('Support request sent! We\'ll get back to you soon.');
      setFormData({ email: '', phone: '', subject: '', message: '' });
      setTurnstileToken(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Support request error:', error);
      toast.error('Failed to send request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow"
        aria-label="Open support"
      >
        <MessageCircle size={24} />
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-6 text-white relative">
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
                <h2 className="text-2xl font-bold">Need Help?</h2>
                <p className="text-white/80 mt-1 text-sm">
                  Contact us and we'll get back to you as soon as possible.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Purchase Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email address"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder="What is this about?"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Explain what issue you're facing <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Please describe your issue in detail..."
                    required
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all resize-none"
                  />
                </div>

                {/* Cloudflare Turnstile */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <ShieldCheck size={16} className="text-teal-600" />
                    <span>Security Verification</span>
                  </div>
                  <div 
                    ref={turnstileRef}
                    className="flex justify-center min-h-[65px]"
                  >
                    {!turnstileReady && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Loader2 className="animate-spin" size={16} />
                        <span className="text-sm">Loading verification...</span>
                      </div>
                    )}
                  </div>
                  {turnstileToken && (
                    <p className="text-xs text-green-600 text-center flex items-center justify-center gap-1">
                      <ShieldCheck size={14} />
                      Verified
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isSubmitting || !turnstileToken}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      Send Message
                    </>
                  )}
                </Button>

                {!turnstileToken && (
                  <p className="text-xs text-gray-500 text-center">
                    Please complete the security verification above to send your message.
                  </p>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupportPopup;
