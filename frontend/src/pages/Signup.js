import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { HeartPulse, Mail, CheckCircle2, Lock, Activity } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stage, setStage] = useState(0); // 0: welcome, 1: setting up, 2: password sent, 3: redirecting
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState(0); // Progress percentage 0-100

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name') || 'there';
    
    if (emailParam) {
      setEmail(emailParam);
      setName(nameParam);
      startSignupProcess(emailParam, nameParam);
    } else {
      toast.error('Invalid signup link');
      navigate('/login');
    }
  }, [searchParams, navigate]);

  const startSignupProcess = async (userEmail, userName) => {
    // Progress animation - smooth updates every 500ms for better visual appeal
    // Total: 20s, but progress reaches 100% at 19.5s on the final stage
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const currentTime = Date.now();
        const elapsed = (currentTime - startTime) / 1000; // seconds elapsed
        
        if (elapsed >= 19.5) {
          return 100; // Final stage, show 100%
        }
        
        // Calculate progress: 0% at 0s, ~95% at 16s (when stage 3 starts), 100% at 19.5s
        const calculatedProgress = (elapsed / 19.5) * 100;
        return Math.min(calculatedProgress, 100);
      });
    }, 500);
    
    const startTime = Date.now();

    // Stage 0: Welcome animation (6s) - 0% to 30%
    setTimeout(() => setStage(1), 6000);
    
    // Stage 1: Setting up account (4s) - 30% to 50%
    // Wait 12 seconds (6s welcome + 6s extra) before checking email/calling API
    // This gives the GHL webhook time to create the user in the database
    setTimeout(async () => {
      try {
        const response = await axios.post(`${API}/auth/signup`, {
          email: userEmail,
          name: userName,
          password: 'auto-generated'
        });

        localStorage.setItem('access_token', response.data.access_token);
        localStorage.setItem('refresh_token', response.data.refresh_token);
        
        setStage(2); // Already sent (password was sent via webhook)
      } catch (error) {
        clearInterval(progressInterval);
        toast.error(error.response?.data?.detail || 'Signup failed');
        setTimeout(() => navigate('/login'), 2000);
        return;
      }
    }, 12000); // Changed from 6000 to 12000 (12 seconds total delay)
    
    // Stage 2: Password sent message (4s) - 50% to ~80%
    setTimeout(() => setStage(3), 16000);
    
    // Stage 3: Redirecting message (4s) - ~80% to 100% then navigate to Step 1
    setTimeout(() => {
      clearInterval(progressInterval);
      navigate('/steps');
    }, 20000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
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
                  Stay on this page. You'll be automatically redirected to your portal in a moment.
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
                  {name}, we're thrilled to have you here!
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
                
                <p className="text-xl text-gray-700">
                  Creating your personalized wellness dashboard...
                </p>
              </div>
            </motion.div>
          )}

          {stage === 2 && (
            <motion.div
              key="password-sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5 }}
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
                  Password Sent!
                </h2>
                
                <p className="text-xl text-gray-700">
                  Check {email} for your login credentials
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
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center mx-auto shadow-xl">
                    <Activity className="text-white" size={48} />
                  </div>
                </motion.div>
                
                <h2 className="text-5xl font-bold mb-4" style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #2563EB 100%)',
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