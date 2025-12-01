import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Trophy, Star, Heart, TrendingUp, Calendar, CheckCircle2, Sparkles, Award, Home } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Confetti = () => {
  const colors = ['#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE', '#F59E0B', '#FCD34D'];
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: window.innerHeight + 20,
            opacity: [1, 1, 0],
            rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: 'linear',
            repeat: Infinity,
          }}
          style={{
            position: 'absolute',
            left: piece.left,
            width: '10px',
            height: '10px',
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
          }}
        />
      ))}
    </div>
  );
};

const OutcomePage = () => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #CFFAFE 50%, #A5F3FC 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const achievements = [
    { icon: CheckCircle2, title: 'Consultation Booked', description: 'Scheduled your one-on-one call' },
    { icon: Calendar, title: 'Journey Started', description: 'Took the first important step' },
    { icon: Heart, title: 'Committed', description: 'Dedicated to better health' },
    { icon: TrendingUp, title: 'Ready to Learn', description: 'Prepared for your wellness plan' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #BFDBFE 100%)' }}>
      <Confetti />
      
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

      {/* Header */}
      <div className="glass-dark border-b border-gray-200 relative z-10" data-testid="outcome-header">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center"
              >
                <Trophy className="text-white" size={24} />
              </motion.div>
              <h1 className="text-2xl font-bold text-gray-800">Congratulations!</h1>
            </div>
            <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" data-testid="home-button">
              <Home size={16} />
              Dashboard
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-block mb-6"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-yellow-400 rounded-full blur-xl opacity-50"
              />
              <div className="relative glass-dark rounded-full p-8 border-4 border-yellow-400">
                <Trophy className="text-yellow-500" size={80} />
              </div>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-5xl sm:text-6xl font-bold mb-4"
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #EC4899 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Great Start, {userData?.name}!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xl text-gray-700 max-w-2xl mx-auto mb-8"
          >
            You've successfully completed your wellness journey onboarding! Your consultation is booked and your health profile is complete. You're all set to begin your personalized wellness program.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2"
          >
            <Sparkles className="text-green-500" size={24} />
            <span className="text-2xl font-semibold text-gray-800">First Milestone Complete</span>
            <Sparkles className="text-green-500" size={24} />
          </motion.div>
        </motion.div>

        {/* Achievements Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">What You've Accomplished</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {achievements.map((achievement, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + idx * 0.1 }}
                whileHover={{ y: -5 }}
              >
                <Card className="glass-dark border-0 shadow-xl h-full overflow-hidden">
                  <CardContent className="p-6 text-center relative">
                    <motion.div
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: idx * 0.2 }}
                      className="inline-block mb-4"
                    >
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center mx-auto">
                        <achievement.icon className="text-white" size={32} />
                      </div>
                    </motion.div>
                    <h3 className="font-bold text-lg text-gray-800 mb-2">{achievement.title}</h3>
                    <p className="text-sm text-gray-600">{achievement.description}</p>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 1.5 + idx * 0.1, type: 'spring' }}
                      className="absolute top-4 right-4"
                    >
                      <CheckCircle2 className="text-green-500" size={24} />
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Journey Summary */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.8 }}
          className="mb-16"
        >
          <Card className="glass-dark border-0 shadow-2xl overflow-hidden">
            <CardContent className="p-8 sm:p-12">
              <div className="text-center mb-8">
                <Award className="inline-block text-blue-500 mb-4" size={48} />
                <h2 className="text-3xl font-bold text-gray-800 mb-4">Ready for Your Wellness Journey</h2>
                <p className="text-gray-600 max-w-3xl mx-auto">
                  You've completed all onboarding steps! Your consultation with Dr. Shumard is scheduled, and your health 
                  profile is complete. You're now fully prepared to begin your personalized wellness program. Dr. Shumard 
                  has everything he needs to guide you toward better health.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100"
                >
                  <div className="text-4xl font-bold text-blue-600 mb-2">3/3</div>
                  <div className="text-sm text-gray-600">Steps Completed</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center p-6 rounded-2xl bg-gradient-to-br from-green-50 to-green-100"
                >
                  <div className="text-4xl font-bold text-green-600 mb-2">100%</div>
                  <div className="text-sm text-gray-600">Journey Progress</div>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="text-center p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100"
                >
                  <div className="text-4xl font-bold text-purple-600 mb-2">✓</div>
                  <div className="text-sm text-gray-600">All Steps Complete</div>
                </motion.div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 rounded-2xl p-6 mb-8">
                <h3 className="font-bold text-xl text-gray-800 mb-4">How to Prepare for Your Call:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    'Review your current medications',
                    'List your health goals',
                    'Note recent blood sugar readings',
                    'Write down your questions',
                    'Prepare your medical history',
                    'Think about lifestyle challenges',
                    'Consider dietary preferences',
                    'Be ready to discuss exercise habits',
                  ].map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 2 + idx * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle2 className="text-blue-500 flex-shrink-0" size={20} />
                      <span className="text-gray-700">{item}</span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="text-center">
                <h3 className="font-bold text-xl text-gray-800 mb-3">What Comes Next?</h3>
                <p className="text-gray-600 mb-6">
                  During your scheduled consultation, Dr. Shumard will review your health profile and create a personalized 
                  wellness plan tailored to your specific needs and goals. He'll guide you through diabetes management 
                  strategies, nutrition recommendations, and lifestyle modifications to help you achieve optimal health.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Button
                    onClick={() => navigate('/')}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold px-8 py-6 rounded-xl shadow-lg"
                  >
                    Go to Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/steps')}
                    className="font-semibold px-8 py-6 rounded-xl"
                  >
                    View Step Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Motivational Quote */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="text-center"
        >
          <Card className="glass-dark border-0 shadow-xl max-w-3xl mx-auto">
            <CardContent className="p-8">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Star className="inline-block text-yellow-500 mb-4" size={40} />
              </motion.div>
              <blockquote className="text-2xl font-semibold text-gray-800 italic mb-4">
                "The greatest wealth is health."
              </blockquote>
              <p className="text-gray-600">— Virgil</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default OutcomePage;
