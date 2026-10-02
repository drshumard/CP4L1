import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { loginPath } from '@/lib/staffApps';
import { endSession } from '@/lib/session';
import { ArrowLeft, ArrowUpRight, Building2, ChevronDown, FileText, Layers, LogOut, Pill, Plus, Search, Settings, UserRound, X } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import drShumardLogo from '@/pages/checkout/dr-shumard-logo.png';
import s from './app-shell.module.css';

const base = '/staff/supplements';
const primary = [
  { label: 'Plans', icon: FileText, path: base, testId: 'dashboard' },
  { label: 'Patients', icon: UserRound, path: `${base}/patients`, testId: 'patients' },
];
const library = [
  { label: 'Supplement catalog', icon: Pill, path: `${base}/admin/supplements`, testId: 'supplements' },
  { label: 'Protocol templates', icon: Layers, path: `${base}/admin/templates`, testId: 'templates' },
  { label: 'Suppliers', icon: Building2, path: `${base}/admin/suppliers`, testId: 'suppliers' },
];

function Shortcut({ label, collapsed, children }) {
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    {collapsed && <TooltipContent side="right" sideOffset={12} className={`supp-theme ${s.tooltip}`}>{label}</TooltipContent>}
  </Tooltip>;
}

function Navigation({ admin, isActive }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const close = () => setOpenMobile(false);
  const item = n => <Shortcut key={n.path} label={n.label} collapsed={collapsed}>
    <Link to={n.path} className={s.sideLink} aria-label={n.label} aria-current={isActive(n.path) ? 'page' : undefined} onClick={close} data-testid={`nav-${n.testId}`}>
      <n.icon size={18} aria-hidden="true" /><span className={s.sideLabel}>{n.label}</span>{isActive(n.path) && <span className={s.activeMark} />}
    </Link>
  </Shortcut>;
  return <div id="supplement-navigation" className={`supp-theme ${s.navBody}`} data-collapsed={collapsed}>
    <SidebarHeader className={s.sideHeader}>
      <Link to={base} className={s.brand} onClick={close} aria-label="Protocol Manager home" style={{ '--brand-logo': `url(${drShumardLogo})` }}>
        <span className={s.brandIcon} aria-hidden="true" />
        <span className={s.sideLabel}><span className={s.brandWordmark} aria-hidden="true" /><strong>Protocol Manager</strong></span>
      </Link>
      <button type="button" className={s.closeNav} onClick={close} aria-label="Close navigation"><X size={18} /></button>
    </SidebarHeader>
    <SidebarContent className={s.sideContent}>
      <p className={s.navLabel}>Workspace</p>
      <nav className={s.sideNav} aria-label="Workspace shortcuts">{primary.map(item)}</nav>
      {admin && <><p className={s.navLabel}>Library</p><nav className={`${s.sideNav} ${s.libraryShortcuts}`} aria-label="Library shortcuts">{library.map(item)}</nav></>}
      <div className={s.navNote}><span className={s.noteRule} /><p>A considered plan.<br />A clearer path to care.</p></div>
    </SidebarContent>
    <SidebarFooter className={s.sideFooter}>
      <Shortcut label="Team workspace" collapsed={collapsed}>
        <Link to="/staff" onClick={close} className={s.back} aria-label="Team workspace"><ArrowLeft size={18} /><span className={s.sideLabel}>Team workspace</span></Link>
      </Shortcut>
    </SidebarFooter>
  </div>;
}

