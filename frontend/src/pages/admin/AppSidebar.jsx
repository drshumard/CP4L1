import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Users, CalendarClock, BarChart3, Activity, Zap, Settings,
  ChevronRight, ChevronsUpDown, LogOut, ExternalLink, LayoutGrid,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { adminApi } from './api';
import { endSession } from '@/lib/session';
import { loginPath } from '@/lib/staffApps';

const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

const SCHEDULING_SUB = [
  { to: '/admin/scheduling/bookings', label: 'Bookings' },
  { to: '/admin/scheduling/calendar', label: 'Calendar' },
  { to: '/admin/scheduling/hosts', label: 'Hosts' },
  { to: '/admin/scheduling/coordinators', label: 'Coordinators' },
  { to: '/admin/scheduling/events', label: 'Events' },
  { to: '/admin/scheduling/settings', label: 'Settings' },
];

const NAV = [
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, cap: 'analytics.view' },
  { to: '/admin/logs', label: 'Activity log', icon: Activity, cap: 'analytics.view' },
  { to: '/admin/automations', label: 'Automations', icon: Zap, cap: 'automations.manage' },
];

export default function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const schedulingActive = pathname.startsWith('/admin/scheduling');

  const [profile, setProfile] = useState(null);
  useEffect(() => {
    const load = () => adminApi.get('/user/me').then((r) => setProfile(r.data)).catch(() => {});
    load();
    window.addEventListener('profile-updated', load);
    return () => window.removeEventListener('profile-updated', load);
  }, []);

  // Sections follow the RBAC matrix (profile.capabilities); the API enforces the same.
  const caps = profile?.capabilities || [];
  const can = (c) => caps.includes(c);

  let storedEmail = '';
  try { storedEmail = JSON.parse(localStorage.getItem('user_data') || '{}')?.email || ''; } catch { /* ignore */ }
  const name = profile?.name || 'Admin';
  const email = profile?.email || storedEmail;
  const avatarUrl = profile?.avatar_url || '';
  const initials = ((profile?.name || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || (email || 'A').charAt(0)).toUpperCase();

  // Explicit logout: clears Portal tokens + Learn cookie, hard-redirects to the staff
  // sign-in (admins are team members — never the patient /login).
  const logout = () => endSession(loginPath());

  const isActive = (to) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        {/* Logo always returns to the staff workspace — the team's home base. */}
        <Link to="/staff" className="flex h-10 items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img src={LOGO} alt="Dr. Shumard" className="h-7 w-auto object-contain group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {can('patients.view') && (<SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/admin'} tooltip="Users">
                <Link to="/admin"><Users /><span>Users</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>)}

            {can('scheduling.view') && (collapsed ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={schedulingActive} tooltip="Scheduling">
                  <Link to="/admin/scheduling/bookings"><CalendarClock /><span>Scheduling</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              <Collapsible asChild defaultOpen={schedulingActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={schedulingActive} tooltip="Scheduling">
                      <CalendarClock />
                      <span>Scheduling</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {SCHEDULING_SUB.map((s) => (
                        <SidebarMenuSubItem key={s.to}>
                          <SidebarMenuSubButton asChild isActive={pathname === s.to}>
                            <Link to={s.to}><span>{s.label}</span></Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ))}

            {NAV.filter((n) => can(n.cap)).map((n) => (
              <SidebarMenuItem key={n.to}>
                <SidebarMenuButton asChild isActive={isActive(n.to)} tooltip={n.label}>
                  <Link to={n.to}><n.icon /><span>{n.label}</span></Link>
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
                    <AvatarImage src={avatarUrl || undefined} alt={name} />
                    <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{email || 'Signed in'}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" sideOffset={4}
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg">
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="grid px-2 py-1.5 text-sm leading-tight">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/admin/scheduling/settings')}>
                  <Settings /> Settings
                </DropdownMenuItem>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
