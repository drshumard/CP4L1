import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  LayoutDashboard, FilePlus, Pill, Layers, Users, UserRound, Building2, Search,
  ArrowLeft, Settings, LogOut,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';

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

function RailItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
          aria-label={item.label}
          className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-150 ${
            active
              ? 'text-[color:var(--accent-teal)] bg-[color:var(--accent-teal-wash)]'
              : 'text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-[color:var(--surface-hover)]'
          }`}
        >
          {active && (
            <span className="absolute -left-[11px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-[color:var(--accent-teal)]" />
          )}
          <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="text-xs font-medium px-2.5 py-1.5">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function AppShell({ children }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const displayName = profile?.name || user?.name || 'Team member';
  const initials = (displayName.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'T').toUpperCase();
  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    navigate('/login');
  };

  const role = user?.role;
  const primary = navItems.filter(n => n.roles.includes(role));
  const admin = adminItems.filter(n => n.roles.includes(role));

  const isActive = (path) =>
    location.pathname === path
    || (path !== '/staff/supplements' && location.pathname.startsWith(path));

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
    <TooltipProvider delayDuration={150}>
      {/* h-full (not h-screen): rendered inside the staff shell's scroll area */}
      <div className="supp-app flex h-full canvas" data-testid="app-shell">
        {/* ── Icon rail ── */}
        <aside className="w-14 shrink-0 surface hairline-r flex flex-col items-center py-3">
          {/* Logo mark */}
          <button
            onClick={() => navigate('/staff/supplements')}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[color:var(--surface-hover)] transition-colors mb-3"
            aria-label="Home"
          >
            <img
              src="https://portal-drshumard.b-cdn.net/logo.png"
              alt="Dr. Shumard"
              className="h-6 w-auto object-contain"
            />
          </button>

          <div className="w-6 hairline-b mb-3" />

          <nav className="flex flex-col gap-1">
            {primary.map(item => (
              <RailItem key={item.path} item={item} active={isActive(item.path)} onClick={() => navigate(item.path)} />
            ))}
          </nav>

          {admin.length > 0 && (
            <>
              <div className="w-6 hairline-b my-3" />
              <nav className="flex flex-col gap-1">
                {admin.map(item => (
                  <RailItem key={item.path} item={item} active={isActive(item.path)} onClick={() => navigate(item.path)} />
                ))}
              </nav>
            </>
          )}

          {/* ── Rail bottom: user menu (was Clerk's UserButton) ── */}
          <div className="mt-auto flex flex-col items-center gap-2 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu"
                  className="rounded-full outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="size-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
                    <AvatarFallback className="bg-[color:var(--accent-teal)] text-white text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" sideOffset={10} className="min-w-56 rounded-lg">
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="grid px-2 py-1.5 text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{profile?.email}</span>
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
            </DropdownMenu>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Translucent top bar */}
          <header className="h-12 shrink-0 chrome-blur hairline-b flex items-center px-4 gap-3 sticky top-0 z-40">
            <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-ink">
              Supplements Portal
            </div>  

            {/* ⌘K trigger — centered */}
            <div className="flex-1 flex justify-center">
              <button
                onClick={() => setPaletteOpen(true)}
                className="group inline-flex items-center gap-2.5 h-7 px-3 rounded-md border hairline bg-[color:var(--surface-hover)] hover:bg-[color:var(--surface-subtle)] text-[12px] text-ink-muted transition-colors min-w-[280px]"
                data-testid="global-command-trigger"
              >
                <Search size={13} className="text-ink-subtle" />
                <span>Search or jump to…</span>
                <kbd className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-mono text-ink-subtle">
                  <span className="px-1 py-px rounded border hairline bg-white">⌘</span>
                  <span className="px-1 py-px rounded border hairline bg-white">K</span>
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <span className="text-[11px] font-medium text-ink-muted hidden md:inline">
                  {user.name}
                  <span className="mx-1.5 text-ink-faint">·</span>
                  <span className="uppercase tracking-[0.08em]">{user.role}</span>
                </span>
              )}
              <button
                onClick={() => navigate('/staff')}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
              >
                <ArrowLeft size={13} />
                <span>Back to portal</span>
              </button>
            </div>
          </header>

          {/* Page canvas */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        {/* Command palette */}
        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder="Search or jump to…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {[...primary, ...admin].map(item => (
                <CommandItem key={item.path} onSelect={() => paletteGo(item.path)}>
                  <item.icon size={14} className="mr-2 text-ink-muted" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </TooltipProvider>
  );
}
