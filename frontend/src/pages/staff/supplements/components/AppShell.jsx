import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { loginPath } from '@/lib/staffApps';
import { endSession } from '@/lib/session';
import {
  ArrowLeft, Building2, ChevronRight, FilePlus, Layers, LayoutDashboard, LogOut, Pill, Search, UserRound, X,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import logo from '../../../checkout/dr-shumard-logo.png';
import s from '../../staff-shell.module.css';

// Supplements shell — the staff workspace's Lyra sidebar/topbar (staff-shell.module.css) with
// this app's own navigation. Pages render inside .supp-app so the scoped tokens apply.

const navItems = [
  { label: 'Dashboard',   icon: LayoutDashboard, path: '/staff/supplements',                   roles: ['admin', 'hc'] },
  { label: 'Patients',    icon: UserRound,       path: '/staff/supplements/patients',           roles: ['admin', 'hc'] },
  { label: 'New plan',    icon: FilePlus,        path: '/staff/supplements/plans/new',          roles: ['admin', 'hc'] },
];

const adminItems = [
  { label: 'Supplements', icon: Pill,            path: '/staff/supplements/admin/supplements',  roles: ['admin'] },
  { label: 'Templates',   icon: Layers,          path: '/staff/supplements/admin/templates',    roles: ['admin'] },
  { label: 'Suppliers',   icon: Building2,       path: '/staff/supplements/admin/suppliers',    roles: ['admin'] },
];

const code = (i) => String(i + 1).padStart(2, '0');

function SuppNav({ primary, admin, isActive, displayName, initials, avatarUrl, roleLabel, onLogout }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const item = (n, i) => (
    <Link key={n.path} to={n.path} aria-current={isActive(n.path) ? 'page' : undefined} onClick={close}
      data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, '-')}`}>
      <span className={s.navIcon}><n.icon size={17} /></span><span>{n.label}</span><small>{code(i)}</small>
    </Link>
  );
  return (
    <>
      <SidebarHeader className={s.sideHeader}>
        <Link to="/staff/supplements" className={s.sideBrand} onClick={close}>
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} />
          <span>Supplements</span>
        </Link>
        <button type="button" onClick={close} aria-label="Close navigation" className={s.closeNav}><X size={20} /></button>
      </SidebarHeader>
      <SidebarContent className={s.sideContent}>
        <p className={s.navLabel}>Protocols</p>
        <nav aria-label="Supplements navigation" className={s.sideNav}>
          {primary.map((n, i) => item(n, i))}
        </nav>
        {admin.length > 0 && (
          <>
            <p className={s.navLabel} style={{ marginTop: 22 }}>Admin</p>
            <nav aria-label="Supplements admin" className={s.sideNav}>
              {admin.map((n, i) => item(n, primary.length + i))}
            </nav>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className={s.sideFooter}>
        <Link to="/staff/settings" className={s.account} onClick={close} title="Settings">
          <span className={s.accountAvatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span>
          <div><strong>{displayName}</strong><span>{roleLabel}</span></div>
        </Link>
        <button type="button" className={s.signOut} onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
      </SidebarFooter>
    </>
  );
}

export default function AppShell({ children }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const displayName = profile?.name || user?.name || 'Team member';
  const initials = (displayName.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'T').toUpperCase();
  // Explicit logout: clears Portal tokens + Learn cookie, hard-redirects to sign-in.
  const logout = () => endSession(loginPath());

  const role = user?.role;
  const primary = navItems.filter(n => n.roles.includes(role));
  const admin = adminItems.filter(n => n.roles.includes(role));
  const all = [...primary, ...admin];

  const isActive = (path) =>
    location.pathname === path
    || (path !== '/staff/supplements' && location.pathname.startsWith(path));
  const current = all.find((n) => isActive(n.path));
  const title = current?.label || (location.pathname.includes('/plans/') ? 'Plan' : location.pathname.includes('/patients/') ? 'Patient' : 'Supplements');

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const paletteGo = (path) => {
    setPaletteOpen(false);
    navigate(path);
  };

  return (
    <SidebarProvider className={s.shell} style={{ '--sidebar-width': '232px', height: '100svh', minHeight: 0 }} data-testid="app-shell">
      <Sidebar className={s.sidebar}>
        <SuppNav primary={primary} admin={admin} isActive={isActive} displayName={displayName} initials={initials}
          avatarUrl={profile?.avatar_url} roleLabel={role === 'admin' ? 'Admin' : 'Health Coach'} onLogout={logout} />
      </Sidebar>

      <div className={s.workspace} style={{ height: '100svh', minHeight: 0 }}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <SidebarTrigger className={s.navToggle} />
            <span>Supplements</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{title}</strong>
          </div>
          <div className={s.topbarRight}>
            <Link to="/staff" className={s.dashboardLink}><ArrowLeft size={16} /><span>Back to dashboard</span></Link>
            <button type="button" className={s.search} onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Meta+K Control+K" data-testid="global-command-trigger">
              <Search size={15} aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd>
            </button>
          </div>
        </header>
        {/* The pages scroll inside the workspace column (the staff layout's wrapper is overflow-hidden). */}
        <main className="supp-app" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children}
        </main>
      </div>

      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className={s.palette}>
          <DialogTitle className="sr-only">Search Supplements</DialogTitle>
          <Command>
            <CommandInput placeholder="Search or jump to…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup heading="Navigation">
                {all.map((n, i) => (
                  <CommandItem key={n.path} value={n.label} onSelect={() => paletteGo(n.path)}>
                    <n.icon aria-hidden="true" />{n.label}<span className={s.shortcut}>{i + 1}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <p className={s.paletteFoot}><span>↑↓ Move</span><span>↵ Open</span><span>Esc Close</span></p>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
