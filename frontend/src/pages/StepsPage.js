import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CheckCircle2, Circle, Home, User as UserIcon, Phone, Calendar, LogOut } from 'lucide-react';
import ReactPlayer from 'react-player';
import { getErrorMessage } from '../utils/errorHandler';
import PracticeBetterEmbed from '../components/PracticeBetterEmbed';
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

const StepsPage = () => {
  const navigate = useNavigate();
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
  // SUNFLOWER: iframeHeight state removed - now handled by PracticeBetterEmbed component

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
        navigate('/login');
      }
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
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
    <div className="h-screen overflow-hidden flex flex-col" style={{ background: '#F4F3F2' }}>
      {/* Header */}
      <div className="glass-dark border-b border-gray-200 w-full" data-testid="steps-header">
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
                  trackButtonClicked('logout', 'steps_page');
                  trackLogout(userData?.id);
                  localStorage.removeItem('access_token');
                  localStorage.removeItem('refresh_token');
                  toast.success('Logged out successfully');
                  navigate('/login');
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
      <div className="glass-dark border-b border-gray-200 w-full overflow-hidden">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-4">
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden" data-main-content>
      {currentStep === 2 ? (
        /* Step 2: Custom Intake Form */
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          {/* Step 2 Layout - Video & Instructions top row, Form full width below */}
          <div className="flex flex-col gap-4 lg:gap-6 w-full">
            {/* Top Row: Video + Action Steps Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:items-stretch">
              {/* Video Section - maintains 16:9 aspect ratio */}
              <div className="aspect-video">
                <Card className="glass-dark border-0 shadow-xl overflow-hidden h-full" data-testid="video-section">
                  <div className="relative w-full h-full">
                    <iframe
                      src={`https://iframe.mediadelivery.net/embed/538298/${STEP_DATA[2].videoId}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`}
                      loading="eager"
                      className="absolute inset-0 w-full h-full"
                      style={{ border: 0 }}
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                      allowFullScreen="true"
                    />
                  </div>
                </Card>
              </div>

              {/* Action Steps Card - matches video height on desktop, expands on mobile */}
              <div className="lg:aspect-video">
                <Card className="glass-dark border-0 shadow-xl h-full" data-testid="instructions-card">
                  <CardContent className="p-4 lg:p-6 h-full flex items-center justify-center">
                    {/* Action Steps - Centered overlay that fills container */}
                    <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 lg:p-6 w-full h-full flex flex-col justify-center">
                      <h4 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Action Steps
                      </h4>
                      
                      <div className="space-y-4">
                        {/* Step 1 */}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                            1
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm mb-1">Complete Part 1:</p>
                            <p className="text-xs text-gray-700 leading-relaxed">
                              Fill out your personal and health information
                            </p>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                            2
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm mb-1">Sign HIPAA Notice:</p>
                            <p className="text-xs text-gray-700 leading-relaxed">
                              Read and sign the privacy notice in Part 2
                            </p>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                            3
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm mb-1">Sign Telehealth Consent:</p>
                            <p className="text-xs text-gray-700 leading-relaxed">
                              Complete Part 3 with your consent signature
                            </p>
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                            4
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800 text-sm mb-1">Auto-Save Enabled:</p>
                            <p className="text-xs text-gray-700 leading-relaxed">
                              Your progress is automatically saved as you go
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Form Section - No container, direct form */}
            <div data-testid="form-section">
                {/* Custom Intake Form */}
                <IntakeForm 
                  userData={userData}
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
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
        {currentStep === 1 ? (
          /* Step 1: Video + Action Steps on Left, Booking Calendar on Right */
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 pb-3 w-full" style={{ minHeight: '750px' }}>
            {/* Left Column: Video + Action Steps */}
            <div className="flex flex-col gap-6 h-full">
              {/* Video Section - Bunny.net Official Embed */}
              <Card className="glass-dark border-0 shadow-xl overflow-hidden flex-shrink-0" data-testid="video-section">
                <div style={{ position: 'relative', paddingTop: '56.25%', backgroundColor: '#000' }}>
                  <iframe
                    key={videoAutoplay ? 'autoplay' : 'manual'}
                    src={`https://iframe.mediadelivery.net/embed/538298/${STEP_DATA[1].videoId}?autoplay=${videoAutoplay}&loop=false&muted=false&preload=true&responsive=true`}
                    loading="eager"
                    style={{
                      border: 0,
                      position: 'absolute',
                      top: 0,
                      height: '100%',
                      width: '100%'
                    }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen="true"
                  />
                  
                  {/* Begin Your Journey Overlay */}
                  <AnimatePresence>
                    {showVideoOverlay && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 flex items-center justify-center z-10"
                        style={{ 
                          cursor: 'pointer',
                          background: 'rgba(0, 0, 0, 0.7)',
                          backdropFilter: 'blur(4px)'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowVideoOverlay(false);
                          setVideoAutoplay(true);
                        }}
                      >
                        <motion.div
                          initial={{ scale: 0.8, y: 20 }}
                          animate={{ scale: 1, y: 0 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 300 }}
                          style={{
                            background: 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)',
                            borderRadius: '1rem',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            border: '2px solid rgba(255, 255, 255, 0.2)'
                          }}
                          className="text-white font-bold cursor-pointer px-6 py-4 sm:px-8 sm:py-5 md:px-12 md:py-6 text-base sm:text-xl md:text-2xl"
                        >
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </motion.div>
                          <span className="whitespace-nowrap">Begin Your Journey</span>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>

              {/* Action Steps Card */}
              <Card className="glass-dark border-0 shadow-lg flex-1 overflow-auto" data-testid="action-steps-card">
                <CardContent className="p-6 h-full flex flex-col">
                  {/* Welcome Message */}
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-3">Welcome!</h3>
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      You've taken the critical first step toward reversing your diabetes concerns, but immediate action 
                      is essential to prevent delays. Your first task is to complete <strong>Step 1: Booking Your Initial Consult</strong>.
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      This 30-minute session is where we'll discuss your unique situation and create your mutual gameplan 
                      to reach your health goals.
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      <strong>Please complete the following steps in the next 20 minutes</strong> to give our team the 
                      information we need.
                    </p>
                  </div>

                  {/* Action Steps */}
                  <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4">
                    <h4 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Action Steps
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          1
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Book Your Session:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Take a moment right now to select the best date and time on the calendar available on this page.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          2
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Confirm Priority:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Write the date and time down in your personal calendar and highlight it as the top priority on 
                            your schedule. This call is the beginning of your path to wellness.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm">
                          3
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm mb-1">Move Forward:</p>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            Once your session is booked and confirmed, move forward immediately to Step 2.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right Column: Booking Calendar */}
            <div className="lg:h-full w-full">
              <Card className="glass-dark border-0 shadow-xl lg:h-full flex flex-col w-full" data-testid="booking-card">
                <CardContent className="p-3 sm:p-4 md:p-6 lg:flex-1 flex flex-col lg:overflow-hidden w-full">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3 sm:mb-4 text-center">STEP 1: BOOK YOUR ONE-ON-ONE CONSULT</h3>
                  
                  <div className="bg-white rounded-lg p-2 sm:p-3 md:p-4 border-2 border-teal-600 lg:flex-1 lg:overflow-visible w-full" data-testid="booking-calendar">
                    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <Calendar className="text-teal-600 flex-shrink-0" size={24} />
                      <p className="text-gray-700 font-medium text-sm sm:text-base md:text-lg">Select Your Appointment Time</p>
                    </div>

                    {/* SUNFLOWER CHECKPOINT: SDK booking widget commented out - using direct iframe
                    <style dangerouslySetInnerHTML={{__html: `
                      @media (min-width: 1024px) {
                        .better-inline-booking-widget {
                          position: relative;
                          width: 100% !important;
                          max-width: 100% !important;
                          height: calc(100% - 50px);
                          overflow-x: hidden !important;
                          overflow-y: auto;
                        }
                        .better-inline-booking-widget iframe {
                          width: 100% !important;
                          max-width: 100% !important;
                          height: 100%;
                        }
                      }
                      
                      @media (max-width: 1023px) {
                        .better-inline-booking-widget {
                          width: 100% !important;
                          max-width: 100% !important;
                          height: 800px;
                          overflow: visible !important;
                        }
                        .better-inline-booking-widget iframe {
                          width: 100% !important;
                          max-width: 100% !important;
                          height: 800px;
                          border: none !important;
                          overflow: hidden !important;
                          display: block;
                        }
                      }
                      
                      @media (max-width: 640px) {
                        .better-inline-booking-widget {
                          font-size: 14px;
                        }
                      }
                    `}} />
                    <div 
                      className="better-inline-booking-widget" 
                      data-url="https://drshumard.practicebetter.io" 
                      data-booking-page="6931baa6ac26faba7eb5602b" 
                      data-hash="601a127b2a9c2406dcc94437" 
                      data-theme="14b8a6" 
                      data-theme-accent="06b6d4" 
                      style={{ width: '100%', maxWidth: '550px', height: '800px' }} 
                      data-scrollbar-visible="false"
                    />
                    */}
                    
                    {/* Direct iframe implementation - Increased height to avoid scroll */}
                    <PracticeBetterEmbed 
                      type="booking"
                      minHeight={750}
                      onLoad={() => console.log('Booking calendar loaded successfully')}
                      onError={() => console.log('Booking calendar failed to load')}
                    />
                  </div>
                  
                  {/* Buttons inside booking card */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-600 mb-3 italic text-center">
                      ⚠️ Only click Mark as Complete once you have booked your consultation
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => {
                          trackButtonClicked('go_to_dashboard_step1', 'steps_page');
                          navigate('/dashboard');
                        }}
                        variant="outline"
                        className="flex-1 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl"
                      >
                        Go to Dashboard
                      </Button>
                      <Button
                        onClick={() => {
                          trackButtonClicked('mark_as_complete_step1', 'steps_page');
                          handleStep1Complete();
                        }}
                        className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold py-3 rounded-xl shadow-lg"
                        data-testid="submit-button"
                      >
                        Mark as Complete →
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </>
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

          {/* Practice Better Activation Card - Step 3 Only */}
          <Card className="glass-dark border-0 shadow-xl overflow-hidden mb-6" data-testid="practice-better-activation-card">
            <CardContent className="p-4 sm:p-6">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
                  Activate Your Practice Better Portal
                </h3>
                <p className="text-gray-600">
                  Check your email inbox for an invitation from Practice Better that looks like this:
                </p>
              </div>
              
              {/* Image from CDN */}
              <div className="flex justify-center mb-6">
                <img 
                  src="https://portal-drshumard.b-cdn.net/Screenshot%202025-12-30%20at%2022.03.52.png"
                  alt="Practice Better invitation email example"
                  className="max-w-full h-auto rounded-lg shadow-lg border border-gray-200"
                  style={{ maxHeight: '400px' }}
                />
              </div>
              
              <p className="text-center text-gray-700 mb-6">
                Click the <strong>&quot;Activate My Account&quot;</strong> button in that email to set up your portal.
              </p>
              
              {/* Email Provider Buttons */}
              <div className="space-y-3">
                <p className="text-center text-sm text-gray-600 font-medium">Open your email:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <a
                    href="https://mail.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackButtonClicked('open_gmail', 'steps_page')}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
                    </svg>
                    <span className="font-medium text-gray-700">Gmail</span>
                  </a>
                  <a
                    href="https://outlook.live.com/mail"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackButtonClicked('open_outlook', 'steps_page')}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#0078D4"/>
                    </svg>
                    <span className="font-medium text-gray-700">Outlook</span>
                  </a>
                  <a
                    href="https://mail.yahoo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackButtonClicked('open_yahoo', 'steps_page')}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#6001D2"/>
                    </svg>
                    <span className="font-medium text-gray-700">Yahoo</span>
                  </a>
                </div>
              </div>
              
              <p className="text-center text-gray-500 text-sm mt-4 italic">
                Can&apos;t find it? Check your spam or junk folder.
              </p>
            </CardContent>
          </Card>

          {/* Complete Onboarding Button */}
          <div className="flex justify-center mt-6">
            <Button
              onClick={() => {
                trackButtonClicked('complete_onboarding_step3', 'steps_page');
                handleAdvanceStep();
              }}
              className="w-full max-w-md bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg text-lg"
              data-testid="submit-button"
            >
              Complete Onboarding
            </Button>
          </div>
          </>
        )}
        </div>
      )}
      </div>

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
                          ✓ Yes, I've Booked My Call
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
    </div>
  );
};

export default StepsPage;