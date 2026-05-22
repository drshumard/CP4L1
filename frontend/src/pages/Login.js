import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorMessage } from '../utils/errorHandler';
import { trackLogin, trackLoginFailed, trackPageView, trackButtonClicked } from '../utils/analytics';
import { safeSetItem } from '../utils/safeStorage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 'request' = enter email, choose email-link or SMS
  // 'email_sent' = magic link sent confirmation
  // 'code_entry' = enter SMS code (phone is looked up server-side)
  const [stage, setStage] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phoneHint, setPhoneHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const bookingSuccess = searchParams.get('booking') === 'success';
  const bookingMessage = searchParams.get('message') === 'booking_complete';

  useEffect(() => {
    trackPageView('login');
    if (bookingSuccess || bookingMessage) {
      toast.success('Your consultation has been booked! Please sign in to continue.', {
        id: 'booking-login-prompt',
        duration: 6000,
      });
    }
  }, [bookingSuccess, bookingMessage]);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  const showNotification = (type, message) => setNotification({ type, message });

  const handleSendMagicLink = async (e) => {
    e?.preventDefault();
    if (!email) return showNotification('error', 'Please enter your email.');
    setLoading(true);
    try {
      await axios.post(`${API}/auth/magic-link/request`, { email });
      trackButtonClicked('send_magic_link', 'login_page');
      setStage('email_sent');
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        showNotification('error', "We couldn't find an account with that email. Please use the email from your purchase/checkout.");
      } else if (status === 429) {
        showNotification('error', 'Too many requests. Try again in a few minutes.');
      } else if (status === 502) {
        showNotification('error', "We couldn't send the email right now. Please try again in a moment.");
      } else {
        showNotification('error', getErrorMessage(err, 'Could not send sign-in link.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendSmsCode = async () => {
    if (!email) return showNotification('error', 'Please enter your email first.');
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/otp/sms/send`, { email });
      trackButtonClicked('send_sms_code', 'login_page');
      setPhoneHint(response.data?.phone_hint || '');
      setCode('');
      setStage('code_entry');
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        showNotification('error', "We couldn't find an account with that email. Please use the email from your purchase/checkout.");
      } else if (status === 409) {
        showNotification('error', "No phone number is on file for this account. Please use the email sign-in link instead.");
      } else if (status === 503) {
        showNotification('error', 'SMS sign-in is unavailable. Try the email link instead.');
      } else if (status === 429) {
        showNotification('error', 'Too many requests. Try again in a few minutes.');
      } else if (status === 502) {
        showNotification('error', "We couldn't send the code right now. Please try again in a moment.");
      } else {
        showNotification('error', getErrorMessage(err, 'Could not send code.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return showNotification('error', 'Enter the 6-digit code.');
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/otp/sms/verify`, { email, code });
      safeSetItem('access_token', response.data.access_token);
      safeSetItem('refresh_token', response.data.refresh_token);
      if (response.data.email) safeSetItem('user_email', response.data.email);

      trackLogin(response.data.user_id, response.data.email, 'sms_otp');
      showNotification('success', 'Signed in!');

      if (bookingSuccess || bookingMessage) {
        setTimeout(() => navigate('/steps?booking=success'), 600);
      } else {
        setTimeout(() => navigate('/'), 600);
      }
    } catch (err) {
      trackLoginFailed(email, getErrorMessage(err, 'Verification failed'));
      const status = err.response?.status;
      if (status === 400) {
        showNotification('error', 'Invalid or expired code. Try again or request a new one.');
      } else if (status === 404) {
        showNotification('error', "We couldn't find an account with that email.");
      } else if (status === 409) {
        showNotification('error', "No phone number is on file. Please use the email sign-in link instead.");
      } else {
        showNotification('error', getErrorMessage(err, 'Verification failed.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden bg-grid-pattern" style={{ background: '#F4F3F2' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full h-full flex items-center justify-center overflow-x-hidden"
      >
        <Card
          className="shadow-2xl border-0 overflow-hidden w-full max-w-7xl"
          data-testid="login-card"
          style={{
            height: window.innerWidth < 768 ? 'auto' : 'calc(100vh - 4rem)',
            minHeight: window.innerWidth < 768 ? '100vh' : 'auto',
          }}
        >
          <div className="grid md:grid-cols-2 h-full w-full overflow-hidden">
            {/* Left Side - Gradient Panel */}
            <div className="relative bg-gradient-to-br from-teal-500 via-cyan-600 to-cyan-700 p-4 sm:p-6 md:p-12 lg:p-16 flex flex-col justify-center text-white overflow-hidden min-h-[300px] md:min-h-0 w-full">
              <div className="absolute top-10 left-10 md:top-20 md:left-20 w-32 h-32 md:w-64 md:h-64 bg-white/10 rounded-full blur-2xl md:blur-3xl"></div>
              <div className="absolute bottom-10 right-10 md:bottom-32 md:right-20 w-40 h-40 md:w-80 md:h-80 bg-cyan-400/20 rounded-full blur-2xl md:blur-3xl"></div>
              <div className="hidden md:block absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl"></div>

              <div className="relative z-10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                  className="mb-6 md:mb-8"
                >
                  <div className="mb-4 md:mb-8 flex justify-center">
                    <img
                      src="https://portal-drshumard.b-cdn.net/logo.png"
                      alt="Logo"
                      className="w-40 h-40 md:w-56 md:h-56 object-contain"
                    />
                  </div>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 md:mb-6 leading-tight"
                >
                  Welcome to Your<br />Onboarding Portal
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-base md:text-xl text-cyan-100 mb-6 md:mb-12"
                >
                  Sign in to continue your onboarding
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-3 md:space-y-4 hidden sm:block"
                >
                  {['Guided onboarding steps', 'Track your progress', 'Concierge support'].map((line) => (
                    <div key={line} className="flex items-center gap-3 md:gap-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-cyan-50 text-sm md:text-lg">{line}</p>
                    </div>
                  ))}
                </motion.div>
              </div>
            </div>

            {/* Right Side - Passwordless Form */}
            <div className="bg-white p-4 sm:p-6 md:p-10 lg:p-12 xl:p-16 flex flex-col justify-center w-full overflow-hidden">
              <AnimatePresence>
                {notification && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -20, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden mb-4 md:mb-6"
                  >
                    <div
                      className={`p-3 md:p-4 rounded-lg border ${
                        notification.type === 'success'
                          ? 'bg-teal-50 border-teal-200 text-teal-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      <p className="text-xs md:text-sm font-medium leading-relaxed">{notification.message}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mb-6 md:mb-10">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-3">Sign In</h2>
                <p className="text-sm md:text-lg text-gray-600">
                  {stage === 'request' && "Enter your email — we'll send a sign-in link or text you a code."}
                  {stage === 'email_sent' && 'Check your inbox.'}
                  {stage === 'code_entry' && 'Enter the 6-digit code we just sent.'}
                </p>
              </div>

              {/* STAGE: request */}
              {stage === 'request' && (
                <form onSubmit={handleSendMagicLink} className="space-y-4 md:space-y-6" data-testid="request-form">
                  <div className="space-y-2 md:space-y-3">
                    <Label htmlFor="email" className="text-sm md:text-base font-medium text-gray-700">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      className="h-12 md:h-14 px-4 md:px-5 text-sm md:text-base border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      data-testid="email-input"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 md:h-14 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg text-base md:text-lg"
                    disabled={loading}
                    data-testid="send-magic-link-button"
                  >
                    {loading ? 'Sending…' : 'Email me a sign-in link'}
                  </Button>

                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs uppercase tracking-wider text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendSmsCode}
                    disabled={loading}
                    className="w-full text-sm md:text-base text-teal-700 hover:text-teal-800 font-medium underline-offset-4 hover:underline disabled:opacity-50"
                    data-testid="send-sms-instead-button"
                  >
                    Verify with SMS instead
                  </button>
                </form>
              )}

              {/* STAGE: email_sent */}
              {stage === 'email_sent' && (
                <div className="space-y-5" data-testid="email-sent-confirmation">
                  <div className="p-4 md:p-5 rounded-lg border border-teal-200 bg-teal-50 text-teal-900">
                    <p className="text-sm md:text-base">
                      We've sent a sign-in link to <strong>{email}</strong>. The link is valid for 7 days and can be reused.
                    </p>
                  </div>
                  <p className="text-sm text-gray-600">
                    Didn't receive it? Check your spam folder, or try one of the options below.
                  </p>

                  <Button
                    type="button"
                    onClick={handleSendMagicLink}
                    disabled={loading}
                    className="w-full h-12 md:h-14 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg text-base md:text-lg"
                    data-testid="resend-magic-link-button"
                  >
                    {loading ? 'Sending…' : 'Resend sign-in link'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendSmsCode}
                    disabled={loading}
                    className="w-full h-12 md:h-14 text-base md:text-lg"
                    data-testid="switch-to-sms-button"
                  >
                    Text me a code instead
                  </Button>

                  <button
                    type="button"
                    onClick={() => setStage('request')}
                    className="w-full text-sm md:text-base text-gray-600 hover:text-gray-900 font-medium"
                    data-testid="edit-email-button"
                  >
                    ← Edit email
                  </button>
                </div>
              )}

              {/* STAGE: code_entry */}
              {stage === 'code_entry' && (
                <form onSubmit={handleVerifyCode} className="space-y-6" data-testid="code-entry-form">
                  <p className="text-sm md:text-base text-gray-700">
                    We sent a code to the phone on file{phoneHint ? <> (<strong>{phoneHint}</strong>)</> : ''}.
                  </p>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={code} onChange={(v) => setCode(v)} data-testid="otp-input">
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} className="h-12 w-12 md:h-14 md:w-14 text-lg md:text-2xl" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 md:h-14 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg text-base md:text-lg"
                    disabled={loading || code.length !== 6}
                    data-testid="verify-code-button"
                  >
                    {loading ? 'Verifying…' : 'Verify and sign in'}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => { setStage('request'); setCode(''); setPhoneHint(''); }}
                      className="text-gray-600 hover:text-gray-900 font-medium"
                      data-testid="back-to-request-from-code"
                    >
                      ← Use a different email
                    </button>
                    <button
                      type="button"
                      onClick={handleSendSmsCode}
                      disabled={loading}
                      className="text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
                      data-testid="resend-code"
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
