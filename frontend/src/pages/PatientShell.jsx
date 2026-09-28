import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, CircleHelp, LogOut } from 'lucide-react';
import { trackButtonClicked, trackLogout } from '../utils/analytics';
import logo from './checkout/dr-shumard-logo.png';
import styles from './PortalDashboard.module.css';

// The patient pages' blue header and footer (design: shumard-checkout-portal/app/dashboard). Render inside an
// element with `styles.page` — it supplies the colours and font.

const ADMIN_ROLES = ['admin', 'super_admin'];   // who can open /admin (the API's get_admin_user)
export const openSupport = () => window.dispatchEvent(new Event('open-support'));

export function PatientHeader({ user, current }) {
  const navigate = useNavigate();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const logout = () => {
    trackLogout(user?.id);
    localStorage.clear();
    navigate('/login');
    toast.success('Logged out successfully', { id: 'logout-success' });
  };
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link to="/dashboard" aria-label="Dr. Shumard portal home" className={styles.logo}>
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} />
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <Link to="/dashboard" aria-current={current === 'overview' ? 'page' : undefined}>Overview</Link>
          {isAdmin && <Link to="/admin" onClick={() => trackButtonClicked('admin_panel', 'dashboard')}>Admin</Link>}
          {isAdmin && <Link to="/admin/analytics" onClick={() => trackButtonClicked('analytics', 'dashboard')}>Analytics</Link>}
        </nav>
        <div className={styles.headerActions}>
          <button type="button" className={`${styles.headerHelp} ${styles.headerButton}`} onClick={openSupport} aria-label="Need help? Chat with support">
            <CircleHelp size={18} aria-hidden="true" /><span>Need help?</span>
          </button>
          <button type="button" className={styles.headerButton} onClick={logout} aria-label="Log out">
            <LogOut size={17} aria-hidden="true" /><span>Log out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function PatientFooter() {
  return (
    <footer className={styles.footer}>
      <span>Dr. Jason Shumard <span className={styles.footerSeparator}>/</span> Your health. Your next chapter.</span>
      <a href="#support" onClick={(e) => { e.preventDefault(); openSupport(); }}>We’re here to help <ArrowRight size={14} aria-hidden="true" /></a>
    </footer>
  );
}
