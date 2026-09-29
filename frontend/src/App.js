import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { refreshSession, endSession } from './lib/session';
import Signup from './pages/Signup';
import Login from './pages/Login';
import PortalDashboard from './pages/PortalDashboard';
import PortalBooking from './pages/PortalBooking';
import PortalForms from './pages/PortalForms';
import PortalReady from './pages/PortalReady';
import AdminDashboard from './pages/AdminDashboard';
import AdminAnalytics from './pages/AdminAnalytics';
import AutomationsPage from './pages/AutomationsPage';
import PurchasesPage from './pages/admin/PurchasesPage';
import AdminLayout from './pages/admin/AdminLayout';
import SchedulingLayout from './pages/admin/SchedulingLayout';
import SchedulingBookings from './pages/admin/scheduling/Bookings';
import SchedulingNewBooking from './pages/admin/scheduling/NewBooking';
import SchedulingTeamCalendar from './pages/admin/scheduling/TeamCalendar';
import SchedulingHosts from './pages/admin/scheduling/Hosts';
import SchedulingCoordinators from './pages/admin/scheduling/Coordinators';
import SchedulingEvents from './pages/admin/scheduling/Events';
import SchedulingSettings from './pages/admin/scheduling/SettingsTab';
import AdminTeam from './pages/admin/Team';
import StaffLayout from './pages/staff/StaffLayout';
import StaffHome from './pages/staff/StaffHome';
import StaffAppPage from './pages/staff/StaffAppPage';
import LearnLauncher from './pages/staff/LearnLauncher';
import StaffSettings from './pages/staff/StaffSettings';
import SupplementsApp from './pages/staff/supplements/SupplementsApp';
import { homeForRole, isStaffHost, loginPath } from './lib/staffApps';
import StaffLogin from './pages/StaffLogin';
import ProtoLayout from './pages/prototype/ProtoLayout';
import ProtoDashboard from './pages/prototype/ProtoDashboard';
import ProtoBooking from './pages/prototype/ProtoBooking';
import ProtoForms from './pages/prototype/ProtoForms';
import ProtoReady from './pages/prototype/ProtoReady';
import ResetPassword from './pages/ResetPassword';
import OutcomePage, { OutcomeSkeleton } from './pages/OutcomePage';
import AutoLogin from './pages/AutoLogin';
import Welcome from './pages/Welcome';
import BookingThankYou from './pages/BookingThankYou';
import Checkout from './pages/checkout/Checkout';
import CheckoutComplete from './pages/checkout/CheckoutComplete';
import RefundedPage from './pages/RefundedPage';
import PatientSkeleton from './pages/PatientSkeleton';
import SupportPopup from './components/SupportPopup';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from './components/ui/sonner';
import { trackSessionStart, trackApiError } from './utils/analytics';
import { peekWelcomeData, clearWelcomeData } from './utils/welcomePrefetch';
import './App.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
    },
  },
});

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Track session start on app load
if (typeof window !== 'undefined') {
  trackSessionStart();
}

// Learn's own "Sign out" lands here (Learn is served next to the portal at /learn): end the
// whole staff session — portal tokens + Learn cookie — and show the staff login.
function StaffLogout() {
  useEffect(() => { endSession('/staff-login'); }, []);
  return null;
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('access_token');
  return token ? children : <Navigate to={loginPath()} />;
}

const STEP_PATHS = { 1: '/book', 2: '/forms', 3: '/ready', 4: '/outcome' };

