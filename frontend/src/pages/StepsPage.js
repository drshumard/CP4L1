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
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Placeholder
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

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleAdvanceStep = async () => {
    const currentStep = progressData.current_step;
    const requiredTasks = STEP_DATA[currentStep].tasks;
    const allTasksCompleted = requiredTasks.every(task => completedTasks.has(task));

    if (!allTasksCompleted) {
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

      toast.success('Advanced to next step!');
      setCompletedTasks(new Set());
      await fetchData();
    } catch (error) {
      toast.error('Failed to advance step');
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Section */}
          <div className="lg:col-span-2" data-testid="video-section">
            <Card className="glass-dark border-0 shadow-xl overflow-hidden">
              <div className="aspect-video bg-gray-900">
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

            {/* Description Card */}
            <Card className="glass-dark border-0 shadow-lg mt-6" data-testid="description-card">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{stepInfo.title}</h3>
                <p className="text-gray-600">{stepInfo.description}</p>
              </CardContent>
            </Card>
          </div>

          {/* Action Section */}
          <div className="space-y-6">
            {/* Action Card */}
            <Card className="glass-dark border-0 shadow-xl" data-testid="action-card">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">YOUR ACTION STEP:</h3>
                <p className="text-xl font-semibold text-blue-700 mb-6">{stepInfo.action}</p>

                {/* Booking Calendar for Step 1 */}
                {currentStep === 1 && (
                  <div className="mb-6" data-testid="booking-calendar">
                    <div className="bg-white rounded-lg p-4 border-2 border-blue-600">
                      <Calendar className="mx-auto text-blue-600 mb-3" size={48} />
                      <p className="text-center text-gray-700 font-medium mb-4">Book Your Consultation</p>
                      <iframe
                        src="https://link.drjasonshumard.com/widget/booking/gBmaT3IK8LcQxmzpaf96"
                        style={{ width: '100%', border: 'none', minHeight: '500px' }}
                        scrolling="no"
                        id="msgsndr-calendar"
                        title="Booking Calendar"
                      />
                    </div>
                  </div>
                )}

                {/* Generic Task Completion for other steps */}
                {currentStep !== 1 && (
                  <div className="space-y-3" data-testid="task-list">
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
                )}

                {/* Submit Button */}
                <Button
                  onClick={currentStep === 1 ? () => handleTaskComplete('book_consultation') : handleAdvanceStep}
                  className="w-full mt-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-6 rounded-xl shadow-lg"
                  data-testid="submit-button"
                >
                  {currentStep === 7 ? 'Complete Program' : 'Continue to Next Step'}
                </Button>
              </CardContent>
            </Card>

            {/* Health Advocate Card */}
            <Card className="glass-dark border-0 shadow-lg" data-testid="advocate-card">
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 mx-auto mb-4 flex items-center justify-center">
                    <UserIcon className="text-blue-600" size={48} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">YOUR HEALTH ADVOCATE</h3>
                  <p className="text-gray-600 mb-1">Dr. Jason Shumard</p>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                    <Phone size={16} />
                    <span>Available for support</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepsPage;