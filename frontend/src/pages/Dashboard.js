import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowRight, LogOut, User, Trophy, TrendingUp } from 'lucide-react';
import AppointmentCountdown from '../components/AppointmentCountdown';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [appointmentData, setAppointmentData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const [userRes, progressRes, appointmentRes] = await Promise.all([
        axios.get(`${API}/user/me`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/user/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/user/appointment`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { appointment: null } })) // Handle case where endpoint doesn't exist yet
      ]);

      setUserData(userRes.data);
      setProgressData(progressRes.data);
      setAppointmentData(appointmentRes.data?.appointment);
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      }
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const handleStartJourney = () => {
    navigate('/steps');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const completionPercentage = (progressData?.current_step / 3) * 100;
  const completedSteps = progressData?.progress?.filter(p => p.completed_at).length || 0;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
      {/* Header */}
      <div className="glass-dark border-b border-gray-200 w-full overflow-hidden" data-testid="dashboard-header">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-3">
              <img 
                src="https://customer-assets.emergentagent.com/job_wellness-steps-2/artifacts/na68tuph_trans_sized.png" 
                alt="Logo" 
                className="h-6 w-auto sm:h-7 md:h-8 object-contain flex-shrink-0"
              />
            </div>
            <div className="flex items-center gap-4">
              {userData?.role === 'admin' && (
                <Button variant="outline" onClick={() => navigate('/admin')} data-testid="admin-button">
                  Admin Panel
                </Button>
              )}
              <Button variant="outline" className="flex items-center gap-2" onClick={handleLogout} data-testid="logout-button">
                <LogOut size={16} />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 w-full overflow-x-hidden">
        {/* Appointment Countdown - Show if appointment exists */}
        {appointmentData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <AppointmentCountdown appointment={appointmentData} />
          </motion.div>
        )}

        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="glass-dark rounded-3xl p-8 md:p-12 shadow-xl" data-testid="welcome-section">
            <div className="flex items-start justify-between flex-wrap gap-6">
              <div className="flex-1 min-w-[300px]">
                <div className="flex items-center gap-3 mb-3">
                  <User className="text-teal-600" size={32} />
                  <h2 className="text-4xl font-bold text-gray-800">Welcome, {userData?.name}!</h2>
                </div>
                <p className="text-lg text-gray-600 mb-6">
                  You're on Step {progressData?.current_step} of your wellness journey.
                </p>
                {progressData?.current_step === 3 && completedSteps === 3 ? (
                  <Button 
                    onClick={() => navigate('/outcome')}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-8 py-6 text-lg rounded-xl shadow-lg flex items-center gap-2"
                    data-testid="view-outcome-button"
                  >
                    🎉 View Your Achievement
                    <Trophy size={20} />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleStartJourney}
                    className="bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white font-semibold px-8 py-6 text-lg rounded-xl shadow-lg flex items-center gap-2"
                    data-testid="continue-journey-button"
                  >
                    Continue Your Journey
                    <ArrowRight size={20} />
                  </Button>
                )}
              </div>
              <div className="w-full md:w-auto">
                <div className="bg-gradient-to-br from-teal-50 to-cyan-100 rounded-2xl p-6 min-w-[250px]">
                  <div className="flex items-center gap-3 mb-4">
                    <Trophy className="text-teal-600" size={28} />
                    <h3 className="text-xl font-semibold text-gray-800">Your Progress</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Overall Completion</span>
                        <span className="font-semibold text-gray-800">{Math.round(completionPercentage)}%</span>
                      </div>
                      <Progress value={completionPercentage} className="h-2" data-testid="progress-bar" />
                    </div>
                    <div className="pt-3 border-t border-cyan-200">
                      <p className="text-sm text-gray-600">Current Step: <span className="font-semibold text-gray-800">{progressData?.current_step}/3</span></p>
                      <p className="text-sm text-gray-600 mt-1">Completed: <span className="font-semibold text-gray-800">{completedSteps} steps</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8 lg:mb-12 w-full overflow-hidden"
        >
          <Card className="glass-dark border-0 shadow-lg" data-testid="stat-card-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="text-green-600" size={20} />
                Active Step
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-800">Step {progressData?.current_step}</p>
              <p className="text-sm text-gray-600 mt-1">Keep up the great work!</p>
            </CardContent>
          </Card>

          <Card className="glass-dark border-0 shadow-lg" data-testid="stat-card-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="text-yellow-600" size={20} />
                Completed Steps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-800">{completedSteps}</p>
              <p className="text-sm text-gray-600 mt-1">Out of 3 total steps</p>
            </CardContent>
          </Card>

          <Card className="glass-dark border-0 shadow-lg" data-testid="stat-card-3">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRight className="text-teal-600" size={20} />
                Next Milestone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-800">
                {progressData?.current_step === 3 ? 'Complete!' : `Step ${progressData?.current_step + 1}`}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {progressData?.current_step === 3 ? 'Congratulations!' : 'Coming up next'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Program Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="glass-dark border-0 shadow-lg" data-testid="program-overview">
            <CardHeader>
              <CardTitle className="text-2xl">Your Wellness Program</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-6">
                This streamlined wellness onboarding program guides you through three essential steps to prepare for your personalized health journey with Dr. Shumard.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full overflow-hidden">
                {[
                  { title: 'Step 1: Book Consultation', desc: 'Schedule your one-on-one call' },
                  { title: 'Step 2: Health Profile', desc: 'Complete your health blueprint' },
                  { title: 'Step 3: Ready to Start', desc: 'Final preparations complete' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-gradient-to-br from-teal-50 to-cyan-100 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-800 mb-1">{item.title}</h4>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;