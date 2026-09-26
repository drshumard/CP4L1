import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CircleHelp, Clock, CreditCard, Globe,
  LockKeyhole, Play, ShieldCheck, Sprout, UserRound,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { CheckoutElementsProvider, ExpressCheckoutElement, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAvailability, detectTimezone, getTodayString, isSlotValid } from '../../hooks/useBooking';
import useSortedTimezones from '../admin/scheduling/useSortedTimezones';
import logo from './dr-shumard-logo.png';
import portrait from './dr-shumard-portrait.jpeg';
import './checkout.css';

// Book-first checkout, ported from the shumard-checkout-portal design prototype. The offer column,
// header, FAQ and footer are the prototype's; the checkout card now runs date -> time -> details ->
// payment, holding the chosen slot (POST /api/booking/hold) while the patient pays.

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
// The regular price, used only if /checkout/config can't be reached (the promo price comes from there).
const DEFAULT_PRICE = { display: '$97', display_full: '$97.00' };

const bonuses = [
  { icon: Play, title: '3 Foundations to Boosting Your Health', description: 'A practical video series for your next chapter.', value: '$497', type: 'VIDEO SERIES' },
  { icon: BookOpen, title: 'How to Reverse Your Diabetes', description: 'Dr. Shumard’s guide, in a digital edition.', value: '$39', type: 'EBOOK' },
  { icon: Sprout, title: 'The 7-Day Recipe Challenge', description: 'Simple recipes for your everyday routine.', value: '$97', type: 'RECIPE COLLECTION' },
];

