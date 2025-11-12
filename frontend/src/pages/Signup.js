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
    // Stage 0: Welcome animation (6s)
    setTimeout(() => setStage(1), 6000);
    
    // Stage 1: Setting up account (4s) - Call API
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
        toast.error(error.response?.data?.detail || 'Signup failed');
        setTimeout(() => navigate('/login'), 2000);
        return;
      }
    }, 6000);
    
    // Stage 2: Password sent message (6s)
    setTimeout(() => setStage(3), 16000);
    
    // Stage 3: Redirecting message (4s) then navigate to Step 1
    setTimeout(() => navigate('/steps'), 20000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #BFDBFE 100%)' }}>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-blue-400 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [360, 180, 0],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 25, repeat: Infinity }}
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-400 blur-3xl"
        />
      </div>

      {/* Container for both info card and main content */}
      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center">
        {/* Informational Card - Stays visible throughout the flow */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full mb-6"
        >
          <div className="glass-dark rounded-xl p-4 shadow-lg border border-blue-200/30 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="flex-shrink-0"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Activity className="text-white" size={20} />
                </div>
              </motion.div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  🎉 Setting up your wellness portal
                </p>
                <p className="text-xs text-gray-600">
                  Please stay on this page. You'll be automatically redirected to your portal in a moment.
                </p>
              </div>
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="flex-shrink-0"
              >
                <div className="w-2 h-2 rounded-full bg-green-500" />
              </motion.div>
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
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto shadow-xl relative">
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
                    background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="inline-block mb-6"
                >
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto shadow-xl">
                    <div className="w-20 h-20 rounded-full border-4 border-white border-t-transparent" />
                  </div>
                </motion.div>
                
                <h2 className="text-4xl font-bold mb-4 text-gray-800">
                  Setting Up Your Account
                </h2>
                
                <p className="text-lg text-gray-600 mb-6">
                  We're creating your personalized wellness portal...
                </p>
                
                <div className="flex items-center justify-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    className="w-2 h-2 rounded-full bg-blue-500"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 rounded-full bg-blue-500"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 rounded-full bg-blue-500"
                  />
                </div>
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
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0 relative overflow-hidden">
                {/* Success Animation Background */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 2, opacity: [0, 0.3, 0] }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 bg-gradient-to-br from-green-400 to-blue-500 rounded-3xl"
                />
                
                <div className="relative z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                    className="inline-block mb-6"
                  >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center mx-auto shadow-xl">
                      <CheckCircle2 className="text-white" size={56} />
                    </div>
                  </motion.div>
                  
                  <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-4xl font-bold mb-4 text-gray-800"
                  >
                    Account Created Successfully!
                  </motion.h2>
                  
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-6"
                  >
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <Mail className="text-blue-600" size={28} />
                      <Lock className="text-purple-600" size={28} />
                    </div>
                    <p className="text-lg font-semibold text-gray-800 mb-2">
                      Your Login Credentials Have Been Sent
                    </p>
                    <p className="text-gray-600">
                      Check your email at <span className="font-semibold text-blue-600">{email}</span>
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      We've sent your secure password to get started
                    </p>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {stage === 3 && (
            <motion.div
              key="redirecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="glass-dark rounded-3xl p-12 shadow-2xl border-0">
                <motion.div
                  className="inline-block mb-6 relative"
                >
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center mx-auto shadow-xl"
                  >
                    <Activity className="text-white" size={48} />
                  </motion.div>
                  <motion.div
                    animate={{ 
                      scale: [1, 1.3, 1],
                      opacity: [0.3, 0, 0.3]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-green-500"
                  />
                </motion.div>
                
                <h2 className="text-3xl font-bold mb-2 text-gray-800">
                  Taking You to Your Portal...
                </h2>
                <p className="text-gray-600">Get ready to start your wellness journey!</p>
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