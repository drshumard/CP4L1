import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
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

  useEffect(() => {
    adminApi.get('/user/me')
      .then((r) => {
        const t = safeTz(r.data?.timezone);
        setAdminDisplayTz(t);
        setDisplayTzState(t);
      })
      .catch(() => { /* not signed in / transient — keep the Pacific default */ });
  }, []);

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
      <AppSidebar />
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
            <a href="/" className={s.dashboardLink}><ArrowLeft size={16} /><span>Patient dashboard</span></a>
          </div>
        </header>
        <div className={s.scroll}>
          <main
            id="admin-main"
            key={`${pathname.split('/')[2] || 'home'}:${displayTz}`}
            className={`${s.main} animate-in fade-in-0 duration-200`}
          >
            <ErrorBoundary inline resetKey={pathname}><Outlet /></ErrorBoundary>
          </main>
          <footer className={s.workspaceFooter}><span>Dr. Shumard · Practice workspace</span></footer>
        </div>
      </div>
      <ConfirmRoot />
    </SidebarProvider>
  );
}
