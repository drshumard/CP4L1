import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { trackAutoLogin, trackLoginFailed } from '../utils/analytics';
import AuthFrame from './auth/AuthFrame';
import s from './auth/sign-in.module.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AutoLogin = () => {
  const navigate = useNavigate();
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading | error (success goes straight to /welcome)
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
        localStorage.setItem('user_email', response.data.email);
        
        // Track successful auto-login
        trackAutoLogin(response.data.user_id, response.data.email);
        
        // Straight into the welcome (it greets them), then the portal.
        navigate('/welcome', { replace: true });
        
      } catch (error) {
        setStatus('error');
        const message = error.response?.data?.detail || 'Login link is invalid or has expired';
        trackLoginFailed('auto_login', message);
        setErrorMessage(message);
        toast.error(message, {
          id: 'auto-login-error', // Prevents duplicate toasts
          duration: 4000
        });
        
        // Redirect to login after showing error
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    performAutoLogin();
  }, [token, navigate]);

  return (
    <AuthFrame mainId="sign-in">
      <section className={s.signIn} aria-live="polite">
        {status === 'error' ? (
          <div key="error" className={s.step}>
            <h1>We couldn't sign you in</h1>
            <p className={s.copy}>{errorMessage}</p>
            <p className={s.copy}>Redirecting you to login page...</p>
          </div>
        ) : (
          <div key="loading" className={s.step}>
            <h1>Logging you in...</h1>
            <p className={s.copy}>Please wait while we verify your access</p>
          </div>
        )}
      </section>
    </AuthFrame>
  );
};

export default AutoLogin;