// Timezone math by the browser's Intl engine (DST-correct), as on the Step 1 booking page.
const localDateInTz = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const fmtFullDate = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtMonthYear = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dowShort = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
const dayNum = (ds) => new Date(ds + 'T12:00:00').getDate();
const fmtTime = (iso, tz) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
const fmtSlot = (iso, tz) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' });
const fmtClock = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function Checkout() {
  const detected = useMemo(() => detectTimezone(), []);
  const today = useMemo(() => getTodayString(), []);
  const tzList = useSortedTimezones();
  const tzOptions = useMemo(() => {
    const all = tzList.map((o) => ({ v: o.value, l: o.label }));
    const mine = all.find((o) => o.v === detected);
    const myLabel = mine ? mine.l : detected.split('/').pop().replace(/_/g, ' ');
    return [{ v: detected, l: `${myLabel} (your timezone)` }, ...all.filter((o) => o.v !== detected)];
  }, [tzList, detected]);

  const [stage, setStage] = useState('date'); // date | time | details | payment
  const [tz, setTz] = useState(detected);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [details, setDetails] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [eligible, setEligible] = useState(false);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [banner, setBanner] = useState('');
  const [hold, setHold] = useState(null); // { id, deadline }
  const [remaining, setRemaining] = useState(0);
  const [availDays, setAvailDays] = useState(null);
  const [checkoutVisible, setCheckoutVisible] = useState(true);
  const [payment, setPayment] = useState(null); // { clientSecret, publishableKey } | { error }
  const [price, setPrice] = useState(null); // { display: '$97', display_full: '$97.00' }
  const [busy, setBusy] = useState(false);
  const heading = useRef(null);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Your Strategy Session | Dr. Jason Shumard';
    return () => { document.title = prev; };
  }, []);
  useEffect(() => {
    const checkout = document.getElementById('checkout');
    const observer = new IntersectionObserver(([entry]) => setCheckoutVisible(entry.isIntersecting), { threshold: 0 });
    if (checkout) observer.observe(checkout);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    fetch(`${API}/settings/public`).then((r) => r.json()).then((d) => setAvailDays(d.availability_days || 14)).catch(() => setAvailDays(14));
    fetch(`${API}/checkout/config`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setPrice).catch(() => setPrice(DEFAULT_PRICE));
  }, []);
  useEffect(() => {
    if (!hold) return undefined;
    const tick = () => setRemaining(Math.max(0, Math.round((hold.deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hold]);

  const shouldPoll = stage === 'date' || stage === 'time';
  const { data: availability, isLoading, error: availError, refetch } = useAvailability(today, 60, { enabled: true, refetchInterval: shouldPoll ? 60000 : false });

  // Bucket slots into days of the SELECTED timezone; show the first `availability_days` days.
  const slotsByDate = useMemo(() => {
    if (!availability?.slots) return {};
    const grouped = {};
    for (const slot of availability.slots) {
      const d = localDateInTz(slot.start_time, tz);
      grouped[d] = grouped[d] || [];
      if (!grouped[d].some((s) => s.start_time === slot.start_time)) grouped[d].push(slot);
    }
    Object.keys(grouped).forEach((k) => grouped[k].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    const allowed = new Set(Object.keys(grouped).sort().slice(0, availDays || 14));
    Object.keys(grouped).forEach((k) => { if (!allowed.has(k)) delete grouped[k]; });
    return grouped;
  }, [availability?.slots, tz, availDays]);
  const datesByMonth = useMemo(() => Object.keys(slotsByDate).sort().reduce((acc, d) => {
    (acc[fmtMonthYear(d)] = acc[fmtMonthYear(d)] || []).push(d);
    return acc;
  }, {}), [slotsByDate]);
  const slotsForDate = selectedDate ? (slotsByDate[selectedDate] || []) : [];
  const holdExpired = stage === 'payment' && !!hold && remaining === 0;
  const fee = price || DEFAULT_PRICE;
  const feeHidden = price ? undefined : 'invisible'; // above-the-fold prices wait for the config, so a promo never flashes $97 first
  const stripePromise = useMemo(() => (payment?.publishableKey ? loadStripe(payment.publishableKey) : null), [payment?.publishableKey]);

  function changeStage(next) {
    setStage(next); setError(''); setErrorField('');
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      // Mobile always; desktop only when the card's top (e.g. the hold notice) has scrolled out of view.
      const card = document.getElementById('checkout');
      if (card && (window.innerWidth < 900 || card.getBoundingClientRect().top < 0)) card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  }
  function changeTz(v) { setTz(v); setSelectedDate(null); setSelectedSlot(null); setBanner(''); changeStage('date'); }
  function pickDate(d) { setSelectedDate(d); setSelectedSlot(null); setBanner(''); changeStage('time'); }
  function pickTime(slot) {
    if (!isSlotValid(slot.start_time)) { setBanner('That time has passed — please pick another.'); refetch(); return; }
    setSelectedSlot(slot); setBanner(''); changeStage('details');
  }
  function slotTaken(message) { setHold(null); setPayment(null); setBanner(message); refetch(); changeStage('time'); }
  const setField = (k, v) => { setDetails((d) => ({ ...d, [k]: v })); if (errorField === k) { setErrorField(''); setError(''); } };

  async function continueToPayment(event) {
    event.preventDefault();
    if (busy) return;
    const fail = (field, message) => { setErrorField(field); setError(message); document.getElementById(field)?.focus(); };
    if (!details.firstName.trim()) { fail('firstName', 'Please enter your first name.'); return; }
    if (!details.lastName.trim()) { fail('lastName', 'Please enter your last name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) { fail('email', 'Please enter a valid email address.'); return; }
    const phoneDigits = details.phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) { fail('phone', 'Please enter a phone number with 7–15 digits.'); return; }
    if (!eligible) { fail('eligibility', 'Please review and confirm the consultation requirements.'); return; }
    if (!isSlotValid(selectedSlot.start_time)) { slotTaken('That time has passed — please pick another.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/booking/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: details.firstName.trim(), last_name: details.lastName.trim(), email: details.email.trim(),
          phone: details.phone.trim(), timezone: tz, slot_start_time: selectedSlot.start_time,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { slotTaken('That time was just taken — please pick another.'); return; }
      if (!res.ok) {
        setErrorField('form');
        setError(typeof body.detail === 'string' ? body.detail : 'Something went wrong. Please try again.');
        return;
      }
      setHold({ id: body.hold_id, deadline: Date.now() + body.expires_in_seconds * 1000 });
      setRemaining(body.expires_in_seconds); // same render as the stage change: no 0:00 flash
      // Stripe Checkout Session for this hold (the payment step mounts Stripe's fields with it).
      const sres = await fetch(`${API}/checkout/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hold_id: body.hold_id }),
      });
      const sbody = await sres.json().catch(() => ({}));
      if (sres.status === 409) { slotTaken('Your hold expired — please choose a time again.'); return; }
      setPayment(sres.ok ? { clientSecret: sbody.client_secret, publishableKey: sbody.publishable_key }
        : { error: typeof sbody.detail === 'string' ? sbody.detail : 'We couldn’t start the secure payment. Please try again.' });
      changeStage('payment');
    } catch {
      setErrorField('form');
      setError('We couldn’t reach our server. Please check your connection and try again.');
    } finally { setBusy(false); }
  }

  const stepIndex = stage === 'date' || stage === 'time' ? 1 : stage === 'details' ? 2 : 3;
  const titles = {
    date: ['Choose your day.', 'Pick a date for your strategy session.'],
    time: ['Choose a time.', selectedDate ? fmtFullDate(selectedDate) : ''],
    details: ['Let’s make it personal.', 'Tell us where to send your confirmation.'],
    payment: ['Secure your session.', 'Complete payment to confirm your booking.'],
  };
  const tzRow = (
    <div className="tz-row">
      <Globe size={15} />
      <label htmlFor="tz" className="sr-only">Time zone</label>
      <select id="tz" value={tz} onChange={(e) => changeTz(e.target.value)}>
        {tzOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
  const slotSummary = selectedSlot && (
    <div className="contact-summary">
      <div><span>YOUR SESSION</span><strong>{fmtSlot(selectedSlot.start_time, tz)}</strong><p>30-minute video call · Google Meet</p></div>
      <button type="button" onClick={() => changeStage('time')}>Change</button>
    </div>
  );

  return <div className="co min-h-screen">
    <a href="#checkout" className="skip-link">Skip to checkout</a>
    <header className="site-header"><div className="header-inner">
      <a href="/checkout" className="brand" aria-label="Dr. Jason Shumard — back to the start of checkout"><img src={logo} alt="Dr. Shumard" width={1024} height={152} className="brand-logo" /></a>
      <div className="flex items-center gap-6"><span className="header-security"><LockKeyhole size={14} /> Secure checkout</span><a className="help-link" href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer"><CircleHelp size={17} /><span>Need help?</span></a></div>
    </div></header>

    <main className="page-shell">
      <div className="checkout-layout">
        <section className="offer-column" aria-labelledby="offer-title">
          <div className="intro"><h1 id="offer-title">A clearer path.<br />A healthier <span>you.</span></h1><p className="intro-copy">Get on the fastest and simplest path to <strong>reversing your diabetes</strong> for good.</p></div>
          <section className="consultation-overview" aria-labelledby="session-title">
            {/* On mobile the summary sits above the checkout card and the doctor below it (checkout.css) */}
            <div className="consultation-summary">
              <div className="consultation-head">
                <div>
                  <span className="consultation-kicker"><CalendarDays size={18} strokeWidth={1.8} /> Private one-to-one consultation</span>
                  <h2 id="session-title">Diabetes Reversal Strategy Session</h2>
                </div>
                <div className="offer-price" aria-label={`A $1,100 value, available today for ${fee.display}`}>
                  <span>Session value</span>
                  <s>$1,100</s>
                  <strong className={feeHidden}>{fee.display} <small>today</small></strong>
                </div>
              </div>
              <p className="session-description">A private, focused conversation about your health, your questions, and the clearest next steps for you.</p>
              <p className="included-heading">During your session, you’ll:</p>
              <ul className="session-benefits"><li><Check size={17} /> Explore the factors affecting your metabolic health</li><li><Check size={17} /> Understand your current health assessment</li><li><Check size={17} /> Leave with a personalized action plan</li></ul>
            </div>
            <div className="doctor-proof"><img src={portrait} alt="Dr. Jason Shumard" width={1000} height={1250} className="doctor-avatar" /><div><span>Your consultation is with</span><strong>Dr. Jason Shumard, DC</strong><p>Doctor of Chiropractic · Functional Medicine</p></div><div className="experience-mark"><ShieldCheck size={20} /><span>20+ years of<br />clinical experience</span></div></div>
          </section>
          <div className="bonuses-section"><div className="section-label"><h3>More support. Included.</h3><span>3 complimentary resources</span></div><div className="bonus-list">{bonuses.map(({ icon: Icon, title, description, value, type }) => <div className="bonus-row" key={title}><span className="bonus-icon"><Icon size={19} strokeWidth={1.6} /></span><div className="min-w-0 flex-1"><span className="bonus-type">{type}</span><h4>{title}</h4><p>{description}</p></div><div className="bonus-value"><s>{value}</s><span>Included</span></div></div>)}</div></div>
          <div className="offer-bottom"><ShieldCheck size={18} /><p>A thoughtful first step, with a plan built around you.</p></div>
        </section>
        <section id="checkout" className="checkout-column" aria-labelledby="checkout-title">
          <div className="checkout-card">
            <div className="checkout-topline"><span><LockKeyhole size={13} /> YOUR RESERVATION</span></div>
            <h2 id="checkout-title" ref={heading} tabIndex={-1}>{titles[stage][0]}</h2><p className="checkout-subtitle">{titles[stage][1]}</p>
            <ol className="steps" aria-label="Checkout progress">
              <li aria-current={stepIndex === 1 ? 'step' : undefined} className="active"><span>{stepIndex > 1 ? <Check size={13} /> : '1'}</span>Date &amp; time</li>
              <li className="step-line" aria-hidden="true" />
              <li aria-current={stepIndex === 2 ? 'step' : undefined} className={stepIndex >= 2 ? 'active' : ''}><span>{stepIndex > 2 ? <Check size={13} /> : '2'}</span>Details</li>
              <li className="step-line" aria-hidden="true" />
              <li aria-current={stepIndex === 3 ? 'step' : undefined} className={stepIndex === 3 ? 'active' : ''}><span>3</span>Payment</li>
            </ol>

            {stage === 'date' && <div>
              {tzRow}
              {banner && <p className="form-error" role="alert">{banner}</p>}
              {isLoading || availDays === null ? <p className="preview-notice"><Clock size={16} /> Loading available dates…</p>
                : availError ? <p className="form-error" role="alert">We couldn’t load available times. <button type="button" className="inline-link" onClick={() => refetch()}>Try again</button></p>
                  : !Object.keys(slotsByDate).length ? <p className="preview-notice"><CalendarDays size={16} /> No times are open right now. Please check back soon.</p>
                    : Object.entries(datesByMonth).map(([month, ds]) => <div key={month}>
                      <p className="month-label">{month.toUpperCase()}</p>
                      <div className="date-grid">{ds.map((d) => <button type="button" key={d} className="date-chip" onClick={() => pickDate(d)} aria-label={`${fmtFullDate(d)}, ${slotsByDate[d].length} times available`}>
                        <span className="dow">{dowShort(d)}</span><span className="day">{dayNum(d)}</span><span className="count">{slotsByDate[d].length} {slotsByDate[d].length === 1 ? 'time' : 'times'}</span>
                      </button>)}</div>
                    </div>)}
            </div>}

            {stage === 'time' && <div>
              {tzRow}
              {banner && <p className="form-error" role="alert">{banner}</p>}
              {slotsForDate.length
                ? <div className="time-grid">{slotsForDate.map((s) => <button type="button" key={s.start_time} className="time-chip" onClick={() => pickTime(s)}>{fmtTime(s.start_time, tz)}</button>)}</div>
                : <p className="preview-notice"><Clock size={16} /> No times left on this day. Please choose another date.</p>}
              <button type="button" className="back-button" onClick={() => changeStage('date')}><ArrowLeft size={14} /> Choose another date</button>
            </div>}

            {stage === 'details' && <form noValidate onSubmit={continueToPayment} className="details-form">
              {slotSummary}
              <div className="form-title"><UserRound size={17} /><h3>Your contact details</h3></div>
              <div className="name-row">
                <label htmlFor="firstName">First name<input id="firstName" name="given-name" autoComplete="given-name" placeholder="First name" required maxLength={50} aria-invalid={errorField === 'firstName'} aria-describedby={errorField === 'firstName' ? 'firstName-error' : undefined} value={details.firstName} onChange={(e) => setField('firstName', e.target.value)} />{errorField === 'firstName' && <span id="firstName-error" className="field-error" role="alert">{error}</span>}</label>
                <label htmlFor="lastName">Last name<input id="lastName" name="family-name" autoComplete="family-name" placeholder="Last name" required maxLength={50} aria-invalid={errorField === 'lastName'} aria-describedby={errorField === 'lastName' ? 'lastName-error' : undefined} value={details.lastName} onChange={(e) => setField('lastName', e.target.value)} />{errorField === 'lastName' && <span id="lastName-error" className="field-error" role="alert">{error}</span>}</label>
              </div>
              <div className="field-group"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required maxLength={254} aria-invalid={errorField === 'email'} aria-describedby={errorField === 'email' ? 'email-error' : 'email-hint'} value={details.email} onChange={(e) => setField('email', e.target.value)} />{errorField === 'email' ? <span id="email-error" className="field-error" role="alert">{error}</span> : <span id="email-hint" className="field-hint">Your confirmation and next steps will be sent here.</span>}</div>
              <label htmlFor="phone">Phone number<input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 000-0000" required maxLength={30} aria-invalid={errorField === 'phone'} aria-describedby={errorField === 'phone' ? 'phone-error' : undefined} value={details.phone} onChange={(e) => setField('phone', e.target.value)} />{errorField === 'phone' && <span id="phone-error" className="field-error" role="alert">{error}</span>}</label>
              <div className="eligibility-box"><div className="flex items-start gap-3"><Checkbox id="eligibility" checked={eligible} onCheckedChange={(v) => { setEligible(v === true); if (errorField === 'eligibility') { setErrorField(''); setError(''); } }} className="mt-0.5 size-[18px] rounded-[4px] border-[#dce0e7] bg-white shadow-sm focus-visible:border-[#3565e9] focus-visible:ring-[3px] focus-visible:ring-[#3565e9]/50 data-[state=checked]:border-[#3565e9] data-[state=checked]:bg-[#3565e9] data-[state=checked]:text-white" aria-invalid={errorField === 'eligibility' && !!error} aria-describedby={errorField === 'eligibility' && error ? 'eligibility-policy eligibility-error' : 'eligibility-policy'} /><label htmlFor="eligibility" className="eligibility-label">I confirm this consultation is right for me.</label></div><p id="eligibility-policy">I confirm that I (or the person I am booking for) have been diagnosed with Type 2 diabetes. I understand that this appointment is NOT for pre-diabetics. Also if you have a significant other they are REQUIRED to be part of the consultation. If these conditions are NOT met you are not eligible for a refund and this consultation fee of {fee.display} is NON-REFUNDABLE.</p></div>{/* quoted in the receipt: keep in sync with POLICY_TEXT in backend/checkout.py */}
              {errorField === 'eligibility' && error && <p id="eligibility-error" className="form-error" role="alert">{error}</p>}
              {errorField === 'form' && error && <p className="form-error" role="alert">{error}</p>}
              <OrderTotal amount={fee.display_full} />
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Holding your time…' : <>Continue to payment<ArrowRight size={18} /></>}</button>
              <p className="under-button"><LockKeyhole size={12} /> You won’t be charged on this step.</p>
            </form>}

            {stage === 'payment' && <div className="payment-stage">
              <div className="contact-summary"><div><span>CONTACT DETAILS</span><strong>{details.firstName} {details.lastName}</strong><p>{details.email}</p></div><button type="button" onClick={() => changeStage('details')}>Edit</button></div>
              {holdExpired
                ? <div className="hold-notice expired" role="alert"><Clock size={16} /><p>Your 15-minute hold on {fmtSlot(selectedSlot.start_time, tz)} has expired. <button type="button" className="inline-link" onClick={() => slotTaken('Your hold expired — please choose a time again.')}>Pick a time again</button></p></div>
                : <div className="hold-notice" role="status"><Clock size={16} /><p>We’re holding <strong>{fmtSlot(selectedSlot.start_time, tz)}</strong> for you for 15 minutes. Complete payment within <strong>{fmtClock(remaining)}</strong> to keep it.</p></div>}
              {payment?.clientSecret
                ? <CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret: payment.clientSecret, elementsOptions: { appearance: STRIPE_APPEARANCE, fonts: STRIPE_FONTS } }}>
                  <StripePayment holdExpired={holdExpired} />
                </CheckoutElementsProvider>
                : <p className="form-error" role="alert">{payment?.error || 'We couldn’t start the secure payment. Please try again.'}</p>}
              <button type="button" className="back-button" onClick={() => changeStage('details')}><ArrowLeft size={14} /> Back to your details</button>
            </div>}
            <div className="checkout-footer"><span><ShieldCheck size={15} /> Private &amp; secure</span><span className="powered-by">Payments by <strong>stripe</strong></span></div>
          </div>
          <div className="questions"><Accordion type="single" collapsible>
            <AccordionItem value="who" className="border-[#e2e5eb]"><AccordionTrigger className="text-[14px] rounded-md focus-visible:ring-[3px] focus-visible:ring-[#3565e9]/50">Who is this consultation for?</AccordionTrigger><AccordionContent className="text-[14px] leading-6 text-slate-600">This consultation is for people diagnosed with Type 2 diabetes. It is not for prediabetes. If you have a significant other, they are required to attend with you.</AccordionContent></AccordionItem>
            <AccordionItem value="included" className="border-[#e2e5eb]"><AccordionTrigger className="text-[14px] rounded-md focus-visible:ring-[3px] focus-visible:ring-[#3565e9]/50">Is this a one-time payment?</AccordionTrigger><AccordionContent className="text-[14px] leading-6 text-slate-600">Yes. The {fee.display} payment covers the strategy session and the three resources listed on this page. This checkout does not start a subscription.</AccordionContent></AccordionItem>
            <AccordionItem value="refund" className="border-b-0"><AccordionTrigger className="text-[14px] rounded-md focus-visible:ring-[3px] focus-visible:ring-[#3565e9]/50">What should I know before booking?</AccordionTrigger><AccordionContent className="text-[14px] leading-6 text-slate-600">Please review the eligibility requirements before payment. The {fee.display} consultation fee is non-refundable if those conditions are not met. For other cancellation or refund questions, <a className="underline" href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer">contact the team</a> before booking.</AccordionContent></AccordionItem>
          </Accordion></div>
        </section>
      </div>
      <footer className="site-footer"><div><span>© 2026 Dr. Jason Shumard.</span><p>Individual results vary. A consultation does not guarantee a particular health outcome.</p></div><div className="footer-links"><a href="https://drshumardworkshop.com/legal-disclaimer-and-privacy-policy" target="_blank" rel="noreferrer">Privacy</a><a href="https://drshumardworkshop.com/terms-and-condition" target="_blank" rel="noreferrer">Terms</a><a href="https://drshumardworkshop.com/contact-us" target="_blank" rel="noreferrer">Contact</a></div></footer>
    </main>
    {stage === 'date' && !checkoutVisible && <div className="mobile-bar"><div><strong>{fee.display} <span>USD</span></strong><p>Session + 3 resources</p></div><a href="#checkout">Reserve your session<ArrowRight size={16} /></a></div>}
  </div>;
}

// Stripe's fields render inside Stripe's iframe: match the design's tokens there (inputs, focus ring, font).
const STRIPE_APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#3565e9', colorBackground: '#ffffff', colorText: '#20242c', colorDanger: '#b42318',
    fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif', fontSizeBase: '16px', borderRadius: '7px', spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #dfe3e9', boxShadow: '0 1px 2px #15274b04' },
    '.Input:focus': { borderColor: '#7c91cf', boxShadow: '0 0 0 3px #eaf0ff' },
    '.Label': { color: '#3c4554', fontWeight: '500', fontSize: '14px' },
  },
};
const STRIPE_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..600&display=swap' }];

// Payment Element (+ Apple/Google Pay where the device supports them) for the held slot. On success
// Stripe redirects to /checkout/complete; the booking itself is made by the webhook.
function StripePayment({ holdExpired }) {
  const state = useCheckoutElements();
  const [wallets, setWallets] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  if (state.type === 'loading') return <p className="preview-notice"><LockKeyhole size={16} /> Loading secure payment…</p>;
  if (state.type === 'error') return <p className="form-error" role="alert">{state.error.message}</p>;
  const { checkout } = state;
  const amount = checkout.total.total.amount;
  const confirm = async (args) => {
    if (paying || holdExpired) return;
    setPaying(true); setPayError('');
    const result = await checkout.confirm(args);
    // A card decline is already shown inside Stripe's card field; wallets and other errors aren't.
    if (result.type === 'error' && (args || result.error.code !== 'paymentFailed')) setPayError(result.error.message);
    setPaying(false);
  };
  return <>
    <ExpressCheckoutElement onReady={({ availablePaymentMethods }) => setWallets(!!availablePaymentMethods)}
      onConfirm={(event) => confirm({ expressCheckoutConfirmEvent: event })} />
    {wallets && <div className="or-divider"><span />or pay with card<span /></div>}
    <div className="card-preview"><div className="flex items-center gap-2 font-medium"><CreditCard size={17} /> Card details</div><div className="stripe-payment"><PaymentElement options={{ layout: { type: 'accordion', defaultCollapsed: false }, paymentMethodOrder: ['card'] }} /></div></div>
    {payError && <p className="form-error" role="alert">{payError}</p>}
    <OrderTotal amount={amount} />
    <button type="button" disabled={paying || holdExpired} className="primary-button" onClick={() => confirm()}>{paying ? 'Processing…' : `Reserve my session · ${amount.replace(/\.00$/, '')}`}{!paying && <ArrowRight size={18} />}</button>
    <p className="under-button"><LockKeyhole size={12} /> Secure payment by Stripe · One-time charge</p>
  </>;
}

function OrderTotal({ amount }) {
  const [, whole = amount, cents = ''] = amount.match(/^(.*?)([.,]\d{2})$/) || [];
  return <div className="order-total"><div className="order-line"><span>Strategy session + 3 resources</span><span>{amount}</span></div><div className="total-line"><span>Total today <span className="currency">USD</span></span><strong>{whole}<span>{cents}</span></strong></div><p><Check size={13} /> One-time payment. No subscription.</p></div>;
}
