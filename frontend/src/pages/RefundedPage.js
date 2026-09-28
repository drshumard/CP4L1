import React, { useEffect } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import AuthFrame from './auth/AuthFrame';
import s from './RefundedPage.module.css';

// Refunded patients (journey step 0) — design: shumard-checkout-portal/app/refunded, inside the sign-in frame. The
// way back: a new consultation (the checkout), or the concierge.

const CHECKOUT_URL = process.env.REACT_APP_CHECKOUT_URL || 'https://drshumardworkshop.com/checkout3';

export default function RefundedPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Account Refunded | Dr. Jason Shumard';
    return () => { document.title = previous; };
  }, []);

  return (
    <AuthFrame mainId="main" skipLabel="Skip to content">
      <div className={s.content}>
        <section aria-labelledby="refunded-title">
          <h1 id="refunded-title">We’re sorry<br /><span>to see you go.</span></h1>
          <p className={s.lead}>Your account has been refunded. We understand that circumstances change, and we respect your decision.</p>
        </section>

        <section className={s.card} aria-labelledby="return-title">
          <div className={s.cardHeader}><span className={s.kicker}>If you change your mind</span></div>
          <div className={s.cardBody}>
            <h2 id="return-title">We’d love to have you back.</h2>
            <p>You can purchase another consultation whenever you’re ready to restart your wellness journey.</p>
            <a href={CHECKOUT_URL} className={s.primary}>Purchase a new consultation <ArrowRight size={18} aria-hidden="true" /></a>
          </div>
          <p className={s.contact}><Mail size={16} aria-hidden="true" /><span>Questions? Contact us at <a href="mailto:concierge@drshumard.com">concierge@drshumard.com</a></span></p>
        </section>
      </div>
    </AuthFrame>
  );
}
