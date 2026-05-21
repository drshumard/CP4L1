import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { HeartPulse, CheckCircle2, Activity } from 'lucide-react';
import { getErrorMessage } from '../utils/errorHandler';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(0); // 0: welcome, 1: setting up, 2: account ready, 3: redirecting
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(0); // Progress percentage 0-100
  const signupStartedRef = useRef(false); // Prevent double execution

  // Signup process starts automatically via the other useEffect

  const startSignupProcess = useCallback(async (userEmail, userName) => {
    // The welcome animation and the API call run in parallel. The animation
    // is purely presentational (acknowledges the screen for ~2s); the API
    // fires on mount so the fast path — webhook already landed — can
    // complete in well under 5s instead of forcing a 16s minimum wait.
    const startTime = Date.now();
    const MIN_WELCOME_MS = 2000;       // user sees the welcome stage at least this long
    const ANIMATION_TARGET_SECONDS = 14; // progress bar fills over ~14s; holds at 95% if API is slower

    const progressInterval = setInterval(() => {
      setProgress(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= ANIMATION_TARGET_SECONDS) return 95;
        return Math.min((elapsed / ANIMATION_TARGET_SECONDS) * 95, 95);
      });
    }, 200);

    // Animation: welcome (stage 0) → setting up (stage 1) after MIN_WELCOME_MS.
    setTimeout(() => {
      setStage((s) => (s < 2 ? 1 : s));
    }, MIN_WELCOME_MS);

    // API fires immediately. When it returns, we wait out the welcome minimum
    // before transitioning to stage 2 so the user always sees the intro frame.
    try {
      const response = await axios.post(`${API}/auth/signup`, {
        email: userEmail,
        name: userName,
      });

      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user_email', userEmail);

      const elapsed = Date.now() - startTime;
      const waitBeforeReady = Math.max(0, MIN_WELCOME_MS - elapsed);

      setTimeout(() => {
        setProgress(100);
        setStage(2);
        setTimeout(() => setStage(3), 800);
        setTimeout(() => {
          clearInterval(progressInterval);
          navigate('/steps', { replace: true });
        }, 1600);
      }, waitBeforeReady);

    } catch (error) {
      clearInterval(progressInterval);

      const errorMessage = error.response?.status === 404
        ? 'Please make sure you have completed payment. If you have and believe this is a mistake, contact admin@drshumard.com'
        : getErrorMessage(error, 'Signup failed. Please try again.');

      toast.error(errorMessage, { id: 'signup-error', duration: 8000 });
      setTimeout(() => navigate('/login', { replace: true }), 8000);
    }
  }, [navigate]);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (signupStartedRef.current) {
      return;
    }

    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name') || 'there';
    
    if (emailParam) {
      signupStartedRef.current = true;
      // Fix for GHL redirect: spaces in email should be + signs
      // (browsers decode + as space in query strings, but + is valid in emails)
      const fixedEmail = emailParam.replace(/ /g, '+');
      const decodedName = decodeURIComponent(nameParam);
      setEmail(fixedEmail);
      setName(decodedName);
      startSignupProcess(fixedEmail, decodedName);
    } else {
      toast.error('Invalid signup link', { id: 'invalid-signup-link' });
      navigate('/login');
    }
  }, [searchParams, navigate, startSignupProcess]);

  // Handle browser back button - redirect to dashboard instead of re-running signup
  useEffect(() => {
    const handlePopState = () => {
      // If user presses back, redirect to dashboard
      navigate('/dashboard', { replace: true });
    };

    // Push a dummy state so we can intercept back button
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#F4F3F2' }}>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-teal-400 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [360, 180, 0],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 25, repeat: Infinity }}
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-cyan-400 blur-3xl"
        />
      </div>

      {/* Container for both info card and main content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
        {/* Informational Card with Progress - Stays visible throughout the flow */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full mb-6"
        >
          <div className="glass-dark rounded-2xl p-6 shadow-lg border border-cyan-200/30 backdrop-blur-md">
            <div className="flex items-center gap-6">
              {/* Circular Progress */}
              <div className="relative flex-shrink-0">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-200" />
                  <motion.circle
                    cx="48" cy="48" r="44"
                    stroke="url(#progressGradient)"
                    strokeWidth="4" fill="none" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - progress / 100) }}
                    transition={{ duration: 0.3 }}
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.span 
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-xl font-bold text-teal-700 tabular-nums"
                  >
                    {Math.floor(progress)}%
                  </motion.span>
                </div>
              </div>
              
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-800 mb-2">
                  ⏳ Please be patient while we set you up
                </p>
                <p className="text-sm text-gray-600">
                  Stay on this page. You will be automatically redirected to your portal in a moment.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="w-full">
        <AnimatePresence mode="wait">
          {stage === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="inline-block mb-6"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center mx-auto shadow-xl relative">
                    <HeartPulse className="text-white" size={48} />
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border-2 border-white"
                    />
                  </div>
                </motion.div>
                
                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-5xl font-bold mb-4"
                  style={{
                    background: 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Welcome to Dr. Shumard Portal
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-xl text-gray-700"
                >
                  {name}, we are thrilled to have you here!
                </motion.p>
              </div>
            </motion.div>
          )}

          {stage === 1 && (
            <motion.div
              key="setting-up"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="inline-block mb-6"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-teal-700 flex items-center justify-center mx-auto shadow-xl">
                    <Activity className="text-white" size={48} />
                  </div>
                </motion.div>
                
                <h2 className="text-5xl font-bold mb-4" style={{
                  background: 'linear-gradient(135deg, #06B6D4 0%, #14B8A6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Setting Up Your Account
                </h2>
                
                <p className="text-xl text-gray-700 mb-3">
                  Creating your personalized wellness dashboard...
                </p>
                <p className="text-sm text-gray-600">
                  This may take a moment — please don't close this page.
                </p>
              </div>
            </motion.div>
          )}

          {stage === 2 && (
            <motion.div
              key="account-ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="inline-block mb-6"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center mx-auto shadow-xl">
                    <CheckCircle2 className="text-white" size={48} />
                  </div>
                </motion.div>

                <h2 className="text-5xl font-bold mb-4" style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Account Ready!
                </h2>

                <p className="text-xl text-gray-700">
                  Taking you to your portal...
                </p>
              </div>
            </motion.div>
          )}

          {stage === 3 && (
            <motion.div
              key="redirecting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="inline-block mb-6"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center mx-auto shadow-xl">
                    <Activity className="text-white" size={48} />
                  </div>
                </motion.div>
                
                <h2 className="text-5xl font-bold mb-4" style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #14B8A6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  Taking You to Your Portal...
                </h2>
                
                <p className="text-xl text-gray-700">
                  Get ready to start your wellness journey!
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Signup;