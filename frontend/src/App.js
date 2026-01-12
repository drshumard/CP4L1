import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import BookingThankYou from './pages/BookingThankYou';
import RefundedPage from './pages/RefundedPage';
import SupportPopup from './components/SupportPopup';
import { Toaster } from './components/ui/sonner';
import { trackSessionStart, trackApiError } from './utils/analytics';
import './App.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
    },
  },
});

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Track session start on app load
if (typeof window !== 'undefined') {
  trackSessionStart();
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('access_token');
  return token ? children : <Navigate to="/login" />;
}

// Protected route that checks for refunded status
function RefundedProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isRefunded, setIsRefunded] = useState(false);
  const token = localStorage.getItem('access_token');
  const location = useLocation();

  useEffect(() => {
    const checkRefundedStatus = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await axios.get(`${API}/user/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Step 0 = refunded
        if (res.data?.current_step === 0) {
          setIsRefunded(true);
        }
      } catch (error) {
        // If error, let other error handlers deal with it
      }
      setLoading(false);
    };

    checkRefundedStatus();
  }, [token, location.pathname]);

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  // If user is refunded, redirect to refunded page
  if (isRefunded) {
    return <Navigate to="/refunded" replace />;
  }

  return children;
}

// Axios interceptor component
function AxiosInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    // Flag to prevent multiple 401 handlers running simultaneously
    let isHandling401 = false;
    
    // Response interceptor to handle 401 errors globally
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && !isHandling401) {
          // Check if we're already on login/signup to avoid infinite redirects
          const currentPath = window.location.pathname;
          if (currentPath !== '/login' && currentPath !== '/signup' && currentPath !== '/reset-password') {
            isHandling401 = true;
            
            // Token expired or invalid - clear all auth data
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user_data');
            sessionStorage.clear();
            
            // Show toast only once
            toast.error('Your session has expired. Please login again.', {
              id: 'session-expired', // Prevents duplicate toasts with same ID
              duration: 4000
            });
            
            // Use setTimeout to ensure state cleanup happens before redirect
            setTimeout(() => {
              isHandling401 = false;
              window.location.replace('/login');
            }, 100);
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
          <Route path="/booking-complete" element={<BookingThankYou />} />
          <Route path="/refunded" element={<PrivateRoute><RefundedPage /></PrivateRoute>} />
          <Route path="/" element={<RefundedProtectedRoute><Dashboard /></RefundedProtectedRoute>} />
          <Route path="/dashboard" element={<RefundedProtectedRoute><Dashboard /></RefundedProtectedRoute>} />
          <Route path="/steps" element={<RefundedProtectedRoute><StepsPage /></RefundedProtectedRoute>} />
          <Route path="/outcome" element={<RefundedProtectedRoute><OutcomePage /></RefundedProtectedRoute>} />
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