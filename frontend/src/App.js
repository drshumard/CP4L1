import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StepsPage from './pages/StepsPage';
import AdminDashboard from './pages/AdminDashboard';
import ActivityLogs from './pages/ActivityLogs';
import ResetPassword from './pages/ResetPassword';
import OutcomePage from './pages/OutcomePage';
import AutoLogin from './pages/AutoLogin';
import SupportPopup from './components/SupportPopup';
import { Toaster } from './components/ui/sonner';
import { trackSessionStart, trackApiError, trackEvent } from './utils/analytics';
import './App.css';

// Track session start on app load
if (typeof window !== 'undefined') {
  trackSessionStart();
  
  // Global button click tracker
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button, a, [role="button"]');
    if (button) {
      const buttonText = button.innerText?.trim()?.substring(0, 50) || '';
      const buttonId = button.id || '';
      const buttonClass = button.className || '';
      const ariaLabel = button.getAttribute('aria-label') || '';
      const href = button.getAttribute('href') || '';
      const dataTestId = button.getAttribute('data-testid') || '';
      
      // Get the page/component context
      const pageUrl = window.location.pathname;
      
      // Identify button type
      let buttonType = 'button';
      if (button.tagName === 'A') buttonType = 'link';
      if (button.getAttribute('role') === 'button') buttonType = 'role-button';
      
      trackEvent('button_clicked', {
        button_text: buttonText,
        button_id: buttonId,
        button_type: buttonType,
        aria_label: ariaLabel,
        href: href,
        data_testid: dataTestId,
        page_url: pageUrl,
        element_tag: button.tagName.toLowerCase()
      });
    }
  }, true);
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('access_token');
  return token ? children : <Navigate to="/login" />;
}

// Axios interceptor component
function AxiosInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    // Response interceptor to handle 401 errors globally
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Check if we're already on login/signup to avoid infinite redirects
          const currentPath = window.location.pathname;
          if (currentPath !== '/login' && currentPath !== '/signup') {
            // Token expired or invalid
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            
            // Show toast only once by checking if we haven't already shown it
            if (!sessionStorage.getItem('session_expired_toast_shown')) {
              sessionStorage.setItem('session_expired_toast_shown', 'true');
              toast.error('Your session has expired. Please login again.');
              
              // Clear the flag after navigation
              setTimeout(() => {
                sessionStorage.removeItem('session_expired_toast_shown');
              }, 1000);
            }
            
            // Force navigate to login
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <AxiosInterceptor />
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auto-login/:token" element={<AutoLogin />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/steps" element={<PrivateRoute><StepsPage /></PrivateRoute>} />
          <Route path="/outcome" element={<PrivateRoute><OutcomePage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/logs" element={<PrivateRoute><ActivityLogs /></PrivateRoute>} />
        </Routes>
        <SupportPopup />
        <Toaster position="top-center" />
      </div>
    </BrowserRouter>
  );
}

export default App;