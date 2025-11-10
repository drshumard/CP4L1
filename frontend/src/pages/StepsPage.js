import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, CheckCircle2, Circle, Home, User as UserIcon, Phone, Calendar } from 'lucide-react';
import ReactPlayer from 'react-player';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STEP_DATA = {
  1: {
    title: 'Welcome & Consultation Booking',
    action: 'BOOK YOUR ONE-ON-ONE CONSULT',
    videoUrl: 'https://vz-7b452698-0b8.b-cdn.net/64de0dc1-8d23-41dc-ad7d-8dfc5d463c64/playlist.m3u8',
    description: 'Watch the welcome video and book your personal consultation with our health advocate.',
    tasks: ['watch_video', 'book_consultation']
  },
  2: {
    title: 'Understanding Diabetes',
    action: 'COMPLETE THE DIABETES BASICS MODULE',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Learn the fundamentals of diabetes management and how your body processes glucose.',
    tasks: ['watch_education_video', 'complete_quiz']
  },
  3: {
    title: 'Nutrition & Meal Planning',
    action: 'DOWNLOAD YOUR MEAL PLAN',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Discover healthy eating strategies tailored for diabetes management.',
    tasks: ['watch_nutrition_video', 'download_meal_plan']
  },
  4: {
    title: 'Physical Activity Guide',
    action: 'SET YOUR EXERCISE GOALS',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Learn safe and effective exercise routines to improve your health.',
    tasks: ['watch_exercise_video', 'set_goals']
  },
  5: {
    title: 'Blood Sugar Monitoring',
    action: 'LOG YOUR FIRST READING',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Master the art of monitoring and tracking your blood glucose levels.',
    tasks: ['watch_monitoring_video', 'log_reading']
  },
  6: {
    title: 'Medication Management',
    action: 'REVIEW YOUR MEDICATION SCHEDULE',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Understand your medications and create a consistent routine.',
    tasks: ['watch_medication_video', 'set_reminders']
  },
  7: {
    title: 'Ongoing Support & Success',
    action: 'SCHEDULE YOUR FOLLOW-UP',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: 'Celebrate your progress and plan for continued success.',
    tasks: ['watch_success_video', 'schedule_followup']
  }
};

