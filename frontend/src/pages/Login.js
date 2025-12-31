import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorMessage } from '../utils/errorHandler';
import { trackLogin, trackLoginFailed, trackPasswordResetRequested, trackPageView, trackButtonClicked } from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: '' }

  // Track page view on mount
  useEffect(() => {
    trackPageView('login');
  }, []);

  // Auto-hide notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type, message) => {
    setNotification({ type, message });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, formData);
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      
      // Track successful login
      trackLogin(response.data.user_id, formData.email, 'password');
      
      showNotification('success', 'Login successful!');
      setTimeout(() => navigate('/'), 1000);
    } catch (error) {
      // Track failed login
      trackLoginFailed(formData.email, getErrorMessage(error, 'Login failed'));
      showNotification('error', getErrorMessage(error, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      showNotification('error', 'Please enter your email');
      return;
    }

    try {
      await axios.post(`${API}/auth/request-reset`, { email: resetEmail });
      trackPasswordResetRequested(resetEmail);
      showNotification('success', 'Password reset link sent to your email');
      setShowResetModal(false);
      setResetEmail('');
    } catch (error) {
      showNotification('error', 'Failed to send reset email');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 overflow-x-hidden" style={{ background: '#F4F3F2' }}>
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
            minHeight: window.innerWidth < 768 ? '100vh' : 'auto'
          }}
        >
          <div className="grid md:grid-cols-2 h-full w-full overflow-hidden">
            {/* Left Side - Gradient Panel */}
            <div className="relative bg-gradient-to-br from-teal-500 via-cyan-600 to-cyan-700 p-4 sm:p-6 md:p-12 lg:p-16 flex flex-col justify-center text-white overflow-hidden min-h-[300px] md:min-h-0 w-full">
              {/* Decorative circles */}
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
                  Welcome to Your<br />Wellness Portal
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-base md:text-xl text-cyan-100 mb-6 md:mb-12"
                >
                  Continue your journey to better health and wellness
                </motion.p>
                
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-3 md:space-y-4 hidden sm:block"
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-cyan-50 text-sm md:text-lg">Personalized wellness programs</p>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-cyan-50 text-sm md:text-lg">Track your progress</p>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-cyan-50 text-sm md:text-lg">Expert health advocate support</p>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="bg-white p-4 sm:p-6 md:p-10 lg:p-12 xl:p-16 flex flex-col justify-center w-full overflow-hidden">
              {/* Inline Notification */}
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
                      <div className="flex items-start justify-between gap-2 md:gap-3">
                        <div className="flex items-start gap-2 md:gap-3 flex-1">
                          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                            notification.type === 'success' ? 'bg-teal-500' : 'bg-red-500'
                          }`}>
                            {notification.type === 'success' ? (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          <p className="text-xs md:text-sm font-medium leading-relaxed">{notification.message}</p>
                        </div>
                        <button
                          onClick={() => setNotification(null)}
                          className={`flex-shrink-0 ${
                            notification.type === 'success' ? 'text-teal-600 hover:text-teal-800' : 'text-red-600 hover:text-red-800'
                          } transition-colors`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mb-6 md:mb-10">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-3">Sign In</h2>
                <p className="text-sm md:text-lg text-gray-600">Enter your credentials to access your account</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6" data-testid="login-form">
                <div className="space-y-2 md:space-y-3">
                  <Label htmlFor="email" className="text-sm md:text-base font-medium text-gray-700">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="h-12 md:h-14 px-4 md:px-5 text-sm md:text-base border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                    data-testid="email-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                
                <div className="space-y-2 md:space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password" className="text-sm md:text-base font-medium text-gray-700">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        trackButtonClicked('forgot_password', 'login_page');
                        setShowResetModal(true);
                      }}
                      className="text-xs md:text-base text-teal-600 hover:text-teal-700 font-medium"
                      data-testid="forgot-password-button"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="h-12 md:h-14 px-4 md:px-5 text-sm md:text-base border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                    data-testid="password-input"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 md:h-14 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-lg shadow-lg text-base md:text-lg mt-6 md:mt-8"
                  disabled={loading}
                  data-testid="login-submit-button"
                  onClick={() => trackButtonClicked('sign_in', 'login_page')}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </div>
          </div>
        </Card>

        {showResetModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" data-testid="reset-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <Card className="w-full max-w-md mx-auto">
                <CardHeader>
                  <CardTitle className="text-xl md:text-2xl">Reset Password</CardTitle>
                  <CardDescription className="text-sm md:text-base">Enter your email to receive a reset link</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    className="h-12 text-sm md:text-base"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    data-testid="reset-email-input"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button 
                      onClick={() => {
                        trackButtonClicked('send_reset_link', 'password_reset_modal');
                        handlePasswordReset();
                      }} 
                      className="flex-1 h-11 text-sm md:text-base" 
                      data-testid="send-reset-button"
                    >
                      Send Reset Link
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        trackButtonClicked('cancel_reset', 'password_reset_modal');
                        setShowResetModal(false);
                      }} 
                      className="h-11 text-sm md:text-base"
                      data-testid="cancel-reset-button"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Login;