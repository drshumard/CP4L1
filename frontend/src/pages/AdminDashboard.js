import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginPath } from '@/lib/staffApps';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowUpDown, Ban, CalendarClock, CalendarPlus, Clock, Columns3, Copy, PenLine, MoreHorizontal, Plus,
  RefreshCw, Send, SlidersHorizontal, Trash2, UserRound,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { fmtDate, fmtDateTime, fmtTime, getAdminDisplayTz } from './admin/format';
import { confirmDialog } from './admin/confirm';
import { US_TIMEZONES, safeTz, utcToZonedWallTime, tzAbbrev } from './admin/usTimezones';
import { zonedWallTimeToUtcIso } from './admin/scheduling/useSortedTimezones';
import { RescheduleModal, cancelBooking, fetchActiveBookingForUser } from './admin/bookingActions';
import { AdminSelect, NoResults, Person, SearchBox, Status, TablePager, keepSheetOpen } from './admin/workspace-ui';
import AddUserDialog from './admin/AddUserDialog';
import s from './admin/workspace.module.css';
import {
  trackAdminPanelViewed,
  trackAdminUserViewed,
  trackAdminUserEdited,
  trackAdminWelcomeEmailSent,
  trackAdminUserDeleted,
  trackModalOpened,
  trackModalClosed
} from '../utils/analytics';

// Admin → Users. Design: shumard-checkout-portal/app/admin/users/page.tsx (tabs, table, user sheet).

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Journey step → onboarding pill + how many of the 3 steps are done (the mini progress bars).
const ONBOARDING = {
  0: { label: 'Refunded', tone: 'red', done: 0 },
  1: { label: 'Step 1 · Book session', tone: 'blue', done: 0 },
  2: { label: 'Step 2 · Health profile', tone: 'blue', done: 1 },
  3: { label: 'Step 3 · Access add-ons', tone: 'blue', done: 2 },
  4: { label: 'Complete', tone: 'green', done: 3 },
};
const onboardingOf = (step) => ONBOARDING[step] || ONBOARDING[1];
const STEP_OPTIONS = [
  { value: '0', label: 'Refunded' },
  { value: '1', label: 'Step 1 · Book your session' },
  { value: '2', label: 'Step 2 · Health profile' },
  { value: '3', label: 'Step 3 · Access add-ons' },
  { value: '4', label: 'Complete' },
];
const ROLE_TAG = { super_admin: 'Super admin', admin: 'Admin', staff: 'Staff' };
const COLUMN_LABELS = { email: 'Email address', joined: 'Date joined', status: 'Onboarding status' };
const count = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

function Progress({ step }) {
  const o = onboardingOf(step);
  return (
    <div className={s.progressCell}>
      <span className={s.miniSteps} data-complete={step === 4} aria-hidden="true">
        {[0, 1, 2].map((i) => <i key={i} data-done={i < o.done} />)}
      </span>
      <Status value={o.label} tone={o.tone} />
    </div>
  );
}

