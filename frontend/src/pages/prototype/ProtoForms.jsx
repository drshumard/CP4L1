import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  ShieldCheck,
  PenLine,
} from 'lucide-react';
import { MOCK } from './protoData';

/* ------------------------------------------------------------------ */
/* Small presentational helpers (kept local - no extra imports)        */
/* ------------------------------------------------------------------ */

function Req() {
  return <span className="proto-req"> *</span>;
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="proto-label">
        {label}
        {required && <Req />}
      </label>
      {children}
      {hint && <p className="proto-hint">{hint}</p>}
    </div>
  );
}

function SectionCard({ eyebrow, title, desc, children }) {
  return (
    <section className="proto-card proto-card--pad">
      <header style={{ marginBottom: 18 }}>
        {eyebrow && (
          <div className="proto-eyebrow" style={{ marginBottom: 6 }}>
            {eyebrow}
          </div>
        )}
        <h3 style={{ fontSize: 18 }}>{title}</h3>
        {desc && (
          <p className="proto-soft" style={{ fontSize: 13.5, marginTop: 4 }}>
            {desc}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/* Grid that is 1-col on mobile, 2-col on desktop */
function TwoCol({ children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">{children}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Static option lists                                                 */
/* ------------------------------------------------------------------ */

const RELATIONSHIP = ['Single', 'Married', 'Divorced', 'Widowed', 'Partnered'];
const GENDER = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
const STATES = ['California', 'Texas', 'Florida', 'New York', 'Washington', 'Arizona', 'Oregon'];
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia'];
const DIAGNOSIS = [
  'Type 2 - no medication',
  'Type 2 - with medication',
  'Pre-diabetic',
  'Non-diabetic',
];
const SEVERITY = ['Minimal', 'Slight', 'Moderate', 'Severe', 'Extreme'];
const MOTIVATION = ['1-2 · Low', '3-4 · Some', '5-6 · Moderate', '7-8 · High', '9-10 · Very high'];

const SYMPTOMS = [
  { group: 'Constitutional', items: ['Fatigue', 'Weight gain', 'Weight loss', 'Fever', 'Night sweats'] },
  { group: 'Endocrine', items: ['Excessive thirst', 'Frequent urination', 'Increased hunger', 'Cold intolerance'] },
  { group: 'Gastrointestinal', items: ['Nausea', 'Bloating', 'Constipation', 'Acid reflux', 'Diarrhea'] },
  { group: 'Neurological', items: ['Headaches', 'Numbness/tingling', 'Dizziness', 'Blurred vision', 'Brain fog'] },
];

const PARTS = [
  { n: 1, label: 'Profile' },
  { n: 2, label: 'HIPAA' },
  { n: 3, label: 'Telehealth' },
];

/* ================================================================== */
/* Page                                                                */
/* ================================================================== */

export default function ProtoForms() {
  const { user } = MOCK;
  const [part, setPart] = useState(1);

  // Medications repeater
  const [meds, setMeds] = useState([
    { id: 1, name: 'Metformin', dosage: '500 mg · 2× daily' },
    { id: 2, name: '', dosage: '' },
  ]);
  const [noMeds, setNoMeds] = useState(false);

  // Symptom toggles
  const [symptoms, setSymptoms] = useState(() => new Set(['Fatigue', 'Excessive thirst']));

  // Consent checkboxes per part
  const [agreed, setAgreed] = useState({ 2: false, 3: false });

  const toggleSymptom = (s) => {
    setSymptoms((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const addMed = () =>
    setMeds((m) => [...m, { id: Date.now(), name: '', dosage: '' }]);
  const removeMed = (id) => setMeds((m) => m.filter((row) => row.id !== id));
  const updateMed = (id, key, val) =>
    setMeds((m) => m.map((row) => (row.id === id ? { ...row, [key]: val } : row)));

  const goPrev = () => setPart((p) => Math.max(1, p - 1));
  const goNext = () => setPart((p) => Math.min(3, p + 1));

  const pct = Math.round(((part - 1) / 2) * 100);

  return (
    <div>
      {/* ---------- Page heading ---------- */}
      <div style={{ marginBottom: 18 }}>
        <div className="proto-eyebrow">Step 2 of 3 · Health profile</div>
        <h1 style={{ marginTop: 6 }}>Tell us about your health</h1>
        <p className="proto-soft" style={{ marginTop: 8, maxWidth: 560, fontSize: 15 }}>
          This helps {MOCK.session.director} prepare for your{' '}
          <span className="proto-brand" style={{ fontWeight: 600 }}>
            {MOCK.session.title}
          </span>
          . It takes about 8 minutes - everything saves automatically as you go.
        </p>
      </div>

      {/* ---------- Part stepper + autosave ---------- */}
      <div
        className="proto-card proto-card--flat"
        style={{
          padding: 14,
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div className="proto-seg" role="tablist" aria-label="Form parts">
          {PARTS.map((p) => (
            <button
              key={p.n}
              type="button"
              className={part === p.n ? 'is-active' : ''}
              onClick={() => setPart(p.n)}
            >
              <span className="proto-mono" style={{ opacity: part === p.n ? 1 : 0.6 }}>
                {p.n}
              </span>{' '}
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
        </div>

        <span
          className="proto-badge proto-badge--ok"
          style={{ marginLeft: 'auto' }}
          aria-live="polite"
        >
          <Check size={13} strokeWidth={3} />
          Saved just now
        </span>

        <div style={{ flexBasis: '100%' }}>
          <div className="proto-track" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* ---------- Active part ---------- */}
      {part === 1 && (
        <DiabetesProfile
          user={user}
          meds={meds}
          noMeds={noMeds}
          setNoMeds={setNoMeds}
          addMed={addMed}
          removeMed={removeMed}
          updateMed={updateMed}
          symptoms={symptoms}
          toggleSymptom={toggleSymptom}
        />
      )}

      {part === 2 && (
        <ConsentPart
          icon={ShieldCheck}
          eyebrow="Part 2 · Consent"
          title="Notice of Privacy Practices"
          subtitle="HIPAA"
          agreed={agreed[2]}
          setAgreed={(v) => setAgreed((a) => ({ ...a, 2: v }))}
        >
          <ConsentNotice>
            <p>
              <strong>This notice describes how medical information about you may be
              used and disclosed and how you can get access to this information.</strong>{' '}
              Please review it carefully.
            </p>
            <p>
              We are required by law to maintain the privacy of your protected health
              information (PHI), to provide you with this notice of our legal duties and
              privacy practices, and to notify affected individuals following a breach of
              unsecured PHI.
            </p>
            <p>
              We may use and disclose your health information for <em>treatment, payment,
              and health care operations</em>. For example, information obtained during your
              consultation will be recorded in your record and used to determine the most
              appropriate course of care.
            </p>
            <p>
              You have the right to inspect and copy your health information, to request
              restrictions, to request confidential communications, and to receive an
              accounting of certain disclosures. To exercise any of these rights, please
              submit your request in writing to our privacy officer.
            </p>
          </ConsentNotice>
        </ConsentPart>
      )}

      {part === 3 && (
        <ConsentPart
          icon={ShieldCheck}
          eyebrow="Part 3 · Consent"
          title="Informed Consent to Telehealth"
          subtitle="Telehealth"
          agreed={agreed[3]}
          setAgreed={(v) => setAgreed((a) => ({ ...a, 3: v }))}
        >
          <div
            className="proto-card proto-card--flat"
            style={{ background: 'var(--brand-50)', padding: 16, marginBottom: 16 }}
          >
            <div className="proto-eyebrow" style={{ marginBottom: 6 }}>
              Treating provider
            </div>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Dr. Shumard</div>
            <p className="proto-soft" style={{ fontSize: 13.5, marginTop: 4 }}>
              1234 Wellness Way, Suite 200
              <br />
              San Diego, CA 92101
              <br />
              <span className="proto-mono">(619) 555-0142</span>
            </p>
          </div>

          <ConsentNotice>
            <p>
              <strong>I understand that telehealth involves the use of electronic
              communications</strong> to enable a health care provider to diagnose,
              consult, and deliver care without an in-person visit.
            </p>
            <p>
              I understand the benefits and risks of telehealth, including the rare
              possibility that information transmitted may be insufficient or that
              technical failures may interrupt the consultation, and I consent to
              proceed.
            </p>
            <p>
              I acknowledge that this initial telehealth consultation has a fee of{' '}
              <strong className="proto-brand">$97</strong>, which is due at the time of
              service and is non-refundable once the consultation has begun.
            </p>
          </ConsentNotice>
        </ConsentPart>
      )}

      {/* ---------- Sticky action bar ---------- */}
      <div className="proto-actionbar">
        <div className="proto-card" style={{ padding: 12, display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="proto-btn proto-btn--secondary"
            disabled={part === 1}
            onClick={goPrev}
          >
            <ChevronLeft size={18} />
            Previous
          </button>

          <div className="hidden sm:flex" style={{ alignItems: 'center', marginLeft: 4 }}>
            <span className="proto-muted" style={{ fontSize: 13 }}>
              Part {part} of 3
            </span>
          </div>

          {part < 3 ? (
            <button
              type="button"
              className="proto-btn proto-btn--primary"
              style={{ marginLeft: 'auto' }}
              onClick={goNext}
            >
              Next
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="proto-btn proto-btn--primary"
              style={{ marginLeft: 'auto' }}
              onClick={() => {}}
            >
              Submit
              <Check size={18} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* PART 1 - Diabetes Profile                                           */
/* ================================================================== */

function DiabetesProfile({
  user,
  meds,
  noMeds,
  setNoMeds,
  addMed,
  removeMed,
  updateMed,
  symptoms,
  toggleSymptom,
}) {
  return (
    <div className="space-y-5">
      {/* About you */}
      <SectionCard eyebrow="Diabetes profile" title="About you">
        <TwoCol>
          <Field label="Legal first name" required>
            <input className="proto-input" defaultValue={user.firstName} />
          </Field>
          <Field label="Legal last name" required>
            <input className="proto-input" defaultValue={user.lastName} />
          </Field>
          <Field label="Preferred name" hint="What should we call you?">
            <input className="proto-input" placeholder="Sarah" />
          </Field>
          <Field label="Email" hint="Used for your appointment details">
            <input className="proto-input" defaultValue={user.email} disabled />
          </Field>
          <Field label="Phone">
            <input className="proto-input" type="tel" placeholder="(555) 000-0000" />
          </Field>
          <Field label="Date of birth" required>
            <input className="proto-input" type="date" />
          </Field>
          <Field label="Relationship status" required>
            <select className="proto-select" defaultValue="">
              <option value="" disabled>
                Select...
              </option>
              {RELATIONSHIP.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select className="proto-select" defaultValue="">
              <option value="" disabled>
                Select...
              </option>
              {GENDER.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Weight" hint="Approximate is fine">
            <input className="proto-input" placeholder="e.g. 165 lb" />
          </Field>
        </TwoCol>
      </SectionCard>

      {/* Address */}
      <SectionCard title="Address">
        <div className="space-y-4 md:space-y-5">
          <TwoCol>
            <Field label="Street" required>
              <input className="proto-input" placeholder="123 Main St" />
            </Field>
            <Field label="Unit">
              <input className="proto-input" placeholder="Apt, suite, etc." />
            </Field>
          </TwoCol>
          <TwoCol>
            <Field label="City" required>
              <input className="proto-input" placeholder="San Diego" />
            </Field>
            <Field label="State" required>
              <select className="proto-select" defaultValue="">
                <option value="" disabled>
                  Select...
                </option>
                {STATES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Postal code" required>
              <input className="proto-input" placeholder="92101" inputMode="numeric" />
            </Field>
            <Field label="Country" required>
              <select className="proto-select" defaultValue="United States">
                {COUNTRIES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          </TwoCol>
        </div>
      </SectionCard>

      {/* Your diagnosis */}
      <SectionCard title="Your diagnosis">
        <div className="space-y-4 md:space-y-5">
          <Field label="Current diagnosis" required>
            <select className="proto-select" defaultValue="">
              <option value="" disabled>
                Select your current status...
              </option>
              {DIAGNOSIS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <TwoCol>
            <Field label="Occupation">
              <input className="proto-input" placeholder="e.g. Teacher" />
            </Field>
            <Field label="Referred by">
              <input className="proto-input" placeholder="Friend, podcast, search..." />
            </Field>
          </TwoCol>
        </div>
      </SectionCard>

      {/* Goals & concerns */}
      <SectionCard
        title="Goals & concerns"
        desc="Be as detailed as you like - this is the heart of your consultation."
      >
        <div className="space-y-4 md:space-y-5">
          <Field label="Your main health problems" required>
            <textarea
              className="proto-textarea"
              placeholder="Tell us what's been going on..."
            />
          </Field>
          <Field label="What you're hoping to get from this consultation" required>
            <textarea
              className="proto-textarea"
              placeholder="Your top goals and questions..."
            />
          </Field>
          <TwoCol>
            <Field label="Severity" required>
              <select className="proto-select" defaultValue="">
                <option value="" disabled>
                  Select...
                </option>
                {SEVERITY.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Motivation level" required hint="How ready are you to make changes?">
              <select className="proto-select" defaultValue="">
                <option value="" disabled>
                  Select...
                </option>
                {MOTIVATION.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          </TwoCol>
        </div>
      </SectionCard>

      {/* Medications & supplements */}
      <SectionCard
        title="Medications & supplements"
        desc="Include anything you take regularly, prescription or over-the-counter."
      >
        <div className="space-y-3">
          {!noMeds &&
            meds.map((row, i) => (
              <div
                key={row.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
              >
                <Field label={i === 0 ? 'Name' : ''}>
                  <input
                    className="proto-input"
                    placeholder="e.g. Metformin"
                    value={row.name}
                    onChange={(e) => updateMed(row.id, 'name', e.target.value)}
                  />
                </Field>
                <Field label={i === 0 ? 'Dosage' : ''}>
                  <input
                    className="proto-input"
                    placeholder="e.g. 500 mg · 2× daily"
                    value={row.dosage}
                    onChange={(e) => updateMed(row.id, 'dosage', e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="proto-btn proto-btn--ghost"
                  aria-label="Remove medication"
                  onClick={() => removeMed(row.id)}
                  disabled={meds.length === 1}
                  style={{ height: 48 }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

          {!noMeds && (
            <button type="button" className="proto-btn proto-btn--ghost" onClick={addMed}>
              <Plus size={17} />
              Add medication
            </button>
          )}

          <label
            className="proto-card proto-card--flat"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              cursor: 'pointer',
              background: noMeds ? 'var(--brand-50)' : '#fff',
            }}
          >
            <input
              type="checkbox"
              checked={noMeds}
              onChange={(e) => setNoMeds(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--brand-600)' }}
            />
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              I'm not taking any medications or supplements
            </span>
          </label>
        </div>
      </SectionCard>

      {/* Review of symptoms */}
      <SectionCard
        title="Review of symptoms"
        desc="Tap anything you've experienced recently. Don't worry about being precise."
      >
        <div className="space-y-5">
          {SYMPTOMS.map((cat) => (
            <div key={cat.group}>
              <div className="proto-eyebrow" style={{ marginBottom: 10 }}>
                {cat.group}
              </div>
              <div className="flex flex-wrap gap-2">
                {cat.items.map((item) => {
                  const active = symptoms.has(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`proto-chip proto-chip--sm ${
                        active ? 'proto-chip--active' : ''
                      }`}
                      aria-pressed={active}
                      onClick={() => toggleSymptom(item)}
                    >
                      {active && <Check size={13} strokeWidth={3} />}
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Allergies */}
      <SectionCard title="Allergies">
        <Field label="Known allergies" hint="Medications, foods, or environmental - or write “None”.">
          <textarea
            className="proto-textarea"
            placeholder="List any known allergies and reactions..."
          />
        </Field>
      </SectionCard>
    </div>
  );
}

/* ================================================================== */
/* Shared consent building blocks (Parts 2 & 3)                        */
/* ================================================================== */

function ConsentNotice({ children }) {
  return (
    <div
      style={{
        maxHeight: 230,
        overflowY: 'auto',
        border: '1px solid var(--p-line-2)',
        borderRadius: 'var(--p-r-sm)',
        padding: 16,
        background: '#fff',
        fontSize: 13.5,
        lineHeight: 1.6,
        color: 'var(--p-ink-soft)',
      }}
      className="space-y-3"
    >
      {children}
    </div>
  );
}

function ConsentPart({ icon: Icon, eyebrow, title, subtitle, children, agreed, setAgreed }) {
  return (
    <div className="space-y-5">
      <SectionCard eyebrow={eyebrow} title={title}>
        <div style={{ marginTop: -8 }}>
          <span className="proto-badge proto-badge--brand" style={{ marginBottom: 16 }}>
            <Icon size={13} />
            {subtitle}
          </span>

          {children}

          <div className="proto-divider" style={{ margin: '20px 0' }} />

          {/* Print name + agreement */}
          <div className="space-y-4">
            <Field label="Print full name" required>
              <input className="proto-input" placeholder="Type your full legal name" />
            </Field>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  marginTop: 2,
                  accentColor: 'var(--brand-600)',
                  flex: 'none',
                }}
              />
              <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>
                I have read and agree to this {subtitle === 'HIPAA' ? 'Notice of Privacy Practices' : 'Telehealth consent'}.
                <Req />
              </span>
            </label>
          </div>

          {/* Signature area */}
          <div style={{ marginTop: 20 }}>
            <div
              className="proto-label"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span>
                Signature
                <Req />
              </span>
              <button type="button" className="proto-btn proto-btn--ghost" style={{ padding: '4px 8px', fontSize: 13 }}>
                Clear
              </button>
            </div>
            <div
              style={{
                height: 140,
                borderRadius: 'var(--p-r-sm)',
                border: '1.5px dashed var(--p-line-2)',
                background:
                  'repeating-linear-gradient(135deg, #fff, #fff 10px, var(--brand-50) 10px, var(--brand-50) 20px)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--p-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <PenLine size={18} />
                Sign here
              </div>
            </div>
            <p className="proto-hint">Signed electronically on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
