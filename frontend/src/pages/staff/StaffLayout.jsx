import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, CircleHelp, Home, LogOut, Settings, X } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminApi } from '../admin/api';
import { appsForCapabilities, TEAM_ROLES, ROLE_LABELS, loginPath } from '@/lib/staffApps';
import { endSession } from '@/lib/session';
import logo from '../checkout/dr-shumard-logo.png';
import s from './staff-shell.module.css';
import '../admin/admin.css';

// Team workspace shell — layout ported from shumard-checkout-portal/app/admin (Lyra).

function pageTitle(pathname, apps) {
  if (pathname.startsWith('/staff/settings')) return 'Settings';
  const app = apps.find((a) => pathname.startsWith(a.path));
  return app ? app.label : 'Home';
}

const initialsOf = (name) => (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'T').toUpperCase();

function AccountAvatar({ profile, name }) {
  return (
    <span className={s.accountAvatar}>
      {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initialsOf(name)}
    </span>
  );
}

// Inside SidebarProvider so the mobile sheet can close itself after a navigation.
function StaffNav({ pathname, apps, profile, name, role, userMenuContent }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const items = [{ key: 'home', label: 'Home', path: '/staff', icon: Home, exact: true }, ...apps];
  return (
    <>
      <SidebarHeader className={s.sideHeader}>
        <Link to="/staff" className={s.sideBrand} onClick={close}>
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} />
          <span>Team workspace</span>
        </Link>
        <button type="button" onClick={close} aria-label="Close navigation" className={s.closeNav}><X size={20} /></button>
      </SidebarHeader>
      <SidebarContent className={s.sideContent}>
        <p className={s.navLabel}>Workspace</p>
        <nav aria-label="Workspace navigation" className={s.sideNav}>
          {items.map((item, i) => {
            const active = item.exact ? pathname === item.path : pathname.startsWith(item.path);
            return (
              <Link key={item.key} to={item.path} aria-current={active ? 'page' : undefined} onClick={close}>
                <span className={s.navIcon}><item.icon size={17} /></span>
                <span>{item.label}</span>
                <small>{String(i + 1).padStart(2, '0')}</small>
              </Link>
            );
          })}
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
            <button type="button" className={s.account} aria-label="Account menu">
              <AccountAvatar profile={profile} name={name} />
              <div><strong>{name}</strong><span>{ROLE_LABELS[role] || role}</span></div>
              <span className={s.onlineDot} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          {userMenuContent('top', 'start')}
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}

export default function StaffLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  // null = fine, 'auth' = rejected (401/403), 'error' = network/server hiccup.
  // Only genuine rejection may redirect — a flaky backend must never dump staff
  // into the patient portal.
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Team Workspace | Dr. Shumard';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    const load = () => {
      setFailed(null);
      adminApi.get('/user/me').then((r) => setProfile(r.data)).catch((e) => {
        const status = e?.response?.status;
        setFailed(status === 401 || status === 403 ? 'auth' : 'error');
      });
    };
    load();
    window.addEventListener('profile-updated', load);
    window.addEventListener('staff-profile-retry', load);
    return () => {
      window.removeEventListener('profile-updated', load);
      window.removeEventListener('staff-profile-retry', load);
    };
  }, []);

  if (!localStorage.getItem('access_token')) return <Navigate to={loginPath()} replace />;
  if (failed === 'auth') return <Navigate to={loginPath()} replace />;
  if (failed === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Couldn't reach the server.</p>
        <button type="button" onClick={() => window.dispatchEvent(new Event('staff-profile-retry'))}
          className="rounded-md border px-3 py-1.5 hover:bg-muted">
          Try again
        </button>
      </div>
    );
  }
  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }
  if (!TEAM_ROLES.includes(profile.role)) return <Navigate to="/" replace />;

  const role = profile.role;
  const apps = appsForCapabilities(profile.capabilities);

  // Supplements brings its OWN rail + top bar (ported app) — render it full-bleed with no
  // staff sidebar/navbar. It still gets the outlet context (profile/role) for auth.
  if (pathname.startsWith('/staff/supplements')) {
    return (
      <div className="admin-geist h-screen overflow-hidden">
        <Outlet context={{ profile, role, apps }} />
      </div>
    );
  }

  const name = profile.name || 'Team member';

  // Explicit logout: clears Portal tokens + Learn cookie, hard-redirects to sign-in.
  const logout = () => endSession(loginPath());

  // One menu, two triggers: the sidebar-footer chip and the topbar avatar share it.
  const userMenuContent = (side, align) => (
    <DropdownMenuContent side={side} align={align} sideOffset={4} className="min-w-56 rounded-lg"
      style={{ fontFamily: '"Inter Checkout", Inter, "Helvetica Neue", Arial, sans-serif' }}>  {/* portalled outside .shell */}
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="grid px-2 py-1.5 text-sm leading-tight">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => navigate('/staff/settings')}>
        <Settings /> Settings
      </DropdownMenuItem>
      <DropdownMenuItem className="text-destructive focus:text-destructive [&_svg]:text-destructive" onClick={logout}>
        <LogOut /> Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <SidebarProvider className={s.shell} style={{ '--sidebar-width': '232px' }}>
      <Sidebar className={s.sidebar}>
        <StaffNav pathname={pathname} apps={apps} profile={profile} name={name} role={role} userMenuContent={userMenuContent} />
      </Sidebar>
      <div className={s.workspace}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <SidebarTrigger className={s.navToggle} />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{pageTitle(pathname, apps)}</strong>
          </div>
          <div className={s.topbarRight}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className={s.topbarAvatar}>
                  <AccountAvatar profile={profile} name={name} />
                </button>
              </DropdownMenuTrigger>
              {userMenuContent('bottom', 'end')}
            </DropdownMenu>
          </div>
        </header>
        <main id="staff-main" className={s.main}>
          <Outlet context={{ profile, role, apps }} />
        </main>
        <footer className={s.workspaceFooter}>
          <span>Dr. Shumard · Team workspace</span>
          <span>Signed in as {profile.email}</span>
        </footer>
      </div>
    </SidebarProvider>
  );
}
