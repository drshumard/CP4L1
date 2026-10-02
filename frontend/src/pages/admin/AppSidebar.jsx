import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, CalendarDays, ChartNoAxesCombined, CircleHelp, ExternalLink, LayoutGrid, LogOut, Receipt,
  Settings, Users, Workflow, X,
} from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminApi } from './api';
import { endSession } from '@/lib/session';
import { ROLE_LABELS, loginPath } from '@/lib/staffApps';
import { schedulingPagesForCapabilities } from '@/lib/portalAccess';
import logo from '../checkout/dr-shumard-logo.png';   // white logo, on the blue header block
import s from './workspace.module.css';

// Admin sidebar — design: shumard-checkout-portal/app/admin/admin-shell.tsx. Scheduling's sections
// (Bookings, Calendar, …) are the page's own sub-nav (SchedulingLayout), not sidebar items.
// Sections follow the RBAC matrix (profile.capabilities); the API enforces the same.
const NAV = [
  { to: '/admin', label: 'Users', icon: Users, cap: 'patients.view', match: (p) => p === '/admin' },
  { to: '/admin/scheduling/bookings', label: 'Scheduling', icon: CalendarDays, cap: 'scheduling.view', match: (p) => p.startsWith('/admin/scheduling') },
  { to: '/admin/purchases', label: 'Purchases', icon: Receipt, cap: 'purchases.view' },
  { to: '/admin/analytics', label: 'Analytics', icon: ChartNoAxesCombined, cap: 'analytics.view' },
  { to: '/admin/automations', label: 'Automations', icon: Workflow, cap: 'automations.manage' },
];

export default function AppSidebar({ capabilities }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  const [profile, setProfile] = useState(null);
  useEffect(() => {
    const load = () => adminApi.get('/user/me').then((r) => setProfile(r.data)).catch(() => {});
    load();
    window.addEventListener('profile-updated', load);
    return () => window.removeEventListener('profile-updated', load);
  }, []);

  let storedEmail = '';
  try { storedEmail = JSON.parse(localStorage.getItem('user_data') || '{}')?.email || ''; } catch { /* ignore */ }
  const name = profile?.name || 'Admin';
  const email = profile?.email || storedEmail;
  const avatarUrl = profile?.avatar_url || '';
  const initials = ((profile?.name || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || (email || 'A').charAt(0)).toUpperCase();
  const role = ROLE_LABELS[profile?.role] || 'Team member';
  const caps = capabilities || profile?.capabilities || [];
  const can = (c) => caps.includes(c);
  // Scheduling's first allowed section is where its nav item lands.
  const schedulingPages = schedulingPagesForCapabilities(caps);
  const nav = NAV.filter((n) => can(n.cap)).map((n) => (n.label === 'Scheduling' && schedulingPages[0] ? { ...n, to: schedulingPages[0].to } : n));

  // Explicit logout: clears Portal tokens + Learn cookie, hard-redirects to sign-in.
  const logout = () => endSession(loginPath());

  const isActive = (n) => (n.match ? n.match(pathname) : pathname === n.to || pathname.startsWith(`${n.to}/`));

  return (
    <Sidebar className={s.sidebar}>
      <SidebarHeader className={s.sideHeader}>
        {/* Logo returns to the staff workspace — the team's home base. */}
        <Link to="/staff" className={s.sideBrand} onClick={close}><img src={logo} alt="Dr. Shumard" width={1024} height={152} /><span>Practice admin</span></Link>
        <button type="button" onClick={close} aria-label="Close navigation" className={s.closeNav}><X size={20} /></button>
      </SidebarHeader>

      <SidebarContent className={s.sideContent}>
        <p className={s.navLabel}>Operations</p>
        <nav aria-label="Admin navigation" className={s.sideNav}>
          {nav.map((n, i) => (
            <Link key={n.to} to={n.to} onClick={close} aria-current={isActive(n) ? 'page' : undefined}>
              <span className={s.navIcon}><n.icon size={17} /></span><span>{n.label}</span><small>{String(i + 1).padStart(2, '0')}</small>
            </Link>
          ))}
        </nav>
        <div className={s.sideHelp}>
          <span className={s.sideHelpLabel}>SUPPORT</span>
          <CircleHelp size={19} />
          <h3>A little help?</h3>
          <p>Get in touch with the team.</p>
          <a href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer">Contact support <ArrowUpRight size={14} /></a>
        </div>
      </SidebarContent>

      <SidebarFooter className={s.sideFooter}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={s.accountButton} aria-label="Account menu">
              <span className={s.accountAvatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
              <div><strong>{name}</strong><span>{role}</span></div>
              <span className={s.onlineDot} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={10} className={s.accountMenu}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="grid px-2 py-1.5 text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {can('settings.manage') && <DropdownMenuItem onClick={() => { close(); navigate('/admin/scheduling/settings'); }}>
              <Settings /> Settings
            </DropdownMenuItem>}
            <DropdownMenuItem onClick={() => navigate('/staff')}>
              <LayoutGrid /> Staff workspace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/?preview=1')}>
              <ExternalLink /> View patient portal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
