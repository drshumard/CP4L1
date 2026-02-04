import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, Users, BarChart3, RefreshCw, Trash2, Activity,
  Search, Mail, Phone, Calendar, X, Eye, EyeOff,
  Send, Key, Edit2, Clock, CheckCircle2, AlertCircle
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [pendingStep, setPendingStep] = useState(null);
  const [passwordFormData, setPasswordFormData] = useState({
    mode: 'set',
    newPassword: '',
    showPassword: false
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingFormData, setBookingFormData] = useState({
    date: '',
    time: '',
    timezone: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const usersRes = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUsers(usersRes.data.users);
      
      trackAdminPanelViewed(localStorage.getItem('user_id'));
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required', { id: 'admin-access-required' });
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else {
        toast.error('Failed to load admin data', { id: 'admin-load-error' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStepChange = (newStep) => {
    setPendingStep(newStep);
  };

  const handleSaveStepChange = async () => {
    if (pendingStep === null || pendingStep === undefined || !selectedUser) return;
    
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

      const stepLabel = newStep === 0 ? 'Refunded' : `Step ${newStep}`;
      toast.success(`User moved to ${stepLabel}`, { id: 'step-change-success' });
      fetchData();
      setSelectedUser({ ...selectedUser, current_step: newStep });
      setPendingStep(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change user step', { id: 'step-change-error' });
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

      toast.success('User progress reset successfully', { id: 'reset-progress-success' });
      fetchData();
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, current_step: 1 });
      }
    } catch (error) {
      toast.error('Failed to reset user progress', { id: 'reset-progress-error' });
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
      toast.success('User deleted successfully', { id: 'delete-user-success' });
      setSelectedUser(null);
      setShowUserModal(false);
      fetchData();
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error('Cannot delete your own admin account', { id: 'delete-self-error' });
      } else {
        toast.error(error.response?.data?.detail || 'Failed to delete user', { id: 'delete-user-error' });
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
      toast.success('Welcome email sent successfully', { id: 'welcome-email-success' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to send email', { id: 'welcome-email-error' });
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
          toast.error('Password must be at least 6 characters', { id: 'password-length-error' });
          setActionLoading(false);
          return;
        }
        
        await axios.post(
          `${API}/admin/user/${selectedUser.id}/set-password`,
          { password: passwordFormData.newPassword },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        trackAdminPasswordReset(selectedUser.id);
        toast.success('Password updated and email sent to user', { id: 'password-set-success' });
      } else {
        await axios.post(
          `${API}/admin/user/${selectedUser.id}/send-reset-link`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        trackAdminPasswordReset(selectedUser.id);
        toast.success('Password reset link sent to user', { id: 'password-link-success' });
      }
      
      setShowResetPasswordModal(false);
      trackModalClosed('reset_password');
      setPasswordFormData({ mode: 'set', newPassword: '', showPassword: false });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password', { id: 'password-reset-error' });
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
      toast.success('User updated successfully', { id: 'edit-user-success' });
      setShowEditModal(false);
      trackModalClosed('edit_user');
      fetchData();
      
      setSelectedUser({ ...selectedUser, ...editFormData });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user', { id: 'edit-user-error' });
    } finally {
      setActionLoading(false);
    }
  };

  const openUserDetails = (user) => {
    setSelectedUser(user);
    setPendingStep(null);
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

  const openBookingModal = () => {
    // Pre-fill with existing booking info if available
    const existingBooking = selectedUser?.booking_info;
    const userTimezone = selectedUser?.signup_location?.timezone || 
                         selectedUser?.location_info?.timezone || '';
    
    if (existingBooking) {
      // Handle both session_start (from online booking) and booking_datetime (from manual entry)
      const bookingDateStr = existingBooking.session_start || existingBooking.booking_datetime;
      if (bookingDateStr) {
        const dt = new Date(bookingDateStr);
        setBookingFormData({
          date: dt.toISOString().split('T')[0],
          time: dt.toTimeString().slice(0, 5),
          timezone: existingBooking.timezone || existingBooking.booking_timezone || userTimezone,
          notes: existingBooking.update_notes || ''
        });
      } else {
        setBookingFormData({
          date: '',
          time: '',
          timezone: userTimezone,
          notes: ''
        });
      }
    } else {
      setBookingFormData({
        date: '',
        time: '',
        timezone: userTimezone,
        notes: ''
      });
    }
    setShowBookingModal(true);
  };

  const handleUpdateBooking = async () => {
    if (!bookingFormData.date || !bookingFormData.time) {
      toast.error('Please enter both date and time');
      return;
    }

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const bookingDatetime = `${bookingFormData.date}T${bookingFormData.time}:00`;
      
      await axios.post(
        `${API}/admin/user/${selectedUser.id}/update-booking`,
        {
          booking_datetime: bookingDatetime,
          booking_timezone: bookingFormData.timezone,
          notes: bookingFormData.notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Booking updated successfully');
      setShowBookingModal(false);
      await fetchData();
      
      // Update selected user with new data
      const updatedUser = users.find(u => u.id === selectedUser.id);
      if (updatedUser) {
        setSelectedUser({...updatedUser, booking_info: {
          booking_datetime: bookingDatetime,
          booking_timezone: bookingFormData.timezone,
          update_notes: bookingFormData.notes
        }});
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update booking');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!window.confirm('Are you sure you want to remove this booking?')) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(
        `${API}/admin/user/${selectedUser.id}/booking`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Booking removed');
      setShowBookingModal(false);
      await fetchData();
      setSelectedUser({...selectedUser, booking_info: null});
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove booking');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteUser = async (newRole) => {
    if (!selectedUser || selectedUser.role === 'admin') return;
    
    const confirmMessage = newRole === 'staff' 
      ? 'Promote this user to Staff? They will have access to admin panel and be excluded from analytics.'
      : 'Demote this user to regular User?';
    
    if (!window.confirm(confirmMessage)) return;
    
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(
        `${API}/admin/user/${selectedUser.id}/promote`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`User ${newRole === 'staff' ? 'promoted to Staff' : 'demoted to User'}`);
      setSelectedUser({ ...selectedUser, role: newRole });
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change role');
    } finally {
      setActionLoading(false);
    }
  };

  // Sort by created_at descending (newest first) and filter
  const filteredUsers = users
    .filter(user =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm)
    )
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });

  const getStepLabel = (step) => {
    const labels = {
      0: 'Refunded',
      1: 'Step 1',
      2: 'Step 2',
      3: 'Step 3',
      4: 'Complete ✓'
    };
    return labels[step] || `Step ${step}`;
  };

  const getStepColor = (step) => {
    const colors = {
      0: 'bg-red-100 text-red-700 border-red-200',
      1: 'bg-blue-100 text-blue-700 border-blue-200',
      2: 'bg-purple-100 text-purple-700 border-purple-200',
      3: 'bg-amber-100 text-amber-700 border-amber-200',
      4: 'bg-green-100 text-green-700 border-green-200'
    };
    return colors[step] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Format date as "Jan 15, 2025, 2:30 PM"
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
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
                  onClick={() => navigate('/admin/analytics')} 
                  className="flex items-center gap-2"
                  size="sm"
                >
                  <BarChart3 size={16} />
                </Button>
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
            <h1 className="text-xl font-bold text-gray-800 text-center w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">User Management</h1>
            <div className="hidden md:flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/analytics')} 
                className="flex items-center gap-2"
              >
                <BarChart3 size={16} />
                <span>Analytics</span>
              </Button>
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
        {/* Users Table */}
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardHeader className="border-b border-gray-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="text-teal-600" size={20} />
                Users ({filteredUsers.length})
              </CardTitle>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-700">Date Joined</TableHead>
                    <TableHead className="font-semibold text-gray-700">Name</TableHead>
                    <TableHead className="font-semibold text-gray-700">Email</TableHead>
                    <TableHead className="font-semibold text-gray-700">Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user, index) => (
                      <TableRow 
                        key={user.id}
                        onClick={() => openUserDetails(user)}
                        className={`cursor-pointer transition-colors hover:bg-teal-50 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        }`}
                      >
                        <TableCell className="text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-gray-400" />
                            {formatDate(user.created_at)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-gray-800">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                              {user.name?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <span className="truncate max-w-[150px]">{user.name || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          <span className="truncate max-w-[200px] block">{user.email}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStepColor(user.current_step)}`}>
                              {getStepLabel(user.current_step)}
                            </span>
                            {user.role === 'admin' && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700 border border-cyan-200">
                                Admin
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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
                      <div className="flex items-center gap-2 mt-1">
                        {selectedUser.role === 'admin' ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                            Administrator
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              selectedUser.role === 'staff' 
                                ? 'bg-teal-100 text-teal-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {selectedUser.role === 'staff' ? 'Staff' : 'User'}
                            </span>
                            <button
                              onClick={() => handlePromoteUser(selectedUser.role === 'staff' ? 'user' : 'staff')}
                              disabled={actionLoading}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                selectedUser.role === 'staff'
                                  ? 'border-gray-300 text-gray-500 hover:bg-gray-100'
                                  : 'border-teal-300 text-teal-600 hover:bg-teal-50'
                              }`}
                            >
                              {selectedUser.role === 'staff' ? 'Demote' : 'Make Staff'}
                            </button>
                          </div>
                        )}
                      </div>
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
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
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
                        {formatDate(selectedUser.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Booking Info Section */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Clock size={16} className="text-teal-600" />
                      Booking Information
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={openBookingModal}
                    >
                      {selectedUser.booking_info ? 'Edit Booking' : 'Set Booking'}
                    </Button>
                  </div>
                  
                  {selectedUser.booking_info ? (
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-teal-600" />
                        <span className="text-sm font-medium text-gray-800">
                          {formatDate(selectedUser.booking_info.session_start || selectedUser.booking_info.booking_datetime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Clock size={12} />
                        <span>Timezone: {selectedUser.booking_info.timezone || selectedUser.booking_info.booking_timezone || 'Not specified'}</span>
                      </div>
                      {selectedUser.booking_info.source && (
                        <p className="text-xs text-gray-500">Source: {selectedUser.booking_info.source === 'online_booking' ? 'Online Booking' : 'Manual Entry'}</p>
                      )}
                      {selectedUser.booking_info.update_notes && (
                        <p className="text-xs text-gray-500 italic">Note: {selectedUser.booking_info.update_notes}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertCircle size={14} />
                        <span className="text-sm">No booking set</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        User timezone: {selectedUser.signup_location?.timezone || selectedUser.location_info?.timezone || 'Unknown'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-4 space-y-3 border-t border-gray-100">
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
                      <option value={0}>⚠️ Refunded</option>
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
                  <label className="text-sm font-medium text-gray-700">Display Name</label>
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

      {/* Booking Modal */}
      <AnimatePresence>
        {showBookingModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowBookingModal(false)}
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
                  <h3 className="text-lg font-bold text-gray-800">
                    {selectedUser.booking_info ? 'Edit Booking' : 'Set Booking Time'}
                  </h3>
                  <button
                    onClick={() => setShowBookingModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-1">For {selectedUser.name || selectedUser.email}</p>
              </div>

              <div className="p-6 space-y-4">
                {/* User's Original Timezone Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Clock size={14} />
                    <span className="text-sm font-medium">User's Timezone</span>
                  </div>
                  <p className="text-sm text-blue-800 mt-1">
                    {selectedUser.signup_location?.timezone || selectedUser.location_info?.timezone || 'Unknown - please verify with user'}
                  </p>
                </div>

                {/* Date Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Booking Date</label>
                  <input
                    type="date"
                    value={bookingFormData.date}
                    onChange={(e) => setBookingFormData({ ...bookingFormData, date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Time Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Booking Time</label>
                  <input
                    type="time"
                    value={bookingFormData.time}
                    onChange={(e) => setBookingFormData({ ...bookingFormData, time: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Timezone Override */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Timezone (for reference)</label>
                  <input
                    type="text"
                    value={bookingFormData.timezone}
                    onChange={(e) => setBookingFormData({ ...bookingFormData, timezone: e.target.value })}
                    placeholder="e.g., America/New_York, Europe/London"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
                  <textarea
                    value={bookingFormData.notes}
                    onChange={(e) => setBookingFormData({ ...bookingFormData, notes: e.target.value })}
                    placeholder="e.g., Rescheduled via phone call"
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  {selectedUser.booking_info && (
                    <Button
                      variant="outline"
                      onClick={handleDeleteBooking}
                      disabled={actionLoading}
                      className="flex-1 py-5 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Remove Booking
                    </Button>
                  )}
                  <Button
                    onClick={handleUpdateBooking}
                    disabled={actionLoading || !bookingFormData.date || !bookingFormData.time}
                    className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white py-5"
                  >
                    {actionLoading ? 'Saving...' : 'Save Booking'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
