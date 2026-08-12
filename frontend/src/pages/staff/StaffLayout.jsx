import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, ChevronsUpDown, LogOut, Settings } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { adminApi } from '../admin/api';
import { appsForRole, TEAM_ROLES, ROLE_LABELS } from '@/lib/staffApps';
import '../admin/admin.css';

const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

function pageTitle(pathname, apps) {
  if (pathname.startsWith('/staff/settings')) return 'Settings';
  const app = apps.find((a) => pathname.startsWith(a.path));
  return app ? app.label : 'Home';
}

export default function StaffLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () => adminApi.get('/user/me').then((r) => setProfile(r.data)).catch(() => setFailed(true));
    load();
    window.addEventListener('profile-updated', load);
    return () => window.removeEventListener('profile-updated', load);
  }, []);

  if (!localStorage.getItem('access_token')) return <Navigate to="/login" replace />;
  if (failed) return <Navigate to="/" replace />;
  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }
  if (!TEAM_ROLES.includes(profile.role)) return <Navigate to="/" replace />;

  const role = profile.role;
  const apps = appsForRole(role);
  const name = profile.name || 'Team member';
  const initials = (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'T').toUpperCase();

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    navigate('/login');
  };

  // One menu, two triggers: the sidebar-footer chip and the navbar avatar share it.
  const userMenuContent = (side, align) => (
    <DropdownMenuContent side={side} align={align} sideOffset={4} className="min-w-56 rounded-lg">
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
    <SidebarProvider className="admin-geist" style={{ background: 'hsl(40 6% 91%)' }}>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader>
          <Link to="/staff" className="flex h-10 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={LOGO} alt="Dr. Shumard" className="h-7 w-auto object-contain group-data-[collapsible=icon]:hidden" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/staff'} tooltip="Home">
                  <Link to="/staff"><Home /><span>Home</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {apps.map((a) => (
                <SidebarMenuItem key={a.key}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(a.path)} tooltip={a.label}>
                    <Link to={a.path}><a.icon /><span>{a.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage src={profile.avatar_url || undefined} alt={name} />
                      <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[role] || role}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                {userMenuContent('top', 'end')}
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="md:m-2 md:ml-0 md:rounded-xl md:border md:shadow-sm md:h-[calc(100svh-1rem)] overflow-hidden bg-card">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <h1 className="text-base font-semibold">{pageTitle(pathname, apps)}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Account menu"
                className="ml-auto flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="size-8">
                  <AvatarImage src={profile.avatar_url || undefined} alt={name} />
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            {userMenuContent('bottom', 'end')}
          </DropdownMenu>
        </header>
        <div className={`flex-1 overflow-y-auto min-w-0 [scrollbar-gutter:stable] animate-in fade-in-0 duration-200 ${pathname.startsWith('/staff/supplements') ? '' : 'p-6'}`}>
          <Outlet context={{ profile, role, apps }} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
