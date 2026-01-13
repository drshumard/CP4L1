import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CheckCircle2, CheckCircle, Circle, Home, User as UserIcon, Phone, Calendar, LogOut, Loader2, Clock, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactPlayer from 'react-player';
import { getErrorMessage } from '../utils/errorHandler';
import PracticeBetterEmbed from '../components/PracticeBetterEmbed';
import OnboardingBooking from '../components/OnboardingBooking';
import IntakeForm from '../components/IntakeForm';
import { 
  trackStepViewed, 
  trackStepCompleted, 
  trackVideoStarted, 
  trackVideoCompleted,
  trackVideoProgress,
  trackFormViewed,
  trackBookingCalendarViewed,
  trackButtonClicked,
  trackLogout,
  trackModalOpened,
  trackModalClosed
} from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEP_DATA = {
  1: {
    title: 'Welcome & Consultation Booking',
    action: 'BOOK YOUR ONE-ON-ONE CONSULT',
    videoUrl: 'https://iframe.mediadelivery.net/embed/538298/faa2085a-bc34-43b4-8212-b6ca6b3a660f',
    videoId: 'faa2085a-bc34-43b4-8212-b6ca6b3a660f',
    description: 'Watch the welcome video and book your personal consultation with our health advocate.',
    tasks: ['book_consultation']
  },
  2: {
    title: 'Complete Your Health Profile',
    action: 'FILL OUT YOUR HEALTH INFORMATION',
    videoUrl: 'https://iframe.mediadelivery.net/embed/538298/8fe9ed89-9b07-4efb-bc1d-65fc1095b692',
    videoId: '8fe9ed89-9b07-4efb-bc1d-65fc1095b692',
    description: 'Provide your health information to help us personalize your wellness journey.',
    tasks: ['complete_form']
  },
  3: {
    title: 'Program Complete',
    action: 'REVIEW YOUR NEXT STEPS',
    videoUrl: 'https://iframe.mediadelivery.net/embed/538298/16efcf1b-e6f7-4c29-b0f7-82107b2f6935',
    videoId: '16efcf1b-e6f7-4c29-b0f7-82107b2f6935',
    description: 'Congratulations! You have completed the onboarding process.',
    tasks: ['review_summary']
  }
};

// Webhook URL for step completion notifications
const STEP_COMPLETION_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/ygLPhGfHB5mDOoTJ86um/webhook-trigger/64b3e792-3c1e-4887-b8e3-efa79c58a704';

const StepsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userData, setUserData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completedTasks, setCompletedTasks] = useState(new Set());
  const [showStep2Instructions, setShowStep2Instructions] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(true);
  const [videoAutoplay, setVideoAutoplay] = useState(false);
  const [showStep1Confirmation, setShowStep1Confirmation] = useState(false);
  const [showStep2Confirmation, setShowStep2Confirmation] = useState(false);
  const [showBookingSuccess, setShowBookingSuccess] = useState(false);
  const [showBookingManualConfirm, setShowBookingManualConfirm] = useState(false);
  const [bookingProcessing, setBookingProcessing] = useState(false);
  const [manualConfirmLoading, setManualConfirmLoading] = useState(false);
  const [previousStep, setPreviousStep] = useState(null);
  const [pbClientRecordId, setPbClientRecordId] = useState(null);
  // SUNFLOWER: iframeHeight state removed - now handled by PracticeBetterEmbed component

  // Intake form state tracking
  const [intakeFormState, setIntakeFormState] = useState({
    currentPart: 1,
    isSaving: false,
    isSubmitting: false,
    lastSaved: null
  });
  const intakeFormRef = useRef(null);

  // Logout confirmation dialog state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Session expiration warning state
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [sessionExpiryCountdown, setSessionExpiryCountdown] = useState(30);
  const sessionWarningTimerRef = useRef(null);
  const sessionCheckIntervalRef = useRef(null);

  // Helper function to decode JWT and get expiry time
  const getTokenExpiry = useCallback(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000; // Convert to milliseconds
    } catch {
      return null;
    }
  }, []);

  // Refresh session by calling the refresh token endpoint
  const refreshSession = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token');
      }
      
      const response = await axios.post(`${API}/auth/refresh?refresh_token=${encodeURIComponent(refreshToken)}`);
      
      if (response.data.access_token) {
        localStorage.setItem('access_token', response.data.access_token);
        localStorage.setItem('refresh_token', response.data.refresh_token);
        setShowSessionWarning(false);
        toast.success('Session renewed for another 24 hours');
        return true;
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
      toast.error('Failed to renew session. Please log in again.');
      return false;
    }
  }, []);

  // Handle session expiration countdown and auto-logout
  useEffect(() => {
    if (showSessionWarning) {
      sessionWarningTimerRef.current = setInterval(() => {
        setSessionExpiryCountdown(prev => {
          if (prev <= 1) {
            // Time's up - log out
            clearInterval(sessionWarningTimerRef.current);
            performLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        if (sessionWarningTimerRef.current) {
          clearInterval(sessionWarningTimerRef.current);
        }
      };
    }
  }, [showSessionWarning]);

  // Check session expiry periodically
  useEffect(() => {
    const checkSessionExpiry = () => {
      const expiryTime = getTokenExpiry();
      if (!expiryTime) return;
      
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;
      
      // Show warning 30 seconds before expiry
      if (timeUntilExpiry > 0 && timeUntilExpiry <= 30000 && !showSessionWarning) {
        setSessionExpiryCountdown(Math.ceil(timeUntilExpiry / 1000));
        setShowSessionWarning(true);
        trackModalOpened('session_expiry_warning');
      }
    };
    
    // Check every 5 seconds
    sessionCheckIntervalRef.current = setInterval(checkSessionExpiry, 5000);
    
    // Initial check
    checkSessionExpiry();
    
    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [getTokenExpiry, showSessionWarning]);

  // Logout function
  const performLogout = useCallback(() => {
    trackButtonClicked('logout', 'steps_page');
    trackLogout(userData?.id);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    toast.success('Logged out successfully');
    navigate('/login');
  }, [navigate, userData?.id]);

  // Helper function to send step completion webhook
  const sendStepCompletionWebhook = async (email, step) => {
    if (!email) {
      console.warn('No email provided for webhook, skipping');
      return;
    }
    
    try {
      const response = await fetch(STEP_COMPLETION_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          step: step
        })
      });
      console.log(`Step ${step} completion webhook sent for ${email}, status: ${response.status}`);
    } catch (error) {
      // CORS error is expected but request still goes through
      console.log(`Step ${step} completion webhook sent for ${email} (CORS expected)`);
    }
  };

  // Helper to get user email - always use userData from database
  const getUserEmail = () => {
    return userData?.email || null;
  };

  // POLLING: Check for step advancement every 3 seconds while on Step 1
  // This detects when the backend webhook advances the user after booking
  useEffect(() => {
    // Only poll if user is on Step 1 and not currently processing a booking
    if (progressData?.current_step !== 1 || bookingProcessing || loading) {
      return;
    }

    let pollCount = 0;
    const maxPolls = 20; // Stop polling after 60 seconds (20 * 3s)

    const pollForStepChange = async () => {
      pollCount++;
      
      // Stop polling after max attempts
      if (pollCount > maxPolls) {
        console.log('Polling stopped after max attempts');
        return;
      }

      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const res = await axios.get(`${API}/user/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // If user was advanced to Step 2 (by backend webhook), show success and refresh
        if (res.data?.current_step === 2 && progressData?.current_step === 1) {
          console.log('Step advancement detected via polling!');
          setBookingProcessing(true); // Prevent other handlers
          setShowBookingSuccess(true);
          
          // After 3 seconds, refresh data and show welcome message
          setTimeout(async () => {
            setShowBookingSuccess(false);
            setBookingProcessing(false);
            await fetchData();
            toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
          }, 3000);
        }
      } catch (error) {
        // Silently fail - polling shouldn't disrupt user experience
        console.log('Polling check failed:', error.message);
      }
    };

    // Poll every 3 seconds
    const pollInterval = setInterval(pollForStepChange, 3000);

    return () => clearInterval(pollInterval);
  }, [progressData?.current_step, bookingProcessing, loading]);

  // Handle booking from URL parameter (redirected from Practice Better)
  useEffect(() => {
    const bookingParam = searchParams.get('booking');
    
    if (bookingParam === 'success' && !bookingProcessing) {
      setBookingProcessing(true);
      console.log('Booking success URL param detected');
      
      // Remove the query parameter from URL
      searchParams.delete('booking');
      setSearchParams(searchParams, { replace: true });
      
      // Show the success modal
      setShowBookingSuccess(true);
      
      // Check if user needs to be advanced (in case webhook was slow/failed)
      const ensureAdvancement = async () => {
        try {
          const token = localStorage.getItem('access_token');
          if (!token) return;
          
          // Check current step
          const progressRes = await axios.get(`${API}/user/progress`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          // If still on Step 1, advance them (webhook may have failed)
          if (progressRes.data?.current_step === 1) {
            console.log('User still on Step 1, advancing via frontend...');
            
            await axios.post(
              `${API}/user/complete-task`,
              { task_id: 'book_consultation' },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            
            await axios.post(
              `${API}/user/advance-step`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } catch (error) {
          console.error('Error ensuring advancement:', error);
        }
        
        // After 3 seconds, close modal and refresh
        setTimeout(async () => {
          setShowBookingSuccess(false);
          setBookingProcessing(false);
          await fetchData();
          toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
        }, 3000);
      };
      
      ensureAdvancement();
    }
    
    // Manual flow - show manual confirm modal (fallback for edge cases)
    if (bookingParam === 'manual' && !bookingProcessing) {
      console.log('Manual booking flow detected');
      
      // Remove the query parameter from URL
      searchParams.delete('booking');
      setSearchParams(searchParams, { replace: true });
      
      // Show the manual confirmation modal
      setShowBookingManualConfirm(true);
    }
  }, [searchParams, setSearchParams, bookingProcessing]);
  
  // Handle manual booking confirmation
  const handleManualBookingConfirm = async () => {
    setManualConfirmLoading(true);
    
    try {
      const token = localStorage.getItem('access_token');
      
      if (token) {
        await axios.post(
          `${API}/user/complete-task`,
          { task_id: 'book_consultation' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        await axios.post(
          `${API}/user/advance-step`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setShowBookingManualConfirm(false);
      await fetchData();
      toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
    } catch (error) {
      console.error('Error confirming booking:', error);
      toast.error('Failed to update progress. Please try again.', { id: 'booking-error' });
    } finally {
      setManualConfirmLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    /* SUNFLOWER CHECKPOINT: SDK loading commented out - using direct iframe instead
    // Load Practice Better booking widget script
    const script = document.createElement('script');
    script.src = 'https://cdn.practicebetter.io/assets/js/booking.widget.js';
    script.type = 'text/javascript';
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector('script[src="https://cdn.practicebetter.io/assets/js/booking.widget.js"]');
      if (existingScript) {
        document.body.removeChild(existingScript);
      }
    };
    */
  }, []);

  // Scroll to top when step changes
  useEffect(() => {
    if (progressData?.current_step) {
      // Scroll both window and the main content container
      window.scrollTo(0, 0);
      // Also scroll the main content container (which has overflow-y-auto)
      const mainContent = document.querySelector('[data-main-content]');
      if (mainContent) {
        mainContent.scrollTo(0, 0);
      }
    }
  }, [progressData?.current_step]);

  /* SUNFLOWER CHECKPOINT: Widget reinitialization commented out - using direct iframe instead
  // Reinitialize Practice Better widget when step changes to ensure forms load
  useEffect(() => {
    if (progressData && progressData.current_step === 2 && window.PracticeBetter) {
      // Wait for DOM to update, then reinitialize
      setTimeout(() => {
        window.PracticeBetter.init();
      }, 500);
    }
  }, [progressData]);
  */

  /* SUNFLOWER CHECKPOINT: iframe height listener commented out - now handled by PracticeBetterEmbed component
  // Listen for iframe height changes from Practice Better widget
  useEffect(() => {
    const handleMessage = (event) => {
      // Practice Better may send height updates via postMessage
      if (event.data && typeof event.data === 'object') {
        if (event.data.height) {
          setIframeHeight(`${event.data.height}px`);
        } else if (event.data.frameHeight) {
          setIframeHeight(`${event.data.frameHeight}px`);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Also observe iframe loads and try to detect height changes
    const checkIframeHeight = () => {
      const widget = document.querySelector('.better-inline-booking-widget');
      if (widget) {
        const iframe = widget.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
          try {
            // Try to get iframe content height
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc && iframeDoc.body) {
              const height = iframeDoc.body.scrollHeight;
              if (height > 0) {
                setIframeHeight(`${height}px`);
              }
            }
          } catch (e) {
            // Cross-origin restriction - rely on postMessage
          }
        }
      }
    };

    // Check periodically for height changes
    const interval = setInterval(checkIframeHeight, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, []);
  */

  // Check if user has seen Step 2 instructions
  useEffect(() => {
    if (userData?.current_step === 2 && userData) {
      const hasSeenInstructions = localStorage.getItem('step2_instructions_seen');
      if (!hasSeenInstructions) {
        setShowStep2Instructions(true);
        trackModalOpened('step2_instructions');
      }
    }
  }, [userData]);

  // Track step view when progressData changes
  useEffect(() => {
    if (progressData?.current_step && STEP_DATA[progressData.current_step]) {
      trackStepViewed(progressData.current_step, STEP_DATA[progressData.current_step].title);
      
      // Track specific views
      if (progressData.current_step === 1) {
        trackBookingCalendarViewed();
      } else if (progressData.current_step === 2) {
        trackFormViewed('health_profile', 2);
      }
    }
  }, [progressData?.current_step]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const [userRes, progressRes] = await Promise.all([
        axios.get(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/user/progress`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setUserData(userRes.data);
      setProgressData(progressRes.data);
      
      // Load Practice Better client record ID from backend (fallback to localStorage)
      // This ensures the ID persists across devices/sessions
      if (progressRes.data.pb_client_record_id) {
        setPbClientRecordId(progressRes.data.pb_client_record_id);
        // Also sync to localStorage for immediate use
        localStorage.setItem('pb_client_record_id', progressRes.data.pb_client_record_id);
      } else {
        // Fallback to localStorage for backwards compatibility
        const storedId = localStorage.getItem('pb_client_record_id');
        if (storedId) {
          setPbClientRecordId(storedId);
        }
      }

      // If user has completed the program (step 4), redirect to outcome
      if (progressRes.data.current_step === 4) {
        navigate('/outcome');
        return;
      }

      // Load completed tasks for current step
      const currentStepProgress = progressRes.data.progress.find(
        p => p.step_number === progressRes.data.current_step
      );
      if (currentStepProgress) {
        setCompletedTasks(new Set(currentStepProgress.tasks_completed));
      }
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.clear();
        // Show user-friendly message before redirecting
        toast.info('Your session has expired. Please log in again to continue.', {
          duration: 4000,
        });
        setTimeout(() => navigate('/login'), 1500);
        return;
      }
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to save PB client record ID to backend
  const savePbClientRecordId = async (clientRecordId) => {
    try {
      const token = localStorage.getItem('access_token');
      if (token && clientRecordId) {
        await axios.post(
          `${API}/user/save-pb-client`,
          { client_record_id: clientRecordId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('PB client record ID saved to database');
      }
    } catch (error) {
      console.error('Failed to save PB client record ID:', error);
      // Non-blocking - localStorage still has the value
    }
  };

  const handleTaskComplete = async (taskId) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/user/complete-task`,
        { task_id: taskId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCompletedTasks(prev => new Set([...prev, taskId]));
      toast.success('Task completed!');
    } catch (error) {
      toast.error('Failed to complete task');
    }
  };

  const handleAdvanceStep = async (skipValidation = false) => {
    const currentStep = progressData.current_step;
    
    // Show confirmation modal for Step 2
    if (currentStep === 2) {
      setShowStep2Confirmation(true);
      trackModalOpened('step2_confirmation');
      return;
    }

    // Log task completion status (for analytics) but don't block progression
    const requiredTasks = STEP_DATA[currentStep].tasks;
    const allTasksCompleted = requiredTasks.every(task => completedTasks.has(task));
    if (!allTasksCompleted) {
      console.log(`Step ${currentStep}: Not all tasks completed`, { 
        required: requiredTasks, 
        completed: Array.from(completedTasks) 
      });
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${API}/user/advance-step`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Track step completion
      trackStepCompleted(currentStep, STEP_DATA[currentStep].title);

      // If completing step 3, redirect to outcome page
      if (currentStep === 3) {
        toast.success('Congratulations! Program complete!');
        setTimeout(() => navigate('/outcome'), 1500);
        return;
      }

      toast.success('Advanced to next step!');
      setCompletedTasks(new Set());
      await fetchData();
    } catch (error) {
      toast.error('Failed to advance step');
    }
  };

  const confirmStep2Complete = async () => {
    setShowStep2Confirmation(false);
    trackModalClosed('step2_confirmation');
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/user/advance-step`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Track step 2 completion
      trackStepCompleted(2, STEP_DATA[2].title);
      
      toast.success('Advanced to next step!');
      setCompletedTasks(new Set());
      await fetchData();
    } catch (error) {
      toast.error('Failed to advance step');
    }
  };

  const handleStep2InstructionsUnderstood = () => {
    localStorage.setItem('step2_instructions_seen', 'true');
    setShowStep2Instructions(false);
    trackModalClosed('step2_instructions');
  };

  const handleStep1Complete = () => {
    setShowStep1Confirmation(true);
    trackModalOpened('step1_confirmation');
  };

  const confirmStep1Complete = async () => {
    setShowStep1Confirmation(false);
    try {
      const token = localStorage.getItem('access_token');
      
      // Mark task as complete
      await axios.post(
        `${API}/user/complete-task`,
        { task_id: 'book_consultation' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Advance to next step
      await axios.post(
        `${API}/user/advance-step`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Step 1 completed! Moving to Step 2...');
      setCompletedTasks(new Set());
      await fetchData();
    } catch (error) {
      toast.error('Failed to complete step');
    }
  };

  const handleGoBack = async () => {
    if (progressData.current_step <= 1) return;
    
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/user/go-back-step`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Returned to previous step');
      await fetchData();
    } catch (error) {
      toast.error('Failed to go back');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F3F2' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const currentStep = progressData.current_step;
  const stepInfo = STEP_DATA[currentStep];

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-grid-pattern" style={{ background: '#F4F3F2' }}>
      {/* Header */}
      <div className="glass-dark border-b border-gray-200/80 w-full" data-testid="steps-header">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center relative">
            {/* Logo - Left Side */}
            <div className="flex items-center gap-2 sm:gap-3">
              <img 
                src="https://portal-drshumard.b-cdn.net/logo.png" 
                alt="Logo" 
                className="h-6 w-auto sm:h-7 md:h-8 object-contain flex-shrink-0"
              />
            </div>
            
            {/* Step Progress Indicators - Centered - Desktop Only */}
            <div className="hidden lg:flex absolute left-1/2 transform -translate-x-1/2 items-center gap-2">
              {[1, 2, 3].map((step, idx) => (
                <React.Fragment key={step}>
                  <div className="flex items-center gap-2" data-testid={`step-indicator-${step}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      step < currentStep
                        ? 'bg-green-500 border-green-600'
                        : step === currentStep
                        ? 'bg-teal-600 border-teal-700'
                        : 'bg-gray-200 border-gray-300'
                    }`}>
                      {step < currentStep ? (
                        <CheckCircle2 className="text-white" size={16} />
                      ) : step === currentStep ? (
                        <Circle className="text-white fill-white" size={16} />
                      ) : (
                        <Lock className="text-gray-500" size={14} />
                      )}
                    </div>
                    <span className={`text-sm font-medium ${
                      step <= currentStep ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      Step {step}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div className={`h-0.5 w-12 ${
                      step < currentStep ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Buttons - Right Side */}
            <div className="flex items-center gap-3 sm:gap-3">
              {/* Home Button - Icon only on mobile */}
              <Button 
                variant="outline" 
                onClick={() => {
                  trackButtonClicked('home', 'steps_page');
                  navigate('/');
                }} 
                className="flex items-center gap-2 p-3 sm:px-4 sm:py-2" 
                data-testid="home-button"
                title="Home"
              >
                <Home size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">Home</span>
              </Button>
              {/* Logout Button - Icon only on mobile with red background */}
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowLogoutConfirm(true);
                  trackModalOpened('logout_confirmation');
                }} 
                className="flex items-center gap-2 p-3 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700 text-white" 
                data-testid="logout-button"
                title="Logout"
              >
                <LogOut size={20} className="flex-shrink-0" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps - Mobile Only */}
      <div className="lg:hidden glass-dark border-b border-gray-200 w-full overflow-hidden" data-testid="progress-steps">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-2 overflow-x-hidden">
          <div className="flex items-center justify-center gap-3">
            {[1, 2, 3].map((step, idx) => (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center" data-testid={`step-indicator-${step}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                    step < currentStep
                      ? 'bg-green-500 border-green-600'
                      : step === currentStep
                      ? 'bg-teal-600 border-teal-700'
                      : 'bg-gray-200 border-gray-300'
                  } relative`}>
                    {step < currentStep ? (
                      <CheckCircle2 className="text-white" size={12} />
                    ) : step === currentStep ? (
                      <Circle className="text-white fill-white" size={12} />
                    ) : (
                      <Lock className="text-gray-500" size={10} />
                    )}
                  </div>
                  <span className={`mt-0.5 text-[10px] font-medium ${
                    step <= currentStep ? 'text-gray-800' : 'text-gray-500'
                  }`}>
                    Step {step}
                  </span>
                </div>
                {idx < 2 && (
                  <div className={`h-0.5 ${
                    step < currentStep ? 'bg-green-500' : 'bg-gray-300'
                  }`} style={{ width: '40px' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Step Title Banner */}
      <div className="glass-dark border-b border-gray-200 w-full overflow-hidden flex-shrink-0">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-1">
          <div className="flex items-center justify-center gap-4">
            {/* Back Button - Only show for Step 3 (not Step 2 to avoid confusion with form navigation) */}
            {currentStep > 2 && (
              <button
                onClick={() => {
                  trackButtonClicked('back_to_previous_step', 'steps_page');
                  handleGoBack();
                }}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
            <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold bg-gradient-to-r from-teal-500 to-cyan-600 bg-clip-text text-transparent px-2 text-center flex-1">
              {currentStep === 1 && "Welcome to Dr. Jason Shumard's Digital Office!"}
              {currentStep === 2 && "Step 2: Complete Your Health Blueprint"}
              {currentStep === 3 && "Step 3: Final Preparations - You Are Ready!"}
            </h2>
            {/* Spacer to balance the back button */}
            {currentStep > 2 && <div className="w-14"></div>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden" data-main-content>
      {currentStep === 2 ? (
        /* Step 2: Custom Intake Form */
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 h-full overflow-y-auto">
          {/* Step 2 Layout - Video & Instructions top row, Form full width below */}
          <div className="flex flex-col gap-4 lg:gap-6 w-full">
            {/* Mobile-only Welcome Card for Step 2 */}
            <div className="lg:hidden">
              <Card className="glass-dark border-0 shadow-xl" data-testid="mobile-welcome-card">
                <CardContent className="p-4">
                  <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Complete Your Health Profile
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      Please fill your intake form now to give our team information to help you.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Persistent Action Steps Card with Navigation */}
            <div className="sticky top-0 z-10 mb-2">
              <div className="bg-gradient-to-r from-teal-50 via-cyan-50 to-teal-50 border border-teal-200 rounded-xl px-4 sm:px-6 py-3 shadow-sm">
                {/* Action Steps Row */}
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  {/* Previous Button */}
                  <button
                    onClick={() => intakeFormRef.current?.goToPreviousPart()}
                    disabled={intakeFormState.currentPart === 1}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      intakeFormState.currentPart === 1
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-white/50 border border-gray-300 bg-white shadow-sm'
                    }`}
                  >
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  {/* Steps */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2">
                    <span className={`flex items-center gap-2 text-sm ${intakeFormState.currentPart === 1 ? '' : 'opacity-50'}`}>
                      <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shadow-sm ${
                        intakeFormState.currentPart > 1 
                          ? 'bg-green-500 text-white' 
                          : intakeFormState.currentPart === 1 
                          ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {intakeFormState.currentPart > 1 ? <CheckCircle2 size={14} /> : '1'}
                      </span>
                      <span className={`font-medium ${intakeFormState.currentPart === 1 ? 'text-gray-800' : 'text-gray-500'}`}>Fill in your details</span>
                    </span>
                    <span className="hidden sm:block text-teal-300">→</span>
                    <span className={`flex items-center gap-2 text-sm ${intakeFormState.currentPart === 2 ? '' : 'opacity-50'}`}>
                      <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shadow-sm ${
                        intakeFormState.currentPart > 2 
                          ? 'bg-green-500 text-white' 
                          : intakeFormState.currentPart === 2 
                          ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {intakeFormState.currentPart > 2 ? <CheckCircle2 size={14} /> : '2'}
                      </span>
                      <span className={`font-medium ${intakeFormState.currentPart === 2 ? 'text-gray-800' : 'text-gray-500'}`}>Sign HIPAA Notice</span>
                    </span>
                    <span className="hidden sm:block text-teal-300">→</span>
                    <span className={`flex items-center gap-2 text-sm ${intakeFormState.currentPart === 3 ? '' : 'opacity-50'}`}>
                      <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shadow-sm ${
                        intakeFormState.currentPart === 3 
                          ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      }`}>3</span>
                      <span className={`font-medium ${intakeFormState.currentPart === 3 ? 'text-gray-800' : 'text-gray-500'}`}>Sign Telehealth Consent</span>
                    </span>
                  </div>

                  {/* Next/Submit Button */}
                  {intakeFormState.currentPart < 3 ? (
                    <button
                      onClick={() => intakeFormRef.current?.goToNextPart()}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-white/50 border border-gray-300 bg-white shadow-sm transition-all"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => intakeFormRef.current?.handleSubmit()}
                      disabled={intakeFormState.isSubmitting}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50"
                    >
                      {intakeFormState.isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">Submit</span>
                          <CheckCircle size={16} />
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Last Saved Status - Centered below */}
                <div className="flex justify-center mt-2 text-xs text-gray-500">
                  {intakeFormState.isSaving ? (
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>
                  ) : intakeFormState.lastSaved ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Last saved: {intakeFormState.lastSaved.toLocaleTimeString()}</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Form Section - No container, direct form */}
            <div data-testid="form-section">
                {/* Custom Intake Form */}
                <IntakeForm 
                  ref={intakeFormRef}
                  userData={userData}
                  onStateChange={setIntakeFormState}
                  onComplete={async () => {
                    trackButtonClicked('intake_form_submitted', 'steps_page');
                    trackStepCompleted(2, STEP_DATA[2].title);
                    
                    // Advance to next step
                    try {
                      const token = localStorage.getItem('access_token');
                      await axios.post(
                        `${API}/user/advance-step`,
                        {},
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      
                      // Send webhook for Step 2 completion
                      const userEmail = getUserEmail();
                      if (userEmail) {
                        sendStepCompletionWebhook(userEmail, 2);
                      } else {
                        console.warn('No user email found for Step 2 webhook');
                      }
                      
                      toast.success('Form submitted! Moving to Step 3...');
                      setCompletedTasks(new Set());
                      await fetchData();
                    } catch (error) {
                      toast.error('Failed to advance to next step');
                    }
                  }}
                />
            </div>
            
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2 sm:p-3 lg:p-4">
        {currentStep === 1 ? (
          /* Step 1: Action Steps on Left, Booking Calendar on Right */
          <div className="w-full max-w-7xl h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 h-full w-full overflow-hidden rounded-xl shadow-2xl">
            {/* Left Column: Action Steps - White background */}
            <div className="relative p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col overflow-hidden rounded-l-xl bg-white">
              
              {/* Title at top */}
              <div className="mb-6">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 md:mb-4 text-gray-800 text-center">Action Steps</h3>
                <p className="text-base md:text-lg text-gray-600 text-center">Complete these steps to begin your journey</p>
              </div>
              
              {/* Steps in middle */}
              <div className="flex-1 flex flex-col justify-center">
                <div className="space-y-4 md:space-y-5">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg md:text-xl font-bold shadow-sm border border-gray-200" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)', color: '#4b5563' }}>1</div>
                    <div>
                      <p className="font-semibold text-base md:text-lg text-gray-800">Book Your Session</p>
                      <p className="text-gray-600 text-sm md:text-base">Select the best date and time on the calendar</p>
                    </div>
                  </div>
                  
                  {/* Step 2 */}
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg md:text-xl font-bold shadow-sm border border-gray-200" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)', color: '#4b5563' }}>2</div>
                    <div>
                      <p className="font-semibold text-base md:text-lg text-gray-800">Confirm Priority</p>
                      <p className="text-gray-600 text-sm md:text-base">Write the date in your calendar as top priority</p>
                    </div>
                  </div>
                  
                  {/* Step 3 */}
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg md:text-xl font-bold shadow-sm border border-gray-200" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)', color: '#4b5563' }}>3</div>
                    <div>
                      <p className="font-semibold text-base md:text-lg text-gray-800">Prepare for Your Call</p>
                      <p className="text-gray-600 text-sm md:text-base">Be ready to discuss your health goals</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bottom text */}
              <div className="mt-6">
                <div className="py-3 px-4 rounded-lg text-center border border-gray-200" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)' }}>
                  <p className="text-sm md:text-base text-gray-600 font-medium">Please complete your booking in the next 20 minutes</p>
                </div>
              </div>
            </div>

            {/* Right Column: Booking Calendar */}
            <div className="h-full overflow-y-auto rounded-r-xl" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)' }} data-testid="booking-card">
                  <OnboardingBooking 
                    clientInfo={{
                      firstName: userData?.first_name || '',
                      lastName: userData?.last_name || '',
                      email: userData?.email || '',
                      phone: userData?.phone || '',
                    }}
                    onBookingComplete={async (bookingResult) => {
                      console.log('Booking completed via custom widget:', bookingResult);
                      
                      // Store the Practice Better client record ID for Step 3 activation
                      if (bookingResult?.client_record_id) {
                        setPbClientRecordId(bookingResult.client_record_id);
                        localStorage.setItem('pb_client_record_id', bookingResult.client_record_id);
                      }
                      
                      // Just refresh data and show success - the advance-step was already called
                      // by the OnboardingBooking component's internal flow
                      setShowBookingSuccess(false);
                      setBookingProcessing(false);
                      await fetchData();
                      toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
                    }}
                    onBookingSuccess={async (bookingResult) => {
                      // This is called immediately when booking succeeds (before redirect)
                      // Note: The OnboardingBooking component shows its own SuccessState screen
                      // so we do NOT show the legacy showBookingSuccess modal here
                      console.log('Booking success - advancing to Step 2:', bookingResult);
                      
                      // Store the Practice Better client record ID in both localStorage AND backend
                      if (bookingResult?.client_record_id) {
                        setPbClientRecordId(bookingResult.client_record_id);
                        localStorage.setItem('pb_client_record_id', bookingResult.client_record_id);
                        // Save to backend for persistence across devices/sessions
                        savePbClientRecordId(bookingResult.client_record_id);
                      }
                      
                      setBookingProcessing(true);
                      // Removed: setShowBookingSuccess(true) - the OnboardingBooking component 
                      // handles success UI with its own SuccessState and auto-redirect countdown
                      
                      // Note: Backend now auto-advances user to Step 2 during booking
                      // We only need to mark the task complete here (backend handles step advancement)
                      try {
                        const token = localStorage.getItem('access_token');
                        if (token) {
                          await axios.post(
                            `${API}/user/complete-task`,
                            { task_id: 'book_consultation' },
                            { headers: { Authorization: `Bearer ${token}` } }
                          );
                          // Removed: advance-step call - backend now handles this atomically during booking
                          // This prevents double-advancement (Step 1 → 2 → 3)
                        }
                      } catch (error) {
                        console.error('Error completing task:', error);
                      }
                    }}
                  />
                    
                    {/* ROACH CHECKPOINT: Old PracticeBetterEmbed preserved for rollback if needed
                    <PracticeBetterEmbed 
                      type="booking"
                      minHeight={750}
                      onLoad={() => console.log('Booking calendar loaded successfully')}
                      onError={() => console.log('Booking calendar failed to load')}
                      onBookingComplete={async () => {
                        // Safari fallback: Practice Better couldn't redirect, handle it here
                        console.log('Booking completion detected via postMessage (Safari fallback)');
                        if (!bookingProcessing) {
                          setBookingProcessing(true);
                          setShowBookingSuccess(true);
                          
                          // Advance user to Step 2
                          try {
                            const token = localStorage.getItem('access_token');
                            if (token) {
                              await axios.post(
                                `${API}/user/complete-task`,
                                { task_id: 'book_consultation' },
                                { headers: { Authorization: `Bearer ${token}` } }
                              );
                              await axios.post(
                                `${API}/user/advance-step`,
                                {},
                                { headers: { Authorization: `Bearer ${token}` } }
                              );
                            }
                          } catch (error) {
                            console.error('Error advancing step:', error);
                          }
                          
                          setTimeout(async () => {
                            setShowBookingSuccess(false);
                            setBookingProcessing(false);
                            await fetchData();
                            toast.success('Welcome to Step 2!', { id: 'step2-welcome' });
                          }, 3000);
                        }
                      }}
                    />
                    */}
            </div>
          </div>
          </div>
        ) : (
          /* Step 3: Video + Action Card Layout */
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 sm:mb-6 w-full lg:items-stretch">
            {/* Video Section - maintains 16:9 aspect ratio */}
            <div className="aspect-video">
              <Card className="glass-dark border-0 shadow-xl overflow-hidden h-full" data-testid="video-section">
                <div className="relative w-full h-full">
                  <iframe
                    src={`https://iframe.mediadelivery.net/embed/538298/${STEP_DATA[3].videoId}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`}
                    loading="eager"
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 0 }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen="true"
                    data-testid="video-player"
                  />
                </div>
              </Card>
            </div>

            {/* Action Card for Step 3 - matches video height on desktop, expands on mobile */}
            <div className="lg:aspect-video">
              <Card className="glass-dark border-0 shadow-xl h-full" data-testid="action-card">
                <CardContent className="p-4 lg:p-6 h-full flex items-center justify-center">
                  {/* Action Steps - Centered overlay that fills container */}
                  <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 lg:p-6 w-full h-full flex flex-col justify-center">
                    <h4 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Action Steps
                    </h4>

                    <div className="space-y-4 flex-1">
                      {/* Action Step 1 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          1
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Confirm Your Calendar:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Pull up your email, find the official confirmation invite, and add the session details to your 
                            personal calendar. Highlight this date as your absolute top priority.
                          </p>
                        </div>
                      </div>

                      {/* Action Step 2 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          2
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Bring Your Support Team:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Reversing complex health concerns is a decision best made together. Forward the invite to your 
                            spouse or other trusted decision-maker and confirm they will be joining you on the call.
                          </p>
                        </div>
                      </div>

                      {/* Action Step 3 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          3
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Activate Your Portal:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Check your email for an invitation from Practice Better and click &quot;Activate My Account&quot; to 
                            set up your secure patient portal.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Onboarding Complete - Activation Card */}
          <Card className="glass-dark border-0 shadow-xl overflow-hidden mb-6" data-testid="onboarding-complete-card">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">
                  Your Onboarding is Complete!
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Click below to activate your Practice Better Health Portal and access your personalized care dashboard.
                </p>
                
                <Button
                  onClick={async () => {
                    trackButtonClicked('activate_practice_better_portal', 'steps_page');
                    
                    // Mark as complete
                    try {
                      const token = localStorage.getItem('access_token');
                      if (token) {
                        await axios.post(
                          `${API}/user/complete-task`,
                          { task_id: 'activate_portal' },
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                        await axios.post(
                          `${API}/user/advance-step`,
                          {},
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                      }
                    } catch (error) {
                      console.error('Error marking complete:', error);
                    }
                    
                    // Get the client record ID and build activation URL
                    const clientRecordId = pbClientRecordId || localStorage.getItem('pb_client_record_id');
                    const portalBaseUrl = 'https://drshumard.practicebetter.io';
                    
                    if (clientRecordId) {
                      // Calculate activation ID: RecordID + 4 (in hex)
                      // Convert hex to BigInt, add 4, convert back to hex
                      const calculateActivationId = (recordId) => {
                        try {
                          const bigInt = BigInt('0x' + recordId);
                          const activationBigInt = bigInt + BigInt(4);
                          return activationBigInt.toString(16).padStart(recordId.length, '0');
                        } catch {
                          // Fallback for browsers without BigInt support
                          return recordId;
                        }
                      };
                      const activationUrl = `${portalBaseUrl}/#/u/activate/${calculateActivationId(clientRecordId)}?portal_rid=${clientRecordId}`;
                      window.open(activationUrl, '_blank');
                    } else {
                      // Fallback to generic portal URL
                      window.open('https://drshumard.practicebetter.io', '_blank');
                    }
                    
                    // Refresh data to show completion state
                    await fetchData();
                  }}
                  className="w-full max-w-sm bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg text-lg"
                  data-testid="activate-portal-button"
                >
                  Activate Your Practice Better Portal
                </Button>
                
                <p className="text-gray-500 text-sm mt-4 italic">
                  Can&apos;t find the activation email? Check your spam folder.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
        )}
        </div>
      )}
      </div>

      {/* Booking Success Modal - Shows when booking is detected */}
      <AnimatePresence>
        {showBookingSuccess && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-md w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 sm:p-8 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
                      >
                        <CheckCircle className="w-10 h-10 text-white" />
                      </motion.div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                        Consultation Booked!
                      </h2>
                      <p className="text-white/90 text-sm sm:text-base">
                        Your appointment has been scheduled successfully
                      </p>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
                      <div className="flex items-center justify-center gap-2 text-gray-600 mb-4">
                        <Calendar className="w-5 h-5 text-teal-600" />
                        <span className="text-sm sm:text-base">Check your email for confirmation details</span>
                      </div>
                      
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="flex items-center justify-center gap-2 text-teal-600"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="w-5 h-5" />
                        </motion.div>
                        <span className="font-medium">Moving to Step 2...</span>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Manual Booking Confirmation Modal - Shows when localStorage unavailable */}
      <AnimatePresence>
        {showBookingManualConfirm && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-md w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-6 sm:p-8 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
                      >
                        <Calendar className="w-10 h-10 text-white" />
                      </motion.div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                        Booking Detected
                      </h2>
                      <p className="text-white/90 text-sm sm:text-base">
                        It looks like you just booked a consultation
                      </p>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
                      <p className="text-gray-600 mb-6 text-sm sm:text-base">
                        Please confirm your booking to continue to the next step.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          onClick={() => setShowBookingManualConfirm(false)}
                          variant="outline"
                          className="flex-1 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl"
                          disabled={manualConfirmLoading}
                        >
                          Not Yet
                        </Button>
                        <Button
                          onClick={handleManualBookingConfirm}
                          disabled={manualConfirmLoading}
                          className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold py-3 rounded-xl shadow-lg"
                        >
                          {manualConfirmLoading ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Confirming...
                            </span>
                          ) : (
                            "Yes, I Booked!"
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Step 1 Confirmation Modal */}
      <AnimatePresence>
        {showStep1Confirmation && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => {
                trackButtonClicked('dismiss_step1_confirmation', 'steps_page');
                setShowStep1Confirmation(false);
              }}
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-lg w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-4 sm:p-6 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
                      >
                        <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </motion.div>
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                        Confirm Booking
                      </h2>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6 md:p-8 bg-white">
                      <p className="text-base sm:text-lg text-gray-700 text-center mb-4 sm:mb-6 leading-relaxed">
                        Only confirm if you have <strong>booked your call</strong> and <strong>added this to your calendar</strong>
                      </p>

                      {/* Buttons */}
                      <div className="flex flex-col gap-2 sm:gap-3">
                        <Button
                          onClick={() => {
                            trackButtonClicked('confirm_booking_step1', 'steps_page');
                            confirmStep1Complete();
                          }}
                          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 sm:py-4 rounded-xl shadow-lg text-sm sm:text-base"
                        >
                          ✓ Yes, I&apos;ve Booked My Call
                        </Button>
                        <Button
                          onClick={() => {
                            trackButtonClicked('cancel_step1_confirmation', 'steps_page');
                            setShowStep1Confirmation(false);
                          }}
                          variant="outline"
                          className="w-full border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 sm:py-4 rounded-xl text-sm sm:text-base"
                        >
                          ← Take Me Back
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Step 2 Confirmation Modal */}
      <AnimatePresence>
        {showStep2Confirmation && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => {
                trackButtonClicked('dismiss_step2_confirmation', 'steps_page');
                trackModalClosed('step2_confirmation');
                setShowStep2Confirmation(false);
              }}
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-lg w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-teal-500 to-cyan-600 p-4 sm:p-6 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
                      >
                        <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                      </motion.div>
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                        Double Check
                      </h2>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6 md:p-8 bg-white">
                      <p className="text-base sm:text-lg text-gray-700 text-center mb-4 sm:mb-6 leading-relaxed">
                        Did you fill out <strong>all 4 pages</strong> and <strong>sign the form</strong>?
                      </p>

                      {/* Buttons */}
                      <div className="flex flex-col gap-2 sm:gap-3">
                        <Button
                          onClick={() => {
                            trackButtonClicked('confirm_form_complete_step2', 'steps_page');
                            confirmStep2Complete();
                          }}
                          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-3 sm:py-4 rounded-xl shadow-lg text-sm sm:text-base"
                        >
                          ✓ YES! Move to Next Step
                        </Button>
                        <Button
                          onClick={() => {
                            trackButtonClicked('cancel_step2_confirmation', 'steps_page');
                            trackModalClosed('step2_confirmation');
                            setShowStep2Confirmation(false);
                          }}
                          variant="outline"
                          className="w-full border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 sm:py-4 rounded-xl text-sm sm:text-base"
                        >
                          ← Not Yet, Take Me Back
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => {
                setShowLogoutConfirm(false);
                trackModalClosed('logout_confirmation');
              }}
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-md w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
                      >
                        <LogOut className="w-8 h-8 text-white" />
                      </motion.div>
                      <h2 className="text-2xl font-bold text-white">
                        Confirm Logout
                      </h2>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
                      <p className="text-gray-600 mb-6 text-lg">
                        Are you sure you want to log out?
                      </p>
                      <p className="text-gray-500 text-sm mb-6">
                        Your progress is saved. You can log back in anytime to continue.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          onClick={() => {
                            setShowLogoutConfirm(false);
                            trackModalClosed('logout_confirmation');
                          }}
                          variant="outline"
                          className="flex-1 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            setShowLogoutConfirm(false);
                            performLogout();
                          }}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl"
                        >
                          Yes, Log Out
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Session Expiration Warning Modal */}
      <AnimatePresence>
        {showSessionWarning && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="max-w-md w-full"
              >
                <Card className="shadow-2xl border-0 overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-16 h-16 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center"
                      >
                        <Clock className="w-8 h-8 text-white" />
                      </motion.div>
                      <h2 className="text-2xl font-bold text-white">
                        Session Expiring Soon
                      </h2>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 text-center bg-gradient-to-b from-gray-50 to-white">
                      <div className="mb-4">
                        <div className="text-5xl font-bold text-amber-600 mb-2">
                          {sessionExpiryCountdown}
                        </div>
                        <p className="text-gray-500 text-sm">seconds remaining</p>
                      </div>
                      
                      <p className="text-gray-600 mb-6">
                        Your session will expire soon. Would you like to stay logged in?
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          onClick={() => {
                            setShowSessionWarning(false);
                            trackModalClosed('session_expiry_warning');
                            performLogout();
                          }}
                          variant="outline"
                          className="flex-1 border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl"
                        >
                          Log Out Now
                        </Button>
                        <Button
                          onClick={async () => {
                            const success = await refreshSession();
                            if (success) {
                              trackModalClosed('session_expiry_warning');
                            }
                          }}
                          className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Stay Logged In
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StepsPage;