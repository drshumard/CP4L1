import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, CalendarPlus, CalendarRange, ChartNoAxesCombined, ChevronRight, History, House, LogOut, Receipt,
  Search, Settings, UserCog, Users, Workflow, X,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { adminApi } from '../admin/api';
import { appsForCapabilities, TEAM_ROLES, ROLE_LABELS, loginPath } from '@/lib/staffApps';
import { canAccessPortalPath } from '@/lib/portalAccess';
import { endSession } from '@/lib/session';
import logo from '../checkout/dr-shumard-logo.png';
import s from './staff-shell.module.css';
import '../admin/admin.css';

// Team workspace shell — layout ported from shumard-checkout-portal/app/staff (Lyra).
// Apps come from the RBAC capabilities; codes 01..0N double as keyboard shortcuts.

const PORTAL_PAGES = [
  { label: 'Patients', to: '/admin', icon: Users, keywords: ['Users', 'Onboarding'] },
  { label: 'Bookings', to: '/admin/scheduling/bookings', icon: CalendarDays, keywords: ['Scheduling', 'Sessions'] },
  { label: 'New booking', to: '/admin/scheduling/new', icon: CalendarPlus, keywords: ['Book a session'] },
  { label: 'Purchases', to: '/admin/purchases', icon: Receipt, keywords: ['Payments', 'Orders', 'Checkout'] },
  { label: 'Calendar', to: '/admin/scheduling/calendar', icon: CalendarRange, keywords: ['Availability'] },
  { label: 'Hosts', to: '/admin/scheduling/hosts', icon: UserCog, keywords: ['Directors', 'Coordinators'] },
  { label: 'Scheduling settings', to: '/admin/scheduling/settings', icon: Settings, keywords: ['Reminders', 'Engine'] },
  { label: 'Analytics', to: '/admin/analytics', icon: ChartNoAxesCombined, keywords: ['Reports'] },
  { label: 'Activity log', to: '/admin/logs', icon: History, keywords: ['Audit'] },
  { label: 'Automations', to: '/admin/automations', icon: Workflow, keywords: ['Webhooks'] },
];

export const appCode = (i) => String(i + 1).padStart(2, '0');

function pageTitle(pathname, apps) {
  if (pathname.startsWith('/staff/settings')) return 'Settings';
  const app = apps.find((a) => pathname.startsWith(a.path));
  return app ? app.label : 'Home';
}

const initialsOf = (name) => (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'T').toUpperCase();

// Inside SidebarProvider so the mobile sheet can close itself after a navigation.
function StaffNav({ pathname, apps, profile, name, role, onLogout }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
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
          <Link to="/staff" aria-current={pathname === '/staff' ? 'page' : undefined} onClick={close}>
            <span className={s.navIcon}><House size={17} /></span><span>Home</span><small>00</small>
          </Link>
          {apps.map((app, i) => (
            <Link key={app.key} to={app.path} aria-current={pathname.startsWith(app.path) ? 'page' : undefined} onClick={close}>
              <span className={s.navIcon}><app.icon size={17} /></span><span>{app.label}</span><small>{appCode(i)}</small>
            </Link>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className={s.sideFooter}>
        <Link to="/staff/settings" className={s.account} onClick={close} title="Settings">
          <span className={s.accountAvatar}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initialsOf(name)}
          </span>
          <div><strong>{name}</strong><span>{ROLE_LABELS[role] || role}</span></div>
        </Link>
        <button type="button" className={s.signOut} onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
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
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  const apps = profile ? appsForCapabilities(profile.capabilities) : [];
  const caps = profile?.capabilities || [];
  const pages = PORTAL_PAGES.filter((p) => canAccessPortalPath(p.to, caps));
  const inSupplements = pathname.startsWith('/staff/supplements');

  const go = useCallback((to) => { setPaletteOpen(false); navigate(to); }, [navigate]);

  // ⌘K / Ctrl+K opens search; 1..N open apps unless someone is typing (or inside a dialog).
  useEffect(() => {
    if (inSupplements) return undefined;
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const app = apps.find((_, i) => appCode(i) === `0${event.key}`);
      if (app) { event.preventDefault(); go(app.path); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [apps, go, inSupplements]);

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

  // Supplements brings its OWN rail + top bar (ported app) — render it full-bleed with no
  // staff sidebar/navbar. It still gets the outlet context (profile/role) for auth.
  if (inSupplements) {
    return (
      <div className="admin-geist h-screen overflow-hidden">
        <Outlet context={{ profile, role, apps }} />
      </div>
    );
  }

  const name = profile.name || 'Team member';
  // Explicit logout: clears Portal tokens + Learn cookie, hard-redirects to sign-in.
  const logout = () => endSession(loginPath());
  const openPalette = () => setPaletteOpen(true);

  return (
    <SidebarProvider className={s.shell} defaultOpen={false} style={{ '--sidebar-width': '232px' }}>
      <Sidebar className={s.sidebar}>
        <StaffNav pathname={pathname} apps={apps} profile={profile} name={name} role={role} onLogout={logout} />
      </Sidebar>

      <div className={s.workspace}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <SidebarTrigger className={s.navToggle} />
            <span>Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{pageTitle(pathname, apps)}</strong>
          </div>
          <div className={s.topbarRight}>
            {pathname !== '/staff' && (
              <Link to="/staff" className={s.dashboardLink}><ArrowLeft size={16} /><span>Back to dashboard</span></Link>
            )}
            <button type="button" className={s.search} onClick={openPalette} aria-keyshortcuts="Meta+K Control+K">
              <Search size={15} aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd>
            </button>
          </div>
        </header>
        <main id="staff-main" className={s.main}>
          <Outlet context={{ profile, role, apps, openPalette }} />
        </main>
        <footer className={s.footer}>
          <span>Dr. Shumard · Team workspace</span>
          <span>Signed in as {profile.email}</span>
        </footer>
      </div>

      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className={s.palette}>
          <DialogTitle className="sr-only">Search the workspace</DialogTitle>
          <Command>
            <CommandInput placeholder="Search apps and portal pages" />
            <CommandList>
              <CommandEmpty>No matches. Try an app like Portal, or a page like Bookings.</CommandEmpty>
              <CommandGroup heading="Apps">
                {apps.map((app, i) => (
                  <CommandItem key={app.key} value={app.label} keywords={app.tags} onSelect={() => go(app.path)}>
                    <app.icon aria-hidden="true" />{app.label}<span className={s.shortcut}>{i + 1}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {pages.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Portal pages">
                    {pages.map((page) => (
                      <CommandItem key={page.to} value={page.label} keywords={page.keywords} onSelect={() => go(page.to)}>
                        <page.icon aria-hidden="true" />{page.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          <p className={s.paletteFoot}><span>↑↓ Move</span><span>↵ Open</span><span>Esc Close</span></p>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