const StepsPage = () => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completedTasks, setCompletedTasks] = useState(new Set());
  const [showStep2Instructions, setShowStep2Instructions] = useState(false);

  useEffect(() => {
    fetchData();
    
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
  }, []);

  // Check if user has seen Step 2 instructions
  useEffect(() => {
    if (userData?.current_step === 2 && userData) {
      const hasSeenInstructions = localStorage.getItem('step2_instructions_seen');
      if (!hasSeenInstructions) {
        setShowStep2Instructions(true);
      }
    }
  }, [userData]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const [userRes, progressRes] = await Promise.all([
        axios.get(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/user/progress`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setUserData(userRes.data);
      setProgressData(progressRes.data);

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
    const requiredTasks = STEP_DATA[currentStep].tasks;
    const allTasksCompleted = requiredTasks.every(task => completedTasks.has(task));

    if (!skipValidation && !allTasksCompleted) {
      toast.error('Please complete all tasks before advancing');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${API}/user/advance-step`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // If completing step 7, redirect to outcome page
      if (currentStep === 7) {
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

  const handleStep2InstructionsUnderstood = () => {
    localStorage.setItem('step2_instructions_seen', 'true');
    setShowStep2Instructions(false);
  };

  const handleStep1Complete = async () => {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #BFDBFE 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const currentStep = progressData.current_step;
  const stepInfo = STEP_DATA[currentStep];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #BFDBFE 100%)' }}>
      {/* Header */}
      <div className="glass-dark border-b border-gray-200" data-testid="steps-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-lg font-bold text-white">DS</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">DrShumard Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" data-testid="home-button">
                <Home size={16} />
                Home
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="glass-dark border-b border-gray-200 overflow-x-auto" data-testid="progress-steps">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between min-w-max">
            {[1, 2, 3, 4, 5, 6, 7].map((step, idx) => (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center" data-testid={`step-indicator-${step}`}>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
                    step < currentStep
                      ? 'bg-green-500 border-green-600'
                      : step === currentStep
                      ? 'bg-blue-600 border-blue-700'
                      : 'bg-gray-200 border-gray-300'
                  } relative`}>
                    {step < currentStep ? (
                      <CheckCircle2 className="text-white" size={24} />
                    ) : step === currentStep ? (
                      <Circle className="text-white fill-white" size={24} />
                    ) : (
                      <Lock className="text-gray-500" size={20} />
                    )}
                  </div>
                  <span className={`mt-2 text-sm font-medium ${
                    step <= currentStep ? 'text-gray-800' : 'text-gray-500'
                  }`}>
                    {step === 7 ? 'Outcome' : `Step ${step}`}
                  </span>
                </div>
                {idx < 6 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    step < currentStep ? 'bg-green-500' : 'bg-gray-300'
                  }`} style={{ minWidth: '40px' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {currentStep === 2 ? (
        /* Step 2: Full-width form - let it expand naturally */
        <div className="py-4">
          {/* Step 2 Instructions Modal */}
          <AnimatePresence>
            {showStep2Instructions && (
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                  onClick={handleStep2InstructionsUnderstood}
                />
                
                {/* Modal */}
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="max-w-2xl w-full"
                  >
                    <Card className="shadow-2xl border-0 overflow-hidden">
                      <CardContent className="p-0">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-center">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center"
                          >
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </motion.div>
                          <h2 className="text-2xl md:text-3xl font-bold text-white">
                            📋 Important: How to Complete This Form
                          </h2>
                        </div>

                        {/* Content */}
                        <div className="p-8 bg-white">
                          <ol className="space-y-4 text-gray-700">
                            <motion.li
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 }}
                              className="flex items-start gap-3"
                            >
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">
                                1
                              </span>
                              <p className="pt-1 leading-relaxed">
                                <strong className="text-gray-900">This form has 4 pages</strong> - Fill out all fields on each page
                              </p>
                            </motion.li>

                            <motion.li
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.4 }}
                              className="flex items-start gap-3"
                            >
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">
                                2
                              </span>
                              <p className="pt-1 leading-relaxed">
                                Click the <strong className="text-gray-900">"Next Page"</strong> button in the <strong className="text-gray-900">bottom-right corner</strong> of the form to advance through all pages
                              </p>
                            </motion.li>

                            <motion.li
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.5 }}
                              className="flex items-start gap-3"
                            >
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">
                                3
                              </span>
                              <p className="pt-1 leading-relaxed">
                                On the <strong className="text-gray-900">final page (page 4)</strong>, you'll need to <strong className="text-gray-900">provide your signature</strong>
                              </p>
                            </motion.li>

                            <motion.li
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.6 }}
                              className="flex items-start gap-3"
                            >
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">
                                4
                              </span>
                              <p className="pt-1 leading-relaxed">
                                Click <strong className="text-gray-900">"Submit"</strong> to submit your completed form
                              </p>
                            </motion.li>

                            <motion.li
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.7 }}
                              className="flex items-start gap-3"
                            >
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-sm">
                                5
                              </span>
                              <p className="pt-1 leading-relaxed">
                                <strong className="text-gray-900">After submission</strong>, scroll down to find the <strong className="text-gray-900">"Continue to Next Step"</strong> button below the form
                              </p>
                            </motion.li>
                          </ol>

                          {/* Button */}
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                            className="mt-8"
                          >
                            <Button
                              onClick={handleStep2InstructionsUnderstood}
                              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-6 rounded-xl shadow-lg text-lg transition-all hover:scale-[1.02]"
                            >
                              I Understand ✓
                            </Button>
                          </motion.div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Header Section - With Clear Instructions */}
          <div className="text-center pb-4 px-4 max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
              Tell Us About Yourself
            </h2>
            <p className="text-gray-600 text-sm md:text-base mb-4">
              Complete this form to help us personalize your wellness journey
            </p>
            
            {/* Important Instructions Card */}
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 md:p-5 shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-blue-900 text-base md:text-lg mb-2">
                    📋 Important: How to Complete This Form
                  </h3>
                  <ol className="text-sm md:text-base text-blue-800 space-y-2 list-decimal list-inside">
                    <li className="leading-relaxed">
                      <strong>This form has 4 pages</strong> - Fill out all fields on each page
                    </li>
                    <li className="leading-relaxed">
                      Click the <strong>"Next Page"</strong> button in the <strong>bottom-right corner</strong> of the form to advance through all pages
                    </li>
                    <li className="leading-relaxed">
                      On the <strong>final page (page 4)</strong>, you'll need to <strong>provide your signature</strong>
                    </li>
                    <li className="leading-relaxed">
                      Click <strong>"Submit"</strong> to submit your completed form
                    </li>
                    <li className="leading-relaxed">
                      <strong>After submission</strong>, scroll down to find the <strong>"Continue to Next Step"</strong> button below the form
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Form Container - Comfortable Width, Natural Height */}
          <div className="px-8 md:px-16 lg:px-24 pb-6 max-w-[1800px] mx-auto">
            <style dangerouslySetInnerHTML={{__html: `
              .better-inline-booking-widget {
                position: relative;
                background: white;
                border-radius: 0.5rem;
                overflow: hidden;
              }
              .better-inline-booking-widget iframe {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border: none;
                overflow-y: auto;
                overflow-x: hidden;
              }
              
              /* Gradient border wrapper */
              .form-wrapper-fullpage {
                background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                padding: 3px;
                border-radius: 0.5rem;
                box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
              }
              
              .form-inner-fullpage {
                background: white;
                border-radius: calc(0.5rem - 3px);
                overflow: hidden;
              }
              
              /* Hide scrollbar for the widget to avoid double scroll */
              .better-inline-booking-widget::-webkit-scrollbar {
                display: none;
              }
              .better-inline-booking-widget {
                -ms-overflow-style: none;
                scrollbar-width: none;
              }
            `}} />
            
            <div className="form-wrapper-fullpage">
              <div className="form-inner-fullpage">
                <div 
                  className="better-inline-booking-widget" 
                  data-url="https://drshumard.practicebetter.io/" 
                  data-form-request="6021e5d42a9c2406f45aa20f" 
                  data-hash="601a127b2a9c2406dcc94437" 
                  data-theme="246af4" 
                  data-theme-accent="f57f1b"
                  style={{ maxWidth: '100%', height: '2000px' }}
                />
              </div>
            </div>

            {/* Complete Button - At Bottom of Form */}
            <div className="mt-8">
              <Card className="glass-dark border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="text-center mb-4">
                    <p className="text-sm text-gray-600 mb-2">
                      ⚠️ Please ensure you have completed all form fields above before continuing
                    </p>
                  </div>
                  <Button
                    onClick={handleAdvanceStep}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-6 rounded-xl shadow-lg text-lg transition-all hover:scale-[1.02]"
                    data-testid="submit-button"
                  >
                    Continue to Next Step →
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentStep === 1 ? (
          /* Step 1: Video + Health Advocate on Left, Booking Calendar on Right */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ height: 'calc(100vh - 280px)', minHeight: '700px' }}>
            {/* Left: Video + Health Advocate Details + Button */}
            <div className="flex flex-col gap-6 h-full">
              {/* Video Section - Bunny.net Official Embed */}
              <Card className="glass-dark border-0 shadow-xl overflow-hidden flex-shrink-0" data-testid="video-section">
                <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                  <iframe
                    src="https://iframe.mediadelivery.net/embed/538298/64de0dc1-8d23-41dc-ad7d-8dfc5d463c64?autoplay=false&loop=false&muted=false&preload=true&responsive=true"
                    loading="lazy"
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
                </div>
              </Card>

              {/* Health Advocate Card */}
              <Card className="glass-dark border-0 shadow-lg flex-1 overflow-auto" data-testid="advocate-card">
                <CardContent className="p-6 h-full flex flex-col justify-center">
                  <div className="text-center mb-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 mx-auto mb-3 flex items-center justify-center">
                      <UserIcon className="text-blue-600" size={40} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">YOUR HEALTH ADVOCATE</h3>
                    <p className="text-base text-gray-800 font-semibold mb-1">Dr. Jason Shumard</p>
                    <p className="text-xs text-gray-600 mb-2">Certified Diabetes Educator</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
                      <Phone size={14} />
                      <span>Available for support</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-700 text-center leading-relaxed">
                    Dr. Shumard is here to guide you through every step of your journey. With years of experience 
                    in diabetes management, he'll provide personalized support and answer all your questions.
                  </p>
                </CardContent>
              </Card>

              {/* Complete Button */}
              <Card className="glass-dark border-0 shadow-lg flex-shrink-0">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-600 mb-2 italic text-center">
                    ⚠️ Only click this once you have booked your consultation
                  </p>
                  <Button
                    onClick={handleStep1Complete}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-5 rounded-xl shadow-lg"
                    data-testid="submit-button"
                  >
                    Mark as Complete & Continue
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right: Booking Calendar - Full Height */}
            <div className="h-full">
              <Card className="glass-dark border-0 shadow-xl h-full flex flex-col" data-testid="booking-card">
                <CardContent className="p-6 flex-1 flex flex-col overflow-hidden">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">BOOK YOUR ONE-ON-ONE CONSULT</h3>
                  
                  <div className="bg-white rounded-lg p-4 border-2 border-blue-600 flex-1 overflow-hidden" data-testid="booking-calendar">
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <Calendar className="text-blue-600" size={32} />
                      <p className="text-gray-700 font-medium text-lg">Select Your Appointment Time</p>
                    </div>
                    
                    {/* Practice Better Booking Widget */}
                    <style dangerouslySetInnerHTML={{__html: `
                      .better-inline-booking-widget {
                        position: relative;
                        overflow: hidden;
                        height: 100%;
                      }
                      .better-inline-booking-widget iframe {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                      }
                    `}} />
                    <div 
                      className="better-inline-booking-widget" 
                      data-url="https://drshumard.practicebetter.io" 
                      data-booking-page="627598aac4743098fc97ad55" 
                      data-hash="601a127b2a9c2406dcc94437" 
                      data-theme="246af4" 
                      data-theme-accent="f57f1b" 
                      style={{ width: '100%', maxWidth: '100%', height: 'calc(100% - 60px)' }} 
                      data-scrollbar-visible="false"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* Other Steps (3-7): Video + Action Card Layout */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
            {/* Video Section */}
            <div data-testid="video-section" style={{ height: '500px' }}>
              <Card className="glass-dark border-0 shadow-xl overflow-hidden h-full">
                <div className="h-full bg-gray-900">
                  <ReactPlayer
                    url={stepInfo.videoUrl}
                    width="100%"
                    height="100%"
                    controls
                    onEnded={() => handleTaskComplete(stepInfo.tasks[0])}
                    data-testid="video-player"
                  />
                </div>
              </Card>
            </div>

            {/* Action Card for Steps 3-7 */}
            <div style={{ height: '500px' }}>
              {currentStep !== 1 && (
              /* Action Card for other steps */
              <Card className="glass-dark border-0 shadow-xl h-full flex flex-col" data-testid="action-card">
                <CardContent className="p-6 flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">YOUR ACTION STEP:</h3>
                  <p className="text-xl font-semibold text-blue-700 mb-6">{stepInfo.action}</p>

                  <div className="space-y-3 flex-1" data-testid="task-list">
                    {stepInfo.tasks.map((task, idx) => (
                      <Button
                        key={task}
                        onClick={() => handleTaskComplete(task)}
                        disabled={completedTasks.has(task)}
                        className={`w-full py-6 text-left justify-start ${
                          completedTasks.has(task)
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : 'bg-white text-gray-800 hover:bg-blue-50'
                        } border-2`}
                        variant="outline"
                        data-testid={`task-button-${idx}`}
                      >
                        {completedTasks.has(task) ? (
                          <CheckCircle2 className="mr-2" size={20} />
                        ) : (
                          <Circle className="mr-2" size={20} />
                        )}
                        {task.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Button>
                    ))}
                  </div>

                  <Button
                    onClick={handleAdvanceStep}
                    className="w-full mt-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-6 rounded-xl shadow-lg"
                    data-testid="submit-button"
                  >
                    {currentStep === 7 ? 'Complete Program' : 'Continue to Next Step'}
                  </Button>
                </CardContent>
              </Card>
              )}
            </div>
          </div>
        )}

          {/* Bottom Container: Description Card (for Steps 3-7 only) */}
          {currentStep !== 1 && currentStep !== 2 && (
            <div className="mt-6">
              <Card className="glass-dark border-0 shadow-lg" data-testid="description-card">
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{stepInfo.title}</h3>
                  <p className="text-gray-600 mb-4">{stepInfo.description}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StepsPage;