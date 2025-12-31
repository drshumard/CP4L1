import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, Users, TrendingUp, BarChart3, RefreshCw, Trash2, Activity,
  Search, Mail, Phone, Calendar, ChevronRight, X, Eye, EyeOff,
  Send, Key, Edit2, UserCog, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import { 
  trackAdminPanelViewed,
  trackAdminUserViewed,
  trackAdminUserEdited,
  trackAdminPasswordReset,
  trackAdminWelcomeEmailSent,
  trackAdminUserDeleted,
  trackModalOpened,
  trackModalClosed
} from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [pendingStep, setPendingStep] = useState(null); // Track pending step change
  const [passwordFormData, setPasswordFormData] = useState({
    mode: 'set', // 'set' or 'link'
    newPassword: '',
    showPassword: false
  });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const [usersRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/admin/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setUsers(usersRes.data.users);
      setAnalytics(analyticsRes.data);
      
      // Track admin panel view
      trackAdminPanelViewed(localStorage.getItem('user_id'));
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required');
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Failed to load admin data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStepChange = (newStep) => {
    // Just update pending step - don't save yet
    setPendingStep(newStep);
  };

  const handleSaveStepChange = async () => {
    if (!pendingStep || !selectedUser) return;
    
    const userId = selectedUser.id;
    const newStep = pendingStep;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/admin/user/${userId}/set-step`,
        { step: newStep },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`User moved to Step ${newStep}`);
      fetchData();
      setSelectedUser({ ...selectedUser, current_step: newStep });
      setPendingStep(null); // Clear pending change
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change user step');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetProgress = async (userId) => {
    if (!window.confirm('Are you sure you want to reset this user\'s progress to Step 1?')) {
      return;
    }

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/admin/user/${userId}/reset`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('User progress reset successfully');
      fetchData();
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, current_step: 1 });
      }
    } catch (error) {
      toast.error('Failed to reset user progress');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userName, userEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userName}" (${userEmail})?\n\nThis action CANNOT be undone!`)) {
      return;
    }

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(
        `${API}/admin/user/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      trackAdminUserDeleted(userId);
      toast.success('User deleted successfully');
      setSelectedUser(null);
      setShowUserModal(false);
      fetchData();
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error('Cannot delete your own admin account');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to delete user');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendWelcomeEmail = async (userId) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/admin/user/${userId}/resend-welcome`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      trackAdminWelcomeEmailSent(userId);
      toast.success('Welcome email sent successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send email');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      
      if (passwordFormData.mode === 'set') {
        if (!passwordFormData.newPassword || passwordFormData.newPassword.length < 6) {
          toast.error('Password must be at least 6 characters');
          setActionLoading(false);
          return;
        }
        
        await axios.post(
          `${API}/admin/user/${selectedUser.id}/set-password`,
          { password: passwordFormData.newPassword },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        trackAdminPasswordReset(selectedUser.id);
        toast.success('Password updated and email sent to user');
      } else {
        await axios.post(
          `${API}/admin/user/${selectedUser.id}/send-reset-link`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        trackAdminPasswordReset(selectedUser.id);
        toast.success('Password reset link sent to user');
      }
      
      setShowResetPasswordModal(false);
      trackModalClosed('reset_password');
      setPasswordFormData({ mode: 'set', newPassword: '', showPassword: false });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;
    
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(
        `${API}/admin/user/${selectedUser.id}`,
        editFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      trackAdminUserEdited(selectedUser.id, Object.keys(editFormData));
      toast.success('User updated successfully');
      setShowEditModal(false);
      trackModalClosed('edit_user');
      fetchData();
      
      // Update selected user
      setSelectedUser({ ...selectedUser, ...editFormData });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setActionLoading(false);
    }
  };

  const openUserDetails = (user) => {
    setSelectedUser(user);
    setPendingStep(null); // Reset pending step when opening new user
    setShowUserModal(true);
    trackAdminUserViewed(user.id);
    trackModalOpened('user_details');
  };

  const openEditModal = () => {
    setEditFormData({
      name: selectedUser.name || '',
      email: selectedUser.email || '',
      phone: selectedUser.phone || '',
      first_name: selectedUser.first_name || '',
      last_name: selectedUser.last_name || ''
    });
    setShowEditModal(true);
  };

  const openResetPasswordModal = () => {
    setPasswordFormData({ mode: 'set', newPassword: '', showPassword: false });
    setShowResetPasswordModal(true);
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone?.includes(searchTerm)
  );

  const getStepLabel = (step) => {
    const labels = {
      1: 'Step 1',
      2: 'Step 2',
      3: 'Step 3',
      4: 'Complete ✓'
    };
    return labels[step] || `Step ${step}`;
  };

  const getStepColor = (step) => {
    const colors = {
      1: 'bg-blue-100 text-blue-700 border-blue-200',
      2: 'bg-purple-100 text-purple-700 border-purple-200',
      3: 'bg-amber-100 text-amber-700 border-amber-200',
      4: 'bg-green-100 text-green-700 border-green-200'
    };
    return colors[step] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 50%, #115E59 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40" data-testid="admin-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
              <img 
                src="https://portal-drshumard.b-cdn.net/logo.png" 
                alt="Logo" 
                className="h-8 object-contain"
              />
              <div className="flex items-center gap-3 md:hidden">
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/admin/logs')} 
                  className="flex items-center gap-2"
                  size="sm"
                >
                  <Activity size={16} />
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" size="sm">
                  <Home size={16} />
                </Button>
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-800 text-center w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">Admin Dashboard</h1>
            <div className="hidden md:flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/logs')} 
                className="flex items-center gap-2"
              >
                <Activity size={16} />
                <span>Logs</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2">
                <Home size={16} />
                <span>Home</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{analytics?.total_users || 0}</p>
                  <p className="text-xs text-gray-500">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="text-green-600" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{analytics?.step_distribution?.step_4 || 0}</p>
                  <p className="text-xs text-gray-500">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Activity className="text-amber-600" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{analytics?.step_distribution?.step_3 || 0}</p>
                  <p className="text-xs text-gray-500">On Step 3</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Clock className="text-purple-600" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{analytics?.step_distribution?.step_2 || 0}</p>
                  <p className="text-xs text-gray-500">On Step 2</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <AlertCircle className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{analytics?.step_distribution?.step_1 || 0}</p>
                  <p className="text-xs text-gray-500">On Step 1</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users List */}
          <div className="lg:col-span-2">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-lg">Users</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent w-full sm:w-64"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {filteredUsers.map(user => (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => openUserDetails(user)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                            {user.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-800 truncate">{user.name}</p>
                            <p className="text-sm text-gray-500 truncate">{user.email}</p>
                            {/* Tags on mobile - below email */}
                            <div className="flex items-center gap-1.5 mt-1 md:hidden">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStepColor(user.current_step)}`}>
                                {getStepLabel(user.current_step)}
                              </span>
                              {user.role === 'admin' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-100 text-cyan-700 border border-cyan-200">
                                  Admin
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Tags on desktop - right side */}
                        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStepColor(user.current_step)}`}>
                            {getStepLabel(user.current_step)}
                          </span>
                          {user.role === 'admin' && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700 border border-cyan-200">
                              Admin
                            </span>
                          )}
                          <ChevronRight className="text-gray-400" size={18} />
                        </div>
                        <ChevronRight className="text-gray-400 md:hidden flex-shrink-0" size={18} />
                      </div>
                    </motion.div>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                      No users found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats / Step Distribution */}
          <div className="lg:col-span-1">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100 pb-4">
                <CardTitle className="text-lg">Step Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-4">
                  {[1, 2, 3].map(step => {
                    const count = analytics?.step_distribution?.[`step_${step}`] || 0;
                    const percentage = analytics?.total_users ? Math.round((count / analytics.total_users) * 100) : 0;
                    return (
                      <div key={step} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Step {step}</span>
                          <span className="font-medium text-gray-800">{count} users</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.5, delay: step * 0.1 }}
                            className={`h-full rounded-full ${
                              step === 1 ? 'bg-blue-500' : step === 2 ? 'bg-purple-500' : 'bg-green-500'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h4 className="font-medium text-gray-800 mb-4">Recent Activity</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <Users className="text-green-600" size={14} />
                      </div>
                      <div>
                        <p className="text-gray-700">{analytics?.total_users || 0} total users</p>
                        <p className="text-xs text-gray-400">All time</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                        <TrendingUp className="text-teal-600" size={14} />
                      </div>
                      <div>
                        <p className="text-gray-700">{analytics?.completed_steps || 0} steps completed</p>
                        <p className="text-xs text-gray-400">Across all users</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      <AnimatePresence>
        {showUserModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => { setShowUserModal(false); setPendingStep(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xl font-semibold">
                      {selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">{selectedUser.name}</h3>
                      <p className="text-sm text-gray-500">{selectedUser.role === 'admin' ? 'Administrator' : 'User'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowUserModal(false); setPendingStep(null); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {/* User Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail className="text-gray-400" size={18} />
                    <div className="overflow-hidden">
                      <p className="text-xs text-gray-500">Email</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Phone className="text-gray-400" size={18} />
                    <div>
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="text-sm font-medium text-gray-800">{selectedUser.phone || 'Not set'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <BarChart3 className="text-gray-400" size={18} />
                    <div>
                      <p className="text-xs text-gray-500">Current Step</p>
                      <p className="text-sm font-medium text-gray-800">{getStepLabel(selectedUser.current_step)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Calendar className="text-gray-400" size={18} />
                    <div>
                      <p className="text-xs text-gray-500">Joined</p>
                      <p className="text-sm font-medium text-gray-800">
                        {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Quick Actions</h4>
                  
                  {/* Move to Step */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-gray-600 whitespace-nowrap">Move to Step:</span>
                    <select
                      value={pendingStep !== null ? pendingStep : (selectedUser?.current_step || 1)}
                      onChange={(e) => handleStepChange(parseInt(e.target.value))}
                      disabled={actionLoading}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    >
                      <option value={1}>Step 1 - Welcome & Booking</option>
                      <option value={2}>Step 2 - Health Profile</option>
                      <option value={3}>Step 3 - Final Preparations</option>
                      <option value={4}>Complete ✓</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 py-5"
                      onClick={openEditModal}
                    >
                      <Edit2 size={16} />
                      Edit User
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 py-5"
                      onClick={openResetPasswordModal}
                    >
                      <Key size={16} />
                      Reset Password
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 py-5"
                      onClick={() => handleResendWelcomeEmail(selectedUser.id)}
                      disabled={actionLoading}
                    >
                      <Send size={16} />
                      Resend Welcome
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 py-5"
                      onClick={() => handleResetProgress(selectedUser.id)}
                      disabled={actionLoading}
                    >
                      <RefreshCw size={16} />
                      Reset Progress
                    </Button>
                  </div>

                  {/* Save and Delete buttons side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleSaveStepChange}
                      disabled={pendingStep === null || pendingStep === selectedUser?.current_step || actionLoading}
                      className={`flex items-center justify-center gap-2 py-5 ${
                        pendingStep !== null && pendingStep !== selectedUser?.current_step
                          ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 size={16} />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 py-5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name, selectedUser.email)}
                      disabled={actionLoading}
                    >
                      <Trash2 size={16} />
                      Delete User
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {showResetPasswordModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowResetPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800">Reset Password</h3>
                  <button
                    onClick={() => setShowResetPasswordModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-1">For {selectedUser.name}</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Mode Selection */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPasswordFormData({ ...passwordFormData, mode: 'set' })}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                      passwordFormData.mode === 'set'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Key className="mx-auto mb-1" size={20} />
                    <p className="text-sm font-medium">Set Password</p>
                  </button>
                  <button
                    onClick={() => setPasswordFormData({ ...passwordFormData, mode: 'link' })}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                      passwordFormData.mode === 'link'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Send className="mx-auto mb-1" size={20} />
                    <p className="text-sm font-medium">Send Reset Link</p>
                  </button>
                </div>

                {/* Password Input (only for 'set' mode) */}
                {passwordFormData.mode === 'set' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">New Password</label>
                    <div className="relative">
                      <input
                        type={passwordFormData.showPassword ? 'text' : 'password'}
                        value={passwordFormData.newPassword}
                        onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                        placeholder="Enter new password..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => setPasswordFormData({ ...passwordFormData, showPassword: !passwordFormData.showPassword })}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {passwordFormData.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">Password will be emailed to the user</p>
                  </div>
                )}

                {passwordFormData.mode === 'link' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-700">
                      A password reset link will be sent to <strong>{selectedUser.email}</strong>. 
                      The link will be valid for 24 hours.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleResetPassword}
                  disabled={actionLoading || (passwordFormData.mode === 'set' && !passwordFormData.newPassword)}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white py-5"
                >
                  {actionLoading ? 'Processing...' : passwordFormData.mode === 'set' ? 'Set Password & Send Email' : 'Send Reset Link'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {showEditModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800">Edit User</h3>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      value={editFormData.first_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      value={editFormData.last_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="+1234567890"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <Button
                  onClick={handleEditUser}
                  disabled={actionLoading}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white py-5"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
