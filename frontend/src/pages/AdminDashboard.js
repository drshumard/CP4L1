import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '../components/ui/drawer';
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
import { fmtDateTime } from './admin/format';
import { confirmDialog } from './admin/confirm';
import { US_TIMEZONES, safeTz, utcToZonedWallTime, tzAbbrev } from './admin/usTimezones';
import { zonedWallTimeToUtcIso } from './admin/scheduling/useSortedTimezones';
import {
  Home, Users, BarChart3, RefreshCw, Trash2, Activity,
  Search, Phone, Calendar,
  Send, Edit2, Clock, Settings, CalendarClock, Ban
} from 'lucide-react';
import { RescheduleModal, cancelBooking, fetchActiveBookingForUser } from './admin/bookingActions';
import UsersDataTable from './admin/UsersDataTable';
import {
  trackAdminPanelViewed,
  trackAdminUserViewed,
  trackAdminUserEdited,
  trackAdminWelcomeEmailSent,
  trackAdminUserDeleted,
  trackModalOpened,
  trackModalClosed
} from '../utils/analytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Color-coded journey-step badge styles (Refunded / Step 1 / 2 / 3 / Complete).
const STEP_BADGE = {
  0: 'bg-rose-50 text-rose-700 border-rose-200',
  1: 'bg-slate-100 text-slate-700 border-slate-200',
  2: 'bg-amber-50 text-amber-700 border-amber-200',
  3: 'bg-sky-50 text-sky-700 border-sky-200',
  4: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const stepBadgeClass = (step) => STEP_BADGE[step] || STEP_BADGE[1];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [sessionBooking, setSessionBooking] = useState(null);
  const [rescheduleSession, setRescheduleSession] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [pendingStep, setPendingStep] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingFormData, setBookingFormData] = useState({
    date: '',
    time: '',
    timezone: '',
    notes: ''
  });
  const [settings, setSettings] = useState({ availability_days: 14 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchData();
    fetchSettings();
  }, [currentPage, debouncedSearch]);

  // Load the user's confirmed ledger session so the modal can reschedule/cancel it.
  useEffect(() => {
    let cancelled = false;
    if (showUserModal && (selectedUser?.id || selectedUser?.email)) {
      fetchActiveBookingForUser(selectedUser).then((b) => { if (!cancelled) setSessionBooking(b); });
    } else {
      setSessionBooking(null);
    }
    return () => { cancelled = true; };
  }, [showUserModal, selectedUser?.id, selectedUser?.email]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.get(`${API}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(res.data);
    } catch (e) {
      // Non-blocking — use defaults
    }
  };

  const saveSettings = async (updates) => {
    setSettingsLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await axios.put(`${API}/admin/settings`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(res.data);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: PAGE_SIZE.toString(),
      });
      if (debouncedSearch) params.append('search', debouncedSearch);
      
      const usersRes = await axios.get(`${API}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUsers(usersRes.data.users);
      setTotalPages(usersRes.data.total_pages || 1);
      setTotalUsers(usersRes.data.total || 0);
      
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
    if (!(await confirmDialog({ title: 'Reset progress?', message: "This resets the user's progress back to Step 1.", confirmLabel: 'Reset' }))) {
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
    if (!(await confirmDialog({ title: 'Delete user?', message: `Permanently delete "${userName}" (${userEmail}). This can't be undone.`, confirmLabel: 'Delete' }))) {
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

  const openBookingModal = () => {
    // Pre-fill from the existing booking, decomposed in ITS OWN timezone — never the
    // browser's. Falls back: booking tz → user signup tz → Pacific.
    const existingBooking = selectedUser?.booking_info;
    const userTimezone = selectedUser?.signup_location?.timezone ||
                         selectedUser?.location_info?.timezone || '';
    const tz = safeTz(existingBooking?.timezone || existingBooking?.booking_timezone || userTimezone);
    // Handle both session_start (from online booking) and booking_datetime (from manual entry)
    const bookingDateStr = existingBooking?.session_start || existingBooking?.booking_datetime;

    if (existingBooking && bookingDateStr) {
      const wall = utcToZonedWallTime(bookingDateStr, tz);
      setBookingFormData({
        date: wall.date,
        time: wall.time,
        timezone: tz,
        notes: existingBooking.update_notes || ''
      });
    } else {
      setBookingFormData({
        date: '',
        time: '',
        timezone: tz,
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
      // Wall time entered in the SELECTED timezone → a real UTC instant (same format the
      // online booking flow stores), so every display converts unambiguously.
      const bookingDatetime = zonedWallTimeToUtcIso(
        bookingFormData.date, bookingFormData.time, safeTz(bookingFormData.timezone),
      );

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
    if (!(await confirmDialog({ title: 'Remove booking?', message: 'This removes the booking from this user.', confirmLabel: 'Remove' }))) return;

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
    
    if (!(await confirmDialog({ title: newRole === 'staff' ? 'Promote to staff?' : 'Demote to user?', message: confirmMessage, danger: false, confirmLabel: newRole === 'staff' ? 'Promote' : 'Demote' }))) return;
    
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

  // Users are already sorted and filtered by the server
  const filteredUsers = users;

  const getStepLabel = (step) => {
    const labels = {
      0: 'Refunded',
      1: 'Step 1',
      2: 'Step 2',
      3: 'Step 3',
      4: 'Complete'
    };
    return labels[step] || `Step ${step}`;
  };

  // Cadence: journey-step tags are monochrome (slate); the one meaningful alert state
  // (Refunded) borrows the conflict token. Complete reads as a filled "done" badge.
  // Format date as "Jan 15, 2025, 2:30 PM"
  const formatDate = (dateString) => fmtDateTime(dateString);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F3F2' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header replaced by the unified AdminLayout shell (sidebar + topbar). Kept hidden
          so its handlers stay referenced; the overlapping centered-title bug is gone. */}
      <div className="hidden" data-testid="admin-header">
        <div className="max-w-7xl 2xl:max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                <Button 
                  variant={showSettings ? "default" : "outline"}
                  onClick={() => setShowSettings(!showSettings)} 
                  className="flex items-center gap-2"
                  size="sm"
                  data-testid="settings-toggle-mobile"
                >
                  <Settings size={16} />
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2" size="sm">
                  <Home size={16} />
                </Button>
              </div>
            </div>
            <h1 className="text-xl font-bold text-slate-800 text-center w-full md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2">User Management</h1>
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
              <Button 
                variant={showSettings ? "default" : "outline"}
                onClick={() => setShowSettings(!showSettings)} 
                className="flex items-center gap-2"
                data-testid="settings-toggle"
              >
                <Settings size={16} />
                <span>Settings</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/')} className="flex items-center gap-2">
                <Home size={16} />
                <span>Home</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-8 max-w-7xl 2xl:max-w-[1680px] mx-auto">
        {/* Settings Panel */}
        {showSettings && (
          <Card className="bg-white border border-slate-200 shadow-sm mb-6" data-testid="settings-panel">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="text-slate-600" size={20} />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700 whitespace-nowrap">
                    Booking Calendar — Days of Availability
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={settings.availability_days}
                    onChange={(e) => setSettings(prev => ({ ...prev, availability_days: parseInt(e.target.value) || 14 }))}
                    className="w-20 px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                    data-testid="availability-days-input"
                  />
                  <span className="text-sm text-slate-500">days</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => saveSettings({ availability_days: settings.availability_days })}
                  disabled={settingsLoading}
                  data-testid="save-settings-btn"
                >
                  {settingsLoading ? 'Saving...' : 'Save'}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Shows the next {settings.availability_days} dates that have available booking slots (skips weekends and days with no availability).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Users data-table (shadcn) — server-side search + pagination preserved */}
        <UsersDataTable
          users={filteredUsers}
          totalUsers={totalUsers}
          search={searchTerm}
          onSearchChange={setSearchTerm}
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onView={openUserDetails}
          onResend={(u) => handleResendWelcomeEmail(u.id)}
          formatDate={formatDate}
          getStepLabel={getStepLabel}
          stepBadgeClass={stepBadgeClass}
          settingsActive={showSettings}
          onToggleSettings={() => setShowSettings((s) => !s)}
        />
      </div>

      {/* User Details Drawer (bento) */}
      <Drawer open={showUserModal} onOpenChange={(o) => { if (!o) { setShowUserModal(false); setPendingStep(null); setShowEditModal(false); setShowBookingModal(false); } }}>
        <DrawerContent>
          {selectedUser && (
            <div className="mx-auto flex w-full max-w-5xl 2xl:max-w-6xl flex-col">
              <DrawerHeader className="text-left">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-12 flex-none items-center justify-center rounded-full bg-foreground text-lg font-semibold text-background">
                    {selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <DrawerTitle className="truncate">{selectedUser.name}</DrawerTitle>
                    <DrawerDescription className="truncate">{selectedUser.email}</DrawerDescription>
                  </div>
                </div>
              </DrawerHeader>

              <div className="max-h-[64vh] overflow-y-auto px-4 pb-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Profile */}
                  <div className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</span>
                      {!showEditModal && (
                        <Button variant="ghost" size="sm" onClick={openEditModal} disabled={actionLoading}><Edit2 className="size-4" /> Edit</Button>
                      )}
                    </div>
                    {showEditModal ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">First name</label>
                            <Input value={editFormData.first_name || ''} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Last name</label>
                            <Input value={editFormData.last_name || ''} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Display name</label>
                          <Input value={editFormData.name || ''} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Email</label>
                          <Input type="email" value={editFormData.email || ''} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Phone</label>
                          <Input type="tel" value={editFormData.phone || ''} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button onClick={handleEditUser} disabled={actionLoading} className="flex-1">{actionLoading ? 'Saving...' : 'Save profile'}</Button>
                          <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={actionLoading}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <dl className="divide-y">
                        <div className="flex items-center justify-between py-2.5"><dt className="text-sm text-muted-foreground">Phone</dt><dd className="text-sm font-medium text-foreground">{selectedUser.phone || '—'}</dd></div>
                        <div className="flex items-center justify-between py-2.5"><dt className="text-sm text-muted-foreground">Email</dt><dd className="max-w-[60%] truncate text-sm font-medium text-foreground">{selectedUser.email || '—'}</dd></div>
                        <div className="flex items-center justify-between py-2.5"><dt className="text-sm text-muted-foreground">Joined</dt><dd className="text-sm font-medium text-foreground">{formatDate(selectedUser.created_at)}</dd></div>
                      </dl>
                    )}
                  </div>

                  {/* Account */}
                  <div className="rounded-xl border bg-card p-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</span>
                    <dl className="mt-2 divide-y">
                      <div className="flex items-center justify-between py-2.5"><dt className="text-sm text-muted-foreground">Journey step</dt><dd><Badge variant="outline" className={stepBadgeClass(selectedUser.current_step)}>{getStepLabel(selectedUser.current_step)}</Badge></dd></div>
                      <div className="flex items-center justify-between py-2.5">
                        <dt className="text-sm text-muted-foreground">Role</dt>
                        <dd className="flex items-center gap-2">
                          {selectedUser.role === 'admin' ? (
                            <Badge>Administrator</Badge>
                          ) : (
                            <>
                              <Badge variant="secondary">{selectedUser.role === 'staff' ? 'Staff' : 'User'}</Badge>
                              <Button variant="outline" size="sm" onClick={() => handlePromoteUser(selectedUser.role === 'staff' ? 'user' : 'staff')} disabled={actionLoading}>{selectedUser.role === 'staff' ? 'Demote' : 'Make staff'}</Button>
                            </>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 border-t pt-3">
                      <label className="text-sm text-muted-foreground">Move to step</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Select value={String(pendingStep !== null ? pendingStep : (selectedUser?.current_step ?? 1))} onValueChange={(v) => handleStepChange(parseInt(v, 10))} disabled={actionLoading}>
                          <SelectTrigger className="flex-1" aria-label="Move to step"><SelectValue placeholder="Select step" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Refunded</SelectItem>
                            <SelectItem value="1">Step 1 — Welcome &amp; booking</SelectItem>
                            <SelectItem value="2">Step 2 — Health profile</SelectItem>
                            <SelectItem value="3">Step 3 — Final preparations</SelectItem>
                            <SelectItem value="4">Complete</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={handleSaveStepChange} disabled={pendingStep === null || pendingStep === selectedUser?.current_step || actionLoading}>Save</Button>
                      </div>
                    </div>
                  </div>

                  {/* Booking */}
                  <div className="rounded-xl border bg-card p-4 lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking</span>
                      <div className="flex items-center gap-2">
                        {sessionBooking && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setRescheduleSession(sessionBooking)}><CalendarClock className="size-3.5" /> Reschedule</Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={async () => { const ok = await cancelBooking(sessionBooking); if (ok) { setSessionBooking(null); setSelectedUser((u) => (u ? { ...u, booking_info: null } : u)); fetchData(); } }}><Ban className="size-3.5" /> Cancel</Button>
                          </>
                        )}
                        {!showBookingModal && (
                          <Button variant="outline" size="sm" onClick={openBookingModal}>{selectedUser.booking_info ? 'Edit booking' : 'Set booking'}</Button>
                        )}
                      </div>
                    </div>

                    {showBookingModal ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                          <span className="flex items-center gap-1.5 font-medium"><Clock className="size-3.5" /> User timezone</span>
                          <span className="mt-0.5 block">{selectedUser.signup_location?.timezone || selectedUser.location_info?.timezone || 'Unknown — please verify with the patient'}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Date</label>
                            <Input type="date" value={bookingFormData.date} onChange={(e) => setBookingFormData({ ...bookingFormData, date: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Time</label>
                            <Input type="time" value={bookingFormData.time} onChange={(e) => setBookingFormData({ ...bookingFormData, time: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Timezone</label>
                            <Select value={bookingFormData.timezone} onValueChange={(v) => setBookingFormData({ ...bookingFormData, timezone: v })}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="Timezone" /></SelectTrigger>
                              <SelectContent>
                                {US_TIMEZONES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                {bookingFormData.timezone && !US_TIMEZONES.some((o) => o.value === bookingFormData.timezone) && (
                                  <SelectItem value={bookingFormData.timezone}>{bookingFormData.timezone}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Date &amp; time are in the selected timezone.</p>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Notes (optional)</label>
                          <Textarea rows={2} value={bookingFormData.notes} onChange={(e) => setBookingFormData({ ...bookingFormData, notes: e.target.value })} placeholder="e.g., Rescheduled via phone call" />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button onClick={handleUpdateBooking} disabled={actionLoading || !bookingFormData.date || !bookingFormData.time} className="flex-1">{actionLoading ? 'Saving...' : 'Save booking'}</Button>
                          {selectedUser.booking_info && (
                            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDeleteBooking} disabled={actionLoading}>Remove</Button>
                          )}
                          <Button variant="outline" onClick={() => setShowBookingModal(false)} disabled={actionLoading}>Cancel</Button>
                        </div>
                      </div>
                    ) : sessionBooking ? (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="font-medium text-foreground">{fmtDateTime(sessionBooking.slot_start_utc)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{sessionBooking.director_name || sessionBooking.director_id || 'Director'}{sessionBooking.patient_timezone ? ` · ${sessionBooking.patient_timezone}` : ''}</div>
                      </div>
                    ) : selectedUser.booking_info ? (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <div className="font-medium text-foreground">{(() => {
                          const bi = selectedUser.booking_info;
                          const btz = safeTz(bi.timezone || bi.booking_timezone);
                          const v = bi.session_start || bi.booking_datetime;
                          return `${fmtDateTime(v, { tz: btz })} ${tzAbbrev(v, btz)}`;
                        })()}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{selectedUser.booking_info.timezone || selectedUser.booking_info.booking_timezone || 'Timezone not set'}{selectedUser.booking_info.source ? ` · ${selectedUser.booking_info.source === 'online_booking' ? 'Online booking' : 'Manual entry'}` : ''}</div>
                        {selectedUser.booking_info.update_notes && <div className="mt-1 text-xs italic text-muted-foreground">{selectedUser.booking_info.update_notes}</div>}
                      </div>
                    ) : (
                      <div className="rounded-lg border p-3 text-sm text-muted-foreground">No booking set · user timezone {selectedUser.signup_location?.timezone || selectedUser.location_info?.timezone || 'unknown'}</div>
                    )}
                  </div>
                </div>
              </div>

              <DrawerFooter className="flex-row flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleResendWelcomeEmail(selectedUser.id)} disabled={actionLoading}><Send className="size-4" /> Resend welcome</Button>
                <Button variant="outline" onClick={() => handleResetProgress(selectedUser.id)} disabled={actionLoading}><RefreshCw className="size-4" /> Reset progress</Button>
                <Button variant="outline" className="ml-auto text-destructive hover:text-destructive" onClick={() => handleDeleteUser(selectedUser.id, selectedUser.name, selectedUser.email)} disabled={actionLoading}><Trash2 className="size-4" /> Delete user</Button>
              </DrawerFooter>
            </div>
          )}
        </DrawerContent>
      </Drawer>


      {rescheduleSession && (
        <RescheduleModal
          booking={rescheduleSession}
          onClose={() => setRescheduleSession(null)}
          onDone={() => { fetchActiveBookingForUser(selectedUser).then(setSessionBooking); fetchData(); }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
