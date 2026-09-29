import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { 
  trackSupportPopupOpened, 
  trackSupportPopupClosed, 
  trackSupportRequestSubmitted, 
  trackSupportRequestFailed 
} from '../utils/analytics';

const TURNSTILE_SITE_KEY = '0x4AAAAAACGpT_eiqf1jAJaS';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

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

  // Let other UI (e.g. the navbar Help icon on mobile, where the floating button is hidden)
  // open the support panel.
  useEffect(() => {
    const open = () => { setIsOpen(true); trackSupportPopupOpened(); };
    window.addEventListener('open-support', open);
    return () => window.removeEventListener('open-support', open);
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
      // Submit through backend which validates Turnstile server-side
      await axios.post(`${BACKEND_URL}/api/support/submit`, {
        email: formData.email,
        phone: formData.phone || null,
        subject: formData.subject,
        message: formData.message,
        turnstile_token: turnstileToken
      });

      // Track successful submission
      trackSupportRequestSubmitted(formData.subject, !!formData.phone);

      toast.success('Support request sent! We\'ll get back to you soon.');
      setFormData({ email: '', phone: '', subject: '', message: '' });
      setTurnstileToken(null);
      setIsOpen(false);
      trackSupportPopupClosed();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to send request. Please try again.';
      
      // Track failed submission
      trackSupportRequestFailed(errorMessage);
      
      toast.error(errorMessage);
      
      // Reset Turnstile if verification failed
      if (error.response?.status === 400) {
        setTurnstileToken(null);
        if (widgetIdRef.current !== null && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch (e) {
            console.log('Error resetting Turnstile:', e);
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const close = () => { setIsOpen(false); trackSupportPopupClosed(); };

  return (
    <>
      {/* Floating Button — desktop only. On mobile the navbar Help icon opens this
          (via the 'open-support' event) so it doesn't sit in the way. */}
      {!isMobile && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setIsOpen(true);
            trackSupportPopupOpened();
          }}
          className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-[#3565e9] text-white shadow-[0_10px_24px_-6px_rgba(53,101,233,0.6)] transition-colors hover:bg-[#2d5bdc]"
          aria-label="Open support"
        >
          <MessageCircle size={24} />
        </motion.button>
      )}

      {/* Modal — the patient dashboard's look: white 18px card, brand-blue panel, gold primary button */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/50 p-4 backdrop-blur-[2px]"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="support-title"
              className="w-full max-w-4xl overflow-hidden rounded-[18px] border border-[#e0e6ef] bg-white font-['Inter_Checkout',Inter,'Helvetica_Neue',Arial,sans-serif] text-[#242f43] shadow-[0_24px_60px_-12px_rgba(35,52,76,0.35)] antialiased"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col md:flex-row">
                {/* Left: brand panel */}
                <div className="relative overflow-hidden bg-[#3565e9] p-5 text-white md:w-2/5 md:p-8">
                  <span className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-white/10" />
                  <span className="pointer-events-none absolute -bottom-20 right-10 size-40 rounded-full bg-white/[0.06]" />
                  {/* z-10: the panel's content below is `relative` and later in the DOM, so it painted over most of this button. */}
                  <button type="button" onClick={close} aria-label="Close"
                    className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/15 text-white/90 transition-colors hover:bg-white/25 hover:text-white">
                    <X size={18} />
                  </button>

                  <div className="relative flex items-center gap-3 md:block">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/25 bg-white/15 md:size-12">
                      <MessageCircle size={22} />
                    </span>
                    <div className="md:mt-6">
                      <h2 id="support-title" className="text-xl font-medium tracking-[-0.03em] md:text-[28px] md:leading-tight">Need help?</h2>
                      <p className="mt-0.5 text-xs text-[#dbe5ff] md:hidden">We’ll get back to you shortly.</p>
                    </div>
                  </div>
                  <p className="relative mt-3 hidden max-w-xs text-[15px] leading-relaxed text-[#e4ecff] md:block">
                    Questions about your booking, your health profile or your add-ons? Send us a message and our team will get back to you shortly.
                  </p>

                  {/* Turnstile Widget - Desktop only */}
                  <div className="relative mt-8 hidden overflow-hidden md:block">
                    <div className="mb-2 flex items-center gap-2 text-sm text-[#e4ecff]">
                      <ShieldCheck size={16} />
                      <span>Security verification</span>
                    </div>
                    <div
                      ref={desktopTurnstileRef}
                      className="overflow-hidden"
                      style={{ maxWidth: '100%', transform: 'scale(0.9)', transformOrigin: 'left top' }}
                    />
                    {!turnstileReady && (
                      <div className="mt-2 flex items-center gap-2 text-white/70">
                        <Loader2 className="animate-spin" size={16} />
                        <span className="text-sm">Loading...</span>
                      </div>
                    )}
                    {turnstileToken && (
                      <p className="mt-2 flex items-center gap-1 text-sm text-white">
                        <ShieldCheck size={14} />
                        Verified successfully
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: form */}
                <form onSubmit={handleSubmit} className="space-y-4 p-5 md:w-3/5 md:p-8">
                  <Field label="Purchase email" required>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required className={FIELD} />
                  </Field>
                  <Field label="Phone number">
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" className={FIELD} />
                  </Field>
                  <Field label="Subject" required>
                    <input type="text" name="subject" value={formData.subject} onChange={handleChange} placeholder="What is this about?" required className={FIELD} />
                  </Field>
                  <Field label="Message" required>
                    <textarea name="message" value={formData.message} onChange={handleChange} placeholder="Tell us how we can help..." required rows={4} className={`${FIELD} resize-none`} />
                  </Field>

                  {/* Turnstile on mobile only */}
                  <div className="md:hidden">
                    <div className="mb-2 flex items-center gap-2 text-xs text-[#5d6a7e]">
                      <ShieldCheck size={14} className="text-[#3565e9]" />
                      <span>Security verification</span>
                    </div>
                    <div ref={mobileTurnstileRef} className="flex justify-center" />
                    {!turnstileReady && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-[#8d96a4]">
                        <Loader2 className="animate-spin" size={14} />
                        <span className="text-xs">Loading verification...</span>
                      </div>
                    )}
                    {turnstileToken && (
                      <p className="mt-2 flex items-center justify-center gap-1 text-xs text-[#2b7457]">
                        <ShieldCheck size={12} />
                        Verified
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !turnstileToken}
                    className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[9px] border border-[#edb43f] bg-[#ffc24a] px-5 text-[15px] font-semibold text-[#382d19] shadow-[0_2px_3px_#7555120a] transition-colors hover:bg-[#ffb92f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send message
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Checkout-style field: overrides the portal's global teal input focus with the brand blue one.
const FIELD = 'w-full rounded-lg border border-[#dfe3e9] bg-white px-3.5 py-2.5 text-[15px] text-[#242f43] placeholder:text-[#8d96a4] shadow-[0_1px_2px_#15274b04] outline-none focus:!border-[#7c91cf] focus:![box-shadow:0_0_0_3px_#eaf0ff]';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#3c4554]">{label}{required && <span className="text-[#b42318]"> *</span>}</span>
      {children}
    </label>
  );
}

export default SupportPopup;
