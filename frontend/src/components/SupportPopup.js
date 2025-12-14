import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, ShieldCheck, HelpCircle } from 'lucide-react';
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

    if (widgetIdRef.current !== null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      } catch (e) {
        console.log('Error removing widget:', e);
      }
    }

    setTimeout(() => {
      if (turnstileRef.current && window.turnstile && isOpen) {
        try {
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => {
              setTurnstileToken(token);
            },
            'expired-callback': () => {
              setTurnstileToken(null);
            },
            'error-callback': () => {
              setTurnstileToken(null);
            },
            theme: 'light',
            size: 'normal'
          });
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

  useEffect(() => {
    if (!isOpen) {
      setTurnstileToken(null);
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        } catch (e) {}
      }
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
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
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          purchase_email: formData.email,
          phone_number: formData.phone,
          subject: formData.subject,
          issue_description: formData.message,
          turnstile_token: turnstileToken,
          submitted_at: new Date().toISOString()
        }),
      });

      toast.success('Support request sent! We\'ll get back to you soon.');
      setFormData({ email: '', phone: '', subject: '', message: '' });
      setTurnstileToken(null);
      setIsOpen(false);
    } catch (error) {
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Horizontal Layout */}
              <div className="flex flex-col md:flex-row">
                {/* Left Side - Header/Info */}
                <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-4 md:p-8 text-white md:w-1/3 relative">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="absolute top-3 right-3 text-white/80 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                  
                  <div className="flex items-center gap-3 md:mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <HelpCircle size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div className="md:hidden">
                      <h2 className="text-lg font-bold">Need Help?</h2>
                      <p className="text-white/80 text-xs">We'll get back to you shortly</p>
                    </div>
                  </div>
                  
                  <h2 className="hidden md:block text-xl md:text-2xl font-bold mb-2">Need Help?</h2>
                  <p className="hidden md:block text-white/80 text-sm">
                    We're here to help! Fill out the form and we'll get back to you shortly.
                  </p>

                  {/* Turnstile on desktop - below text */}
                  <div className="hidden md:block mt-6">
                    <div className="flex items-center gap-2 text-white/80 text-xs mb-2">
                      <ShieldCheck size={14} />
                      <span>Security Verification</span>
                    </div>
                    <div 
                      ref={turnstileRef}
                      className="min-h-[65px]"
                    >
                      {!turnstileReady && (
                        <div className="flex items-center gap-2 text-white/60">
                          <Loader2 className="animate-spin" size={14} />
                          <span className="text-xs">Loading...</span>
                        </div>
                      )}
                    </div>
                    {turnstileToken && (
                      <p className="text-xs text-white/90 flex items-center gap-1 mt-1">
                        <ShieldCheck size={12} />
                        Verified
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Side - Form */}
                <form onSubmit={handleSubmit} className="p-4 md:p-8 md:w-2/3">
                  {/* Two column grid for email and phone */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        required
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Phone
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      placeholder="What is this about?"
                      required
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  {/* Message */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="Please describe your issue..."
                      required
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Turnstile on mobile - full width like other fields */}
                  <div className="md:hidden mb-3">
                    <div className="flex items-center gap-2 text-gray-600 text-xs mb-2">
                      <ShieldCheck size={14} className="text-teal-600" />
                      <span>Security Verification</span>
                    </div>
                    <div 
                      ref={!turnstileRef.current ? turnstileRef : undefined}
                      className="flex justify-center"
                    >
                      {!turnstileReady && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <Loader2 className="animate-spin" size={14} />
                          <span className="text-xs">Loading verification...</span>
                        </div>
                      )}
                    </div>
                    {turnstileToken && (
                      <p className="text-xs text-green-600 text-center flex items-center justify-center gap-1 mt-2">
                        <ShieldCheck size={12} />
                        Verified
                      </p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isSubmitting || !turnstileToken}
                    className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupportPopup;