// Journey-aware guard. Requires auth, sends refunded (step 0) users to /refunded, and —
// when a `step` is given — keeps each onboarding page in lockstep with the server-side
// journey (users.current_step): you can't open a step you haven't reached, and finished
// steps forward you to where you actually are. No `step` = refunded-check only (dashboard).
// The check runs per pathname change, so in-page flows (booking confirmation) aren't
// interrupted when the server advances the step mid-page.
function JourneyRoute({ children, step = null }) {
  // Straight from the welcome or /ready's finish, the step is already loaded (utils/welcomePrefetch) — no check.
  const [primed, setPrimed] = useState(() => peekWelcomeData());
  const [checking, setChecking] = useState(!primed);
  const [currentStep, setCurrentStep] = useState(primed?.progress?.current_step ?? null);
  const token = localStorage.getItem('access_token');
  const location = useLocation();

  // React reuses this component instance across route changes (same element type in the
  // same tree position), so reset synchronously on a new pathname. Without this, the
  // redirect below runs against the PREVIOUS page's step and bounces every forward journey
  // transition backwards (e.g. booking -> /forms would flash back to /book) before the
  // refetch corrects it. Adjust-state-during-render is React's supported pattern for this.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    const next = peekWelcomeData();
    setLastPath(location.pathname);
    setPrimed(next);
    setChecking(!next);
    setCurrentStep(next?.progress?.current_step ?? null);
  }

  useEffect(() => {
    if (primed) { clearWelcomeData(); return undefined; }
    let alive = true;
    (async () => {
      if (!token) return;
      setChecking(true);
      try {
        const [progressRes, meRes] = await Promise.all([
          axios.get(`${API}/user/progress`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API}/user/me`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (alive) {
          setCurrentStep(progressRes.data?.current_step ?? null);
          setRole(meRes.data?.role ?? null);
        }
      } catch {
        // Fail open (currentStep stays null): page-level handlers own API errors, and the
        // 401 interceptor owns expired sessions.
      }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, [token, location.pathname, primed]);

  if (!token) {
    return <Navigate to={loginPath()} />;
  }

  if (checking) {
    return step === 4 ? <OutcomeSkeleton /> : <PatientSkeleton />;   // /outcome has its own frame
  }

  // Team members don't have a patient journey — route them to their own workspace.
  // ?preview lets admins deliberately look at the patient portal (sidebar "View portal").
  const teamHome = homeForRole(role);
  if (teamHome && !new URLSearchParams(location.search).has('preview')) {
    return <Navigate to={teamHome} replace />;
  }

  if (currentStep === 0) {
    return <Navigate to="/refunded" replace />;
  }

  if (step != null && currentStep != null && currentStep !== step) {
    return <Navigate to={STEP_PATHS[Math.min(Math.max(currentStep, 1), 4)]} replace />;
  }

  return children;
}

// The legacy /steps flow is retired — its unguarded advance-step calls could skip journey
// steps. Old links/bookmarks land on the user's actual current step instead.
function StepsRedirect() {
  const [dest, setDest] = useState(null);
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/user/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cs = res.data?.current_step;
        setDest(cs === 0 ? '/refunded' : STEP_PATHS[Math.min(Math.max(cs ?? 1, 1), 4)]);
      } catch {
        setDest('/dashboard');
      }
    })();
  }, [token]);

  if (!token) return <Navigate to="/login" />;
  if (!dest) return <PatientSkeleton />;
  return <Navigate to={dest} replace />;
}

// The route resets the boundary, so one bad render doesn't stick to every page (components/ErrorBoundary).
function RoutedErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

// Axios interceptor component
function AxiosInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    // Flag to prevent multiple 401 handlers running simultaneously
    let isHandling401 = false;

    const expireSession = () => {
      if (isHandling401) return;
      // Check if we're already on login/signup to avoid infinite redirects
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/signup' && currentPath !== '/reset-password' && currentPath !== '/staff-login') {
        isHandling401 = true;
        sessionStorage.clear();

        // Show toast only once
        toast.error('Your session has expired. Please login again.', {
          id: 'session-expired', // Prevents duplicate toasts with same ID
          duration: 4000
        });

        // Use setTimeout to ensure state cleanup happens before redirect;
        // endSession also kills the Learn cookie and clears tokens. Resolve the login page
        // now: by the time the timer fires, a page-level 401 handler may have navigated away.
        const target = loginPath();
        setTimeout(() => {
          isHandling401 = false;
          endSession(target);
        }, 100);
      }
    };

    // Response interceptor to handle 401 errors globally: try one transparent
    // refresh (shared/single-flight with the Supplementor fetch client) and
    // retry the original request; only end the session if the refresh itself is
    // definitively rejected. Only requests that carried the portal bearer are
    // eligible — login/exchange/magic-link calls carry none and pass through.
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const cfg = error.config || {};
        if (error.response?.status === 401 && !cfg.skipAuthRefresh && !isHandling401) {
          const hdrs = cfg.headers || {};
          const hadBearer = !!(hdrs.Authorization || hdrs.authorization ||
            (typeof hdrs.get === 'function' && hdrs.get('Authorization')));
          if (hadBearer && !cfg._authRetried && localStorage.getItem('refresh_token')) {
            cfg._authRetried = true;
            let token;
            try {
              token = await refreshSession();
            } catch (refreshErr) {
              // Scope this catch to the REFRESH only. 400/401/403 = the refresh
              // token is genuinely dead → end the session. Anything else (network,
              // 5xx) must not destroy valid credentials. A failure of the RETRIED
              // request below is deliberately NOT caught here — it surfaces as its
              // own error instead of being mistaken for a dead session.
              const s = refreshErr?.response?.status;
              if (s === 400 || s === 401 || s === 403 || refreshErr?.message === 'No refresh token') {
                expireSession();
              }
              return Promise.reject(error);
            }
            cfg.headers = { ...cfg.headers, Authorization: `Bearer ${token}` };
            return axios(cfg);
          }
          if (hadBearer) expireSession();
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [navigate]);

  return null;
}

// Hide the floating support chat inside the admin area (and on the checkout, which has its own
// "Need help?" link and a fixed mobile reservation bar the bubble would cover).
function GlobalSupport() {
  const { pathname } = useLocation();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The help box is a PATIENT affordance: never on admin/staff surfaces or the
  // prototype preview ('/staff' also covers /staff-login).
  if (['/admin', '/staff', '/prototype', '/checkout'].some((p) => pathname.startsWith(p))) return null;
  // On phones it crowds the UI — only the login page and the dashboard keep it.
  if (isMobile && !['/', '/dashboard', '/login'].includes(pathname)) return null;
  return <SupportPopup />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="App">
          <AxiosInterceptor />
          <RoutedErrorBoundary>
          <Routes>
            {/* staff.<domain> is the team's front door: no patient sign-in/sign-up there, and the
                root goes straight to the workspace (the /staff guard sends guests to the staff login). */}
            <Route path="/signup" element={isStaffHost() ? <Navigate to="/staff-login" replace /> : <Signup />} />
            <Route path="/login" element={isStaffHost() ? <Navigate to="/staff-login" replace /> : <Login />} />
            <Route path="/staff-login" element={<StaffLogin />} />
            <Route path="/staff-logout" element={<StaffLogout />} />
            {/* Prototype patient portal (non-production design preview) */}
            <Route path="/prototype" element={<ProtoLayout />}>
              <Route index element={<ProtoDashboard />} />
              <Route path="booking" element={<ProtoBooking />} />
              <Route path="forms" element={<ProtoForms />} />
              <Route path="ready" element={<ProtoReady />} />
            </Route>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auto-login/:token" element={<AutoLogin />} />
            <Route path="/welcome" element={<PrivateRoute><Welcome /></PrivateRoute>} />
            <Route path="/booking-complete" element={<BookingThankYou />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/complete" element={<CheckoutComplete />} />
            <Route path="/refunded" element={<PrivateRoute><RefundedPage /></PrivateRoute>} />
            <Route path="/" element={isStaffHost() ? <Navigate to="/staff" replace /> : <JourneyRoute><PortalDashboard /></JourneyRoute>} />
            <Route path="/dashboard" element={<JourneyRoute><PortalDashboard /></JourneyRoute>} />
            {/* Onboarding pages are step-locked: each one only renders for the user's
                current step; anything else forwards to where they actually are. */}
            <Route path="/book" element={<JourneyRoute step={1}><PortalBooking /></JourneyRoute>} />
            <Route path="/forms" element={<JourneyRoute step={2}><PortalForms /></JourneyRoute>} />
            <Route path="/ready" element={<JourneyRoute step={3}><PortalReady /></JourneyRoute>} />
            <Route path="/steps" element={<StepsRedirect />} />
            <Route path="/outcome" element={<JourneyRoute step={4}><OutcomePage /></JourneyRoute>} />
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<StaffHome />} />
              <Route path="settings" element={<StaffSettings />} />
              <Route path="team" element={<AdminTeam />} />
              <Route path="learn" element={<LearnLauncher />} />
              <Route path="supplements/*" element={<SupplementsApp />} />
            </Route>
            <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="logs" element={<Navigate to="/admin/analytics" replace />} />   {/* the activity log lives on Analytics now */}
              <Route path="automations" element={<AutomationsPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="scheduling" element={<SchedulingLayout />}>
                <Route index element={<Navigate to="bookings" replace />} />
                <Route path="bookings" element={<SchedulingBookings />} />
                <Route path="new" element={<SchedulingNewBooking />} />
                <Route path="calendar" element={<SchedulingTeamCalendar />} />
                <Route path="hosts">
                  <Route index element={<SchedulingHosts />} />
                  {/* The host editor is a sheet on the Hosts page now; old editor links land on the list. */}
                  <Route path="new" element={<Navigate to="/admin/scheduling/hosts" replace />} />
                  <Route path=":directorId" element={<Navigate to="/admin/scheduling/hosts" replace />} />
                </Route>
                <Route path="directors" element={<Navigate to="/admin/scheduling/hosts" replace />} />
                <Route path="coordinators" element={<SchedulingCoordinators />} />
                <Route path="events" element={<SchedulingEvents />} />
                <Route path="settings" element={<SchedulingSettings />} />
              </Route>
            </Route>
          </Routes>
          </RoutedErrorBoundary>
          <GlobalSupport />
          <Toaster position="top-center" />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;