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
  const [isMobile, setIsMobile] = useState(false);
  const desktopTurnstileRef = useRef(null);
  const mobileTurnstileRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    subject: '',
    message: ''
  });

  // Check screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    const containerRef = isMobile ? mobileTurnstileRef : desktopTurnstileRef;
    if (!containerRef.current || !window.turnstile || !isOpen) return;

    // Remove existing widget if any
    if (widgetIdRef.current !== null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      } catch (e) {
        console.log('Error removing widget:', e);
      }
    }

    // Render new widget with a delay to ensure DOM is ready
    setTimeout(() => {
      const container = isMobile ? mobileTurnstileRef.current : desktopTurnstileRef.current;
      if (container && window.turnstile && isOpen) {
        try {
          widgetIdRef.current = window.turnstile.render(container, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token) => {
              console.log('Turnstile verified');
              setTurnstileToken(token);
            },
            'expired-callback': () => {
              console.log('Turnstile expired');
              setTurnstileToken(null);
            },
            'error-callback': (error) => {
              console.log('Turnstile error:', error);
              setTurnstileToken(null);
            },
            theme: 'light',
            size: 'normal'
          });
          console.log('Turnstile widget ID:', widgetIdRef.current);
        } catch (e) {
          console.error('Error rendering Turnstile:', e);
        }
      }
    }, 300);
  }, [isOpen, isMobile]);

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
                <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-4 md:p-8 text-white md:w-2/5 relative">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="absolute top-3 right-3 text-white/80 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                  
                  <div className="flex items-center gap-3 md:mb-4">
                    <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-white/20 flex items-center justify-center">
                      <HelpCircle size={20} className="md:hidden" />
                      <HelpCircle size={28} className="hidden md:block" />
                    </div>
                    <div className="md:hidden">
                      <h2 className="text-lg font-bold">Need Help?</h2>
                      <p className="text-white/80 text-xs">We'll get back to you shortly</p>
                    </div>
                  </div>
                  
                  <h2 className="hidden md:block text-2xl font-bold mb-3">Need Help?</h2>
                  <p className="hidden md:block text-white/80 text-sm mb-6">
                    We're here to help! Fill out the form and we'll get back to you as soon as possible.
                  </p>

                  {/* Turnstile Widget - Desktop only */}
                  <div className="hidden md:block">
                    <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
                      <ShieldCheck size={16} />
                      <span>Security Verification</span>
                    </div>
                    <div 
                      ref={desktopTurnstileRef}
                      className="min-h-[65px] bg-white/10 rounded-lg p-2"
                    >
                      {!turnstileReady && (
                        <div className="flex items-center justify-center gap-2 text-white/60 h-[50px]">
                          <Loader2 className="animate-spin" size={16} />
                          <span className="text-sm">Loading...</span>
                        </div>
                      )}
                    </div>
                    {turnstileToken && (
                      <p className="text-sm text-white flex items-center gap-1 mt-2">
                        <ShieldCheck size={14} />
                        Verified successfully
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Side - Form */}
                <form onSubmit={handleSubmit} className="p-4 md:p-8 md:w-3/5">
                  {/* Email - full width on mobile */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Purchase Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="your@email.com"
                      required
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  {/* Phone - full width on mobile */}
                  <div className="mb-3">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
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
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
                      placeholder="Please describe your issue in detail..."
                      required
                      rows={3}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    />
                  </div>

                  {/* Turnstile on mobile only */}
                  <div className="md:hidden mb-3">
                    <div className="flex items-center gap-2 text-gray-600 text-xs mb-2">
                      <ShieldCheck size={14} className="text-teal-600" />
                      <span>Security Verification</span>
                    </div>
                    <div 
                      ref={mobileTurnstileRef}
                      className="flex justify-center bg-gray-50 rounded-lg p-3 min-h-[70px]"
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
                    className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
