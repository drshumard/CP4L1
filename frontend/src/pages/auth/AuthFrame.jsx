import React from 'react';
import logo from '../checkout/dr-shumard-logo.png';
import frame from './welcome.module.css';

// The page frame shared by sign-in, the welcome and the signup landing — design: shumard-checkout-portal/app/welcome.
export default function AuthFrame({ mainId, skipLabel, children }) {
  return (
    <div className={frame.page}>
      {skipLabel && <a href={`#${mainId}`} className={frame.skipLink}>{skipLabel}</a>}
      <header className={frame.header}>
        <a href="https://drshumardworkshop.com" aria-label="Dr. Shumard home">
          <img src={logo} alt="Dr. Shumard" width={1024} height={152} className={frame.logo} />
        </a>
        <span className={frame.portalLabel}>Patient portal</span>
      </header>
      <main id={mainId} className={frame.main}>{children}</main>
      <footer className={frame.footer}>
        <span>A healthier tomorrow starts with you.</span>
        {/* Opens the portal's support pop-up (SupportPopup listens for this event), like the chat button. */}
        <button type="button" onClick={() => window.dispatchEvent(new Event('open-support'))}>Need a hand?</button>
      </footer>
    </div>
  );
}