// modal={false}: "View user" opens a sheet, and a modal menu handing off to a dialog leaves the page unclickable.
function RowMenu({ user, onView, onResend, onBook }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={s.iconButton} aria-label={`Actions for ${user.name || user.email}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal size={19} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={s.menu}>
        <DropdownMenuItem onSelect={() => onView(user)}><UserRound size={16} />View user</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onBook(user)}><CalendarPlus size={16} />Book a session</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onResend(user)}><Send size={16} />Send access email</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { try { navigator.clipboard?.writeText(user.email || ''); } catch { /* noop */ } }}><Copy size={16} />Copy email</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Row spacing + visible columns: at the end of the column-header row (and beside the search on phones).
function TableTools({ density, setDensity, columns, setColumns }) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={s.iconButton} aria-label="Table settings"><SlidersHorizontal size={17} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={s.menu}>
          <DropdownMenuLabel>Row spacing</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={density} onValueChange={setDensity}>
            <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={s.iconButton} aria-label="Visible columns"><Columns3 size={17} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={s.menu}>
          <DropdownMenuLabel>Show in table</DropdownMenuLabel>
          {Object.keys(COLUMN_LABELS).map((key) => (
            <DropdownMenuCheckboxItem key={key} checked={columns[key]} onCheckedChange={(v) => setColumns({ ...columns, [key]: !!v })} onSelect={(e) => e.preventDefault()}>
              {COLUMN_LABELS[key]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onboarding, setOnboarding] = useState('all');
  const [counts, setCounts] = useState(null);
  const [sort, setSort] = useState({ key: 'joined', ascending: false });
  const [density, setDensity] = useState('comfortable');
  const [columns, setColumns] = useState({ email: true, joined: true, status: true });
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchData();
  }, [currentPage, debouncedSearch, onboarding]);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: PAGE_SIZE.toString(),
        onboarding,
      });
      if (debouncedSearch) params.append('search', debouncedSearch);

      const usersRes = await axios.get(`${API}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUsers(usersRes.data.users);
      setTotalPages(usersRes.data.total_pages || 1);
      setTotalUsers(usersRes.data.total || 0);
      setCounts(usersRes.data.counts || null);

      trackAdminPanelViewed(localStorage.getItem('user_id'));
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Admin access required', { id: 'admin-access-required' });
        navigate('/');
      } else if (error.response?.status === 401) {
        localStorage.clear();
        navigate(loginPath());
      } else {
        toast.error('Failed to load admin data', { id: 'admin-load-error' });
      }
    } finally {
      setLoading(false);
      setLoaded(true);
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
    if (!(await confirmDialog({ title: 'Remove legacy booking?', message: 'Clears the old (pre-portal) booking record this patient still sees on their dashboard — both the profile stamp and any webhook-era appointment row. Real scheduled bookings are not touched.', confirmLabel: 'Remove' }))) return;

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

  // The server pages newest-first; sorting re-orders the current page.
  const rows = useMemo(() => [...users].sort((a, b) => {
    const pick = (u) => (sort.key === 'name' ? u.name || '' : u.created_at || '');
    return pick(a).localeCompare(pick(b)) * (sort.ascending ? 1 : -1);
  }), [users, sort]);
  const changeSort = (key) => setSort((cur) => ({ key, ascending: key === cur.key ? !cur.ascending : true }));
  const ariaSort = (key) => (sort.key === key ? (sort.ascending ? 'ascending' : 'descending') : 'none');
  const changeTab = (v) => { setOnboarding(v); setCurrentPage(1); };
  const reset = () => { setSearchTerm(''); changeTab('all'); };
  // A new user is the newest, so they head the unfiltered first page — refetch it, or clear the filters to get there.
  const showNewUser = () => { if (onboarding === 'all' && currentPage === 1 && !searchTerm && !debouncedSearch) fetchData(); else reset(); };
  const closeUser = () => { setShowUserModal(false); setPendingStep(null); setShowEditModal(false); setShowBookingModal(false); };
  const viewUser = (e, u) => { e?.stopPropagation?.(); openUserDetails(u); };
  const resend = (u) => handleResendWelcomeEmail(u.id);
  // Scheduling → New booking, with this patient filled in.
  const bookFor = (u) => {
    const [first = '', ...rest] = (u.name || '').trim().split(/\s+/);
    navigate(`/admin/scheduling/new?${new URLSearchParams({ email: u.email || '', first: u.first_name || first, last: u.last_name || rest.join(' '), phone: u.phone || '' })}`);
  };

  const u = selectedUser;
  const userTz = u?.signup_location?.timezone || u?.location_info?.timezone;
  const field = (key, label, props = {}) => (
    <div className={`${s.field} ${props.wide ? s.wideField : ''}`}>
      <label htmlFor={`edit-${key}`}>{label}</label>
      <input id={`edit-${key}`} type={props.type || 'text'} value={editFormData[key] || ''} onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className={s.usersLyra}>
      <div className={s.heading}>
        <div>
          <h1>Users</h1>
          <p>A clear view of everyone’s onboarding journey.</p>
        </div>
        <div className={s.headingActions}>
          <button type="button" className={s.primaryButton} onClick={() => setAddOpen(true)}><Plus size={17} />Add user</button>
        </div>
      </div>
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onCreated={showNewUser} />

      <Tabs value={onboarding} onValueChange={changeTab} className={`${s.surface} ${s.analyticsSurface}`}>
        <div className={`${s.analyticsToolbar} ${s.usersToolbar}`}>
          <div>
            <span className={s.analyticsKicker}>PATIENT DIRECTORY</span>
            <h2>People<span className={s.peopleCount}>{count(totalUsers)} {totalUsers === 1 ? 'user' : 'users'}</span></h2>
          </div>
          <div className={s.usersSearchRow}>
            <div className={s.usersSearch}>
              <SearchBox value={searchTerm} onChange={setSearchTerm} label="Search name, email or phone" placeholder="Name, email or phone" />
            </div>
            <div className={s.mobileTools}><TableTools density={density} setDensity={setDensity} columns={columns} setColumns={setColumns} /></div>
          </div>
          <TabsList className={s.lyraTabs} aria-label="Onboarding status">
            <TabsTrigger value="all">All users <span className={s.tabCount}>{count(counts?.all)}</span></TabsTrigger>
            <TabsTrigger value="in_progress">In progress <span className={s.tabCount}>{count(counts?.in_progress)}</span></TabsTrigger>
            <TabsTrigger value="complete">Complete <span className={s.tabCount}>{count(counts?.complete)}</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={onboarding} className="mt-0" aria-busy={loading}>
          {!loaded ? (
            <p className={s.loadingRow} role="status">Loading users…</p>
          ) : rows.length ? (
            <div className={s.tableArea} data-busy={loading}>
              <div className={s.desktopTable}>
                <Table className={`${s.table} ${s.usersTableLyra}`} data-density={density}>
                  <TableHeader>
                    <TableRow>
                      <TableHead aria-sort={ariaSort('name')}><button type="button" onClick={() => changeSort('name')}>User <ArrowUpDown size={12} /></button></TableHead>
                      {columns.joined && <TableHead aria-sort={ariaSort('joined')}><button type="button" onClick={() => changeSort('joined')}>Joined <ArrowUpDown size={12} /></button></TableHead>}
                      {columns.status && <TableHead>Onboarding</TableHead>}
                      <TableHead className={s.headTools}><span className="sr-only">Actions</span><div><TableTools density={density} setDensity={setDensity} columns={columns} setColumns={setColumns} /></div></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id} className={s.clickableRow} onClick={() => openUserDetails(row)}>
                        <TableCell><Person name={row.name} email={columns.email ? row.email : undefined} tag={ROLE_TAG[row.role]} onClick={(e) => viewUser(e, row)} /></TableCell>
                        {columns.joined && <TableCell><span className={s.monoDate}>{fmtDate(row.created_at)}</span><span className={s.monoTime}>{fmtTime(row.created_at)}</span></TableCell>}
                        {columns.status && <TableCell><Progress step={row.current_step} /></TableCell>}
                        <TableCell onClick={(e) => e.stopPropagation()}><RowMenu user={row} onView={openUserDetails} onResend={resend} onBook={bookFor} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className={s.mobileList}>
                {rows.map((row) => (
                  <article className={s.analyticsMobileRow} key={row.id}>
                    <div className={s.mobileRowTop}>
                      <Person name={row.name} email={columns.email ? row.email : undefined} tag={ROLE_TAG[row.role]} onClick={(e) => viewUser(e, row)} />
                      <RowMenu user={row} onView={openUserDetails} onResend={resend} onBook={bookFor} />
                    </div>
                    <div className={s.mobileMeta}>
                      {columns.status && <Progress step={row.current_step} />}
                      {columns.joined && <span className={s.monoDate}>{fmtDate(row.created_at)}</span>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <NoResults reset={reset} />
          )}
          <TablePager page={currentPage} count={totalUsers} pageSize={PAGE_SIZE} onChange={setCurrentPage} />
        </TabsContent>
      </Tabs>

      {/* User overview */}
      <Sheet open={showUserModal} onOpenChange={(o) => { if (!o) closeUser(); }}>
        <SheetContent className={s.detailSheet} onInteractOutside={keepSheetOpen} onEscapeKeyDown={keepSheetOpen}>
          <SheetHeader>
            <SheetTitle>User overview</SheetTitle>
            <SheetDescription className={s.sheetDescription}>Onboarding details and session access.</SheetDescription>
          </SheetHeader>
          {u && (
            <>
              <div className={s.sheetPerson}>
                <Person name={u.name} email={u.email} tag={ROLE_TAG[u.role]} />
                {!showEditModal && <button type="button" className={s.smallButton} onClick={openEditModal} disabled={actionLoading}><PenLine size={14} />Edit</button>}
              </div>

              {showEditModal ? (
                <section className={s.sheetSection} aria-label="Edit profile">
                  <div className={s.fields}>
                    {field('first_name', 'First name')}
                    {field('last_name', 'Last name')}
                    {field('name', 'Display name', { wide: true })}
                    {field('email', 'Email', { wide: true, type: 'email' })}
                    {field('phone', 'Phone', { wide: true, type: 'tel' })}
                  </div>
                  <div className={s.sheetFormActions}>
                    <button type="button" className={s.primaryButton} onClick={handleEditUser} disabled={actionLoading}>{actionLoading ? 'Saving…' : 'Save profile'}</button>
                    <button type="button" className={s.secondaryButton} onClick={() => setShowEditModal(false)} disabled={actionLoading}>Cancel</button>
                  </div>
                </section>
              ) : (
                <dl className={s.detailList}>
                  <div><dt>Joined</dt><dd>{u.created_at ? `${fmtDate(u.created_at)} at ${fmtTime(u.created_at)}` : '—'}</dd></div>
                  <div><dt>Phone</dt><dd>{u.phone || '—'}</dd></div>
                  <div><dt>Onboarding status</dt><dd><Status value={onboardingOf(u.current_step).label} tone={onboardingOf(u.current_step).tone} /></dd></div>
                  <div>
                    <dt>Role</dt>
                    <dd className={s.inlineRow}>
                      {u.role === 'admin' ? 'Administrator' : ROLE_TAG[u.role] || 'User'}
                      {!['admin', 'super_admin'].includes(u.role) && (
                        <button type="button" className={s.smallButton} onClick={() => handlePromoteUser(u.role === 'staff' ? 'user' : 'staff')} disabled={actionLoading}>
                          {u.role === 'staff' ? 'Demote' : 'Make staff'}
                        </button>
                      )}
                    </dd>
                  </div>
                </dl>
              )}

              <section className={s.sheetSection} aria-labelledby="journey-step">
                <div className={s.sheetSectionHead}><h3 id="journey-step">Journey step</h3></div>
                <div className={s.stepRow}>
                  <AdminSelect
                    label="Move to step"
                    value={String(pendingStep !== null ? pendingStep : (u.current_step ?? 1))}
                    onChange={(v) => handleStepChange(parseInt(v, 10))}
                    options={STEP_OPTIONS}
                    disabled={actionLoading}
                  />
                  <button type="button" className={s.secondaryButton} onClick={handleSaveStepChange} disabled={pendingStep === null || pendingStep === u.current_step || actionLoading}>Save</button>
                </div>
              </section>

              <section className={s.sheetSection} aria-labelledby="consultation-booking">
                <div className={s.sheetSectionHead}>
                  <h3 id="consultation-booking">Consultation booking</h3>
                  <div>
                    {sessionBooking && (
                      <>
                        <button type="button" className={s.smallButton} onClick={() => setRescheduleSession(sessionBooking)}><CalendarClock size={14} />Reschedule</button>
                        <button type="button" className={s.smallButton} data-danger="" onClick={async () => { const ok = await cancelBooking(sessionBooking); if (ok) { setSessionBooking(null); setSelectedUser((cur) => (cur ? { ...cur, booking_info: null } : cur)); fetchData(); } }}><Ban size={14} />Cancel</button>
                      </>
                    )}
                    {/* Legacy stamp editor (writes users.booking_info only). Hidden whenever a real
                        ledger booking exists — its Save/Remove don't touch the actual booking, so
                        offering it next to the real Reschedule/Cancel reads as a broken remove. */}
                    {!showBookingModal && !sessionBooking && (
                      <button type="button" className={s.smallButton} onClick={openBookingModal}>{u.booking_info ? 'Edit booking' : 'Set booking'}</button>
                    )}
                  </div>
                </div>

                {showBookingModal ? (
                  <div className={s.bookingEditor}>
                    <p className={s.sheetNotice}><Clock size={14} /><span><strong>User timezone</strong>{userTz || 'Unknown — please verify with the patient'}</span></p>
                    <div className={s.fields}>
                      <div className={s.field}>
                        <label htmlFor="booking-date">Date</label>
                        <input id="booking-date" type="date" value={bookingFormData.date} onChange={(e) => setBookingFormData({ ...bookingFormData, date: e.target.value })} />
                      </div>
                      <div className={s.field}>
                        <label htmlFor="booking-time">Time</label>
                        <input id="booking-time" type="time" value={bookingFormData.time} onChange={(e) => setBookingFormData({ ...bookingFormData, time: e.target.value })} />
                      </div>
                      <div className={`${s.field} ${s.wideField}`}>
                        <label htmlFor="booking-timezone">Timezone</label>
                        <AdminSelect
                          id="booking-timezone"
                          label="Timezone"
                          value={bookingFormData.timezone}
                          onChange={(v) => setBookingFormData({ ...bookingFormData, timezone: v })}
                          options={[
                            ...US_TIMEZONES.map((o) => ({ value: o.value, label: o.label })),
                            ...(bookingFormData.timezone && !US_TIMEZONES.some((o) => o.value === bookingFormData.timezone) ? [{ value: bookingFormData.timezone, label: bookingFormData.timezone }] : []),
                          ]}
                        />
                        <p>Date &amp; time are in the selected timezone.</p>
                      </div>
                      <div className={`${s.field} ${s.wideField}`}>
                        <label htmlFor="booking-notes">Notes <span>· optional</span></label>
                        <textarea id="booking-notes" rows={2} value={bookingFormData.notes} onChange={(e) => setBookingFormData({ ...bookingFormData, notes: e.target.value })} placeholder="e.g., Rescheduled via phone call" />
                      </div>
                    </div>
                    <div className={s.sheetFormActions}>
                      <button type="button" className={s.primaryButton} onClick={handleUpdateBooking} disabled={actionLoading || !bookingFormData.date || !bookingFormData.time}>{actionLoading ? 'Saving…' : 'Save booking'}</button>
                      {/* Always offered here (the editor only opens when there's no ledger booking):
                          a stale pre-portal appointment row can exist with NO visible stamp, and
                          Remove is the only way to clear what the patient still sees. */}
                      {!sessionBooking && (
                        <button type="button" className={s.smallButton} data-danger="" onClick={handleDeleteBooking} disabled={actionLoading}>Remove legacy booking</button>
                      )}
                      <button type="button" className={s.secondaryButton} onClick={() => setShowBookingModal(false)} disabled={actionLoading}>Cancel</button>
                    </div>
                  </div>
                ) : sessionBooking ? (
                  <div className={s.bookingCard}>
                    {/* Render in the PATIENT's zone (the label below names it) — not the admin display tz. */}
                    <strong>{fmtDateTime(sessionBooking.slot_start_utc, { tz: safeTz(sessionBooking.patient_timezone, getAdminDisplayTz()) })}</strong>
                    <span>{sessionBooking.director_name || sessionBooking.director_id || 'Director'}{sessionBooking.patient_timezone ? ` · ${sessionBooking.patient_timezone}` : ''}</span>
                  </div>
                ) : u.booking_info ? (
                  <div className={s.bookingCard}>
                    <strong>{(() => {
                      const bi = u.booking_info;
                      const btz = safeTz(bi.timezone || bi.booking_timezone);
                      const v = bi.session_start || bi.booking_datetime;
                      return `${fmtDateTime(v, { tz: btz })} ${tzAbbrev(v, btz)}`;
                    })()}</strong>
                    <span>{u.booking_info.timezone || u.booking_info.booking_timezone || 'Timezone not set'}{u.booking_info.source ? ` · ${u.booking_info.source === 'online_booking' ? 'Online booking' : 'Manual entry'}` : ''}</span>
                    {u.booking_info.update_notes && <em>{u.booking_info.update_notes}</em>}
                  </div>
                ) : (
                  <p className={s.detailNote}>No booking set · user timezone {userTz || 'unknown'}</p>
                )}
              </section>

              <div className={s.sheetActions}>
                <button type="button" className={s.secondaryButton} onClick={() => handleResendWelcomeEmail(u.id)} disabled={actionLoading}><Send size={15} />Resend welcome</button>
                <button type="button" className={s.secondaryButton} onClick={() => handleResetProgress(u.id)} disabled={actionLoading}><RefreshCw size={15} />Reset progress</button>
                <button type="button" className={s.secondaryButton} data-danger="" onClick={() => handleDeleteUser(u.id, u.name, u.email)} disabled={actionLoading}><Trash2 size={15} />Delete user</button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
