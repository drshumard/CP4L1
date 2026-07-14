import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Calendar, ClipboardList, Sparkles } from 'lucide-react';
import { MOCK, NAV, LOGO } from './protoData';
import './proto.css';

const ICONS = { home: Home, calendar: Calendar, clipboard: ClipboardList, sparkles: Sparkles };

export default function ProtoLayout() {
  const { user, journey } = MOCK;
  const isHome = (to) => to === '/prototype';

  return (
    <div className="proto">
      {/* Top bar */}
      <header className="proto-topbar">
        <div className="proto-container" style={{ height: 62, display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src={LOGO} alt="Dr. Shumard" style={{ height: 22 }} />

          {/* desktop nav */}
          <nav className="proto-desktop-nav" style={{ marginLeft: 8, gap: 2, display: 'none' }}>
            {NAV.map((n) => (
              <NavLink key={n.key} to={n.to} end={isHome(n.to)}
                className={({ isActive }) => `proto-navlink ${isActive ? 'is-active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="proto-badge proto-badge--brand" style={{ display: 'none' }} data-step-chip>
              Step {journey.currentStep} of 3
            </span>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--brand-600)', color: '#fff',
              display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>
              {user.initials}
            </div>
          </div>
        </div>
      </header>

      <main className="proto-container proto-main">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="proto-bottomnav proto-mobile-nav">
        {NAV.map((n) => {
          const Icon = ICONS[n.icon] || Home;
          return (
            <NavLink key={n.key} to={n.to} end={isHome(n.to)}
              className={({ isActive }) => (isActive ? 'is-active' : '')}>
              <span className="proto-navicon"><Icon size={19} strokeWidth={2} /></span>
              {n.label}
            </NavLink>
          );
        })}
      </nav>

      {/* show desktop nav + step chip from 900px, hide bottom nav */}
      <style>{`
        @media (min-width: 900px) {
          .proto-desktop-nav { display: flex !important; }
          [data-step-chip] { display: inline-flex !important; }
          .proto-mobile-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
