import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { trackAutoLogin, trackLoginFailed } from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AutoLogin = () => {
  const navigate = useNavigate();
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const loginAttemptedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (loginAttemptedRef.current) {
      return;
    }
    loginAttemptedRef.current = true;

    const performAutoLogin = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage('Invalid login link');
        trackLoginFailed('auto_login', 'Invalid login link');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
        return;
      }

      try {
        const response = await axios.get(`${API}/auth/auto-login/${token}`);
        
        // Store tokens
        localStorage.setItem('access_token', response.data.access_token);
        localStorage.setItem('refresh_token', response.data.refresh_token);
        
        // Track successful auto-login
        trackAutoLogin(response.data.user_id, response.data.email);
        
        setStatus('success');
        toast.success('Welcome back! Logging you in...');
        
        // Redirect to steps page after brief success message
        setTimeout(() => {
          navigate('/steps', { replace: true });
        }, 1500);
        
      } catch (error) {
        setStatus('error');
        const message = error.response?.data?.detail || 'Login link is invalid or has expired';
        trackLoginFailed('auto_login', message);
        setErrorMessage(message);
        toast.error(message);
        
        // Redirect to login after showing error
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    performAutoLogin();
  }, [token, navigate]);

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#F4F3F2' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
      >
        {status === 'loading' && (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="flex justify-center mb-4"
            >
              <Loader2 className="w-16 h-16 text-teal-600" />
            </motion.div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Logging you in...
            </h2>
            <p className="text-gray-600">
              Please wait while we verify your access
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <CheckCircle2 className="w-16 h-16 text-green-500" />
            </motion.div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Welcome Back!
            </h2>
            <p className="text-gray-600">
              Redirecting you to your portal...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <XCircle className="w-16 h-16 text-red-500" />
            </motion.div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Login Link Expired
            </h2>
            <p className="text-gray-600 mb-4">
              {errorMessage}
            </p>
            <p className="text-sm text-gray-500">
              Redirecting you to login page...
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default AutoLogin;