function Navbar({ admin, isActive, displayName, initials, avatarUrl, roleLabel, onSearch }) {
  const { state, isMobile, openMobile } = useSidebar();
  const toggleRef = useRef(null);
  const previousMobileOpen = useRef(openMobile);
  useEffect(() => {
    let frame;
    if (isMobile && previousMobileOpen.current && !openMobile) {
      frame = requestAnimationFrame(() => toggleRef.current?.focus());
    }
    previousMobileOpen.current = openMobile;
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [isMobile, openMobile]);
  const expanded = isMobile ? openMobile : state === 'expanded';
  const libraryActive = library.some(n => isActive(n.path));
  return <header className={s.topbar} data-sidebar-collapsed={!expanded}>
    <div className={s.navbarIdentity}>
      <SidebarTrigger ref={toggleRef} className={s.iconButton} aria-label={isMobile ? 'Open navigation' : expanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={expanded} aria-controls="supplement-navigation" />
    </div>
    <nav className={s.primaryNav} aria-label="Primary navigation">
      {primary.map(n => <Link key={n.path} to={n.path} className={s.navLink} aria-current={isActive(n.path) ? 'page' : undefined} data-testid={`navbar-${n.testId}`}>{n.label}</Link>)}
      {admin && <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className={s.navLink} data-active={libraryActive} data-testid="navbar-library">Library<ChevronDown size={13} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className={`supp-theme ${s.navMenu}`} aria-label="Library navigation">
          <DropdownMenuLabel className={s.menuLabel}>Supplement library</DropdownMenuLabel>
          {library.map(n => <DropdownMenuItem key={n.path} asChild><Link to={n.path} aria-current={isActive(n.path) ? 'page' : undefined}><n.icon size={16} /><span>{n.label}</span></Link></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>}
    </nav>
    <div className={s.navActions}>
      <button type="button" className={s.search} onClick={onSearch} aria-label="Search navigation" aria-keyshortcuts="Meta+K Control+K" data-testid="global-command-trigger"><Search size={15} /><span>Jump to…</span><kbd>⌘ K</kbd></button>
      <Link to={`${base}/plans/new`} className={s.create} aria-label="Create a plan" data-testid="nav-new-plan"><Plus size={15} /><span className={s.createLong}>Create a plan</span><span className={s.createShort}>New plan</span></Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" className={s.accountTrigger} aria-label={`Account menu for ${displayName}`}>
          <span className={s.avatar}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</span><ChevronDown size={12} className={s.accountChevron} />
        </button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={12} className={`supp-theme ${s.navMenu}`}>
          <DropdownMenuLabel className={s.accountLabel}><strong>{displayName}</strong><small>{roleLabel}</small></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link to="/staff/settings"><Settings size={16} />Settings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/staff"><ArrowLeft size={16} />Team workspace</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => endSession(loginPath())}><LogOut size={16} />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}

export default function AppShell({ children }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef(null);
  const displayName = profile?.name || user?.name || 'Team member';
  const initials = displayName.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const admin = user?.role === 'admin';
  const all = [...primary, ...(admin ? library : []), { label: 'Create a plan', icon: Plus, path: `${base}/plans/new` }];
  const isActive = path => location.pathname === path || (path === base && location.pathname.includes('/plans/') && !location.pathname.endsWith('/new')) || (path !== base && location.pathname.startsWith(path));
  const title = location.pathname === `${base}/plans/new` ? 'New plan' : location.pathname.includes('/plans/') ? 'Plan editor' : all.find(n => isActive(n.path))?.label || 'Workspace';
  useEffect(() => {
    const onKey = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => { document.title = `${title} · Supplementor`; }, [title]);
  const go = path => { setPaletteOpen(false); navigate(path); };
  return <SidebarProvider defaultOpen={false} className={`supp-shell ${s.shell}`} style={{ '--sidebar-width': '228px', '--sidebar-width-icon': '64px', height: '100svh', minHeight: 0 }} data-testid="app-shell">
    <a href="#supplement-workspace" className={s.skip}>Skip to content</a>
    <Sidebar collapsible="icon" className={s.sidebar}><Navigation admin={admin} isActive={isActive} /></Sidebar>
    <div className={s.workspace}>
      <Navbar admin={admin} isActive={isActive} displayName={displayName} initials={initials} avatarUrl={profile?.avatar_url} roleLabel={admin ? 'Administrator' : 'Health coach'} onSearch={() => setPaletteOpen(true)} />
      <main ref={mainRef} id="supplement-workspace" tabIndex={-1} className="supp-app" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</main>
    </div>
    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent className={`supp-theme ${s.palette}`}>
        <DialogTitle className="sr-only">Navigate Supplementor</DialogTitle><DialogDescription className="sr-only">Search workspace and library destinations.</DialogDescription>
        <Command><CommandInput placeholder="Where would you like to go?" /><CommandList><CommandEmpty>No destinations found.</CommandEmpty><CommandGroup heading="Workspace">{all.map(n => <CommandItem key={n.path} value={n.label} onSelect={() => go(n.path)}><n.icon size={16} /><span>{n.label}</span><ArrowUpRight size={13} /></CommandItem>)}</CommandGroup></CommandList></Command>
        <div className={s.paletteFoot}><span>↑ ↓ Navigate</span><span>↵ Open</span><span>Esc Close</span></div>
      </DialogContent>
    </Dialog>
  </SidebarProvider>;
}
