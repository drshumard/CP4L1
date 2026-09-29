import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { homeForRole } from '@/lib/staffApps';
import { canAccessPortalPath, portalHomeForCapabilities } from '@/lib/portalAccess';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import ErrorBoundary from '../../components/ErrorBoundary';
import { ConfirmRoot } from './confirm';
import AppSidebar from './AppSidebar';
import { adminApi } from './api';
import { getAdminDisplayTz, setAdminDisplayTz } from './format';
import { US_TIMEZONES, safeTz, tzAbbrev } from './usTimezones';
import './admin.css';
import s from './workspace.module.css';

// Admin shell — design: shumard-checkout-portal/app/admin/admin-shell.tsx.
function pageTitle(pathname) {
  if (pathname.startsWith('/admin/scheduling')) return 'Scheduling';
  if (pathname.startsWith('/admin/analytics')) return 'Analytics';
  if (pathname.startsWith('/admin/automations')) return 'Automations';
  if (pathname.startsWith('/admin/purchases')) return 'Purchases';
  return 'Users';
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  // Admin-wide display timezone: Pacific until the profile loads, then the team member's
  // saved zone. It also feeds format.js's module default, so the page subtree is re-keyed
  // on change — components that call fmt* without a tz re-render with the new zone.
  const [displayTz, setDisplayTzState] = useState(getAdminDisplayTz());
  // Staff (and patients) never see the admin shell — the API would 403 them anyway,
  // but bouncing to their own home avoids a shell full of failed requests.
  const [role, setRole] = useState(undefined); // undefined = still checking, null = load failed
  const [caps, setCaps] = useState([]);
  useEffect(() => {
    // One /user/me load feeds the access guard AND the display timezone.
    const load = () => {
      setRole(undefined);
      adminApi.get('/user/me').then((r) => {
        setRole(r.data?.role || 'user');
        setCaps(r.data?.capabilities || []);
        const t = safeTz(r.data?.timezone);
        setAdminDisplayTz(t);
        setDisplayTzState(t);
      }).catch(() => setRole(null));
    };
    load();
    window.addEventListener('admin-role-retry', load);
    return () => window.removeEventListener('admin-role-retry', load);
  }, []);
  // Hold the shell until the check resolves — mounting it early fires a page of
  // child requests that all fail for unauthorized visitors.
  if (role === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }
  // Load failure (network/5xx) is not "unauthorized" — offer a retry instead of bouncing.
  if (role === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Couldn't reach the server.</p>
        <button type="button" onClick={() => window.dispatchEvent(new Event('admin-role-retry'))}
          className="rounded-md border px-3 py-1.5 hover:bg-muted">
          Try again
        </button>
      </div>
    );
  }
  // Portal access comes from the RBAC matrix: the 'portal' capability.
  if (!caps.includes('portal')) {
    return <Navigate to={homeForRole(role) || '/'} replace />;
  }
  const landing = portalHomeForCapabilities(caps);
  if (!landing) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p>No Portal sections have been assigned to your account. Ask your administrator to update your access.</p>
      <Link className="underline" to="/staff">Return to staff workspace</Link>
    </div>;
  }
  if (!canAccessPortalPath(pathname, caps)) return <Navigate to={landing} replace />;

  const changeTz = async (v) => {
    const prev = displayTz;
    setAdminDisplayTz(v);
    setDisplayTzState(v);
    try {
      await adminApi.put('/user/me', { timezone: v });
    } catch {
      setAdminDisplayTz(prev);
      setDisplayTzState(prev);
      toast.error('Could not save your timezone');
    }
  };

  return (
    <SidebarProvider className={`admin-geist ${s.shell}`} style={{ '--sidebar-width': '232px' }}>
      <a href="#admin-main" className={s.skipLink}>Skip to content</a>
      <AppSidebar capabilities={caps} />
      <div className={s.workspace}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <SidebarTrigger className={s.navToggle} />
            <span>Workspace</span><ChevronRight size={14} /><strong>{pageTitle(pathname)}</strong>
          </div>
          <div className={s.topbarRight}>
            <Select value={displayTz} onValueChange={changeTz}>
              <SelectTrigger
                className={s.timezoneTrigger}
                aria-label="Display timezone"
                title="Timezone all admin times are shown in (saved to your profile)"
              >
                <Globe2 size={15} />
                <span>{tzAbbrev(new Date(), displayTz) || 'TZ'}</span>
              </SelectTrigger>
              <SelectContent align="end">
                {US_TIMEZONES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Link to="/staff" className={s.dashboardLink}><ArrowLeft size={16} /><span>Back to staff dashboard</span></Link>
          </div>
        </header>
        <div className={s.scroll}>
          <main
            id="admin-main"
            key={`${pathname.split('/')[2] || 'home'}:${displayTz}`}
            className={`${s.main} animate-in fade-in-0 duration-200`}
          >
            <ErrorBoundary inline resetKey={pathname}><Outlet context={{ capabilities: caps }} /></ErrorBoundary>
          </main>
          <footer className={s.workspaceFooter}><span>Dr. Shumard · Practice workspace</span></footer>
        </div>
      </div>
      <ConfirmRoot />
    </SidebarProvider>
  );
}
