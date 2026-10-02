import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getTemplates, createPlan, createPatient, getPatients, searchPbClients } from '../lib/api';
import { useAuth } from '../auth';
import { normalizeDosageEntry } from '../lib/dosageParser';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Check, Search, User, CalendarDays, Layers, ChevronRight } from 'lucide-react';
import '../styles/plan-workspace.css';
import { toast } from 'sonner';
import PageHeader, { PageContainer } from '../components/PageHeader';

const DEFAULT_PROGRAMS = ['Detox 1', 'Detox 2', 'Maintenance'];
const DEFAULT_STEPS = [1, 2, 3];

export default function NewPlanPage() {
  const [step, setStep] = useState(1);
  const headingRef = useRef(null);
  useEffect(() => {
    if (step > 1) {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.closest('.supp-app')?.scrollTo(0, 0);
    }
  }, [step]);
  const [templates, setTemplates] = useState([]);
  const [templateLoadState, setTemplateLoadState] = useState('loading');
  const [templateRetry, setTemplateRetry] = useState(0);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedStep, setSelectedStep] = useState('');
  const [monthCount, setMonthCount] = useState(1);
  const [searchParams] = useSearchParams();
  const prePatientId = searchParams.get('patient_id') || '';
  const prePatientName = searchParams.get('patient_name') || '';
  const [patientName, setPatientName] = useState(prePatientName);
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
  const [pbQuery, setPbQuery] = useState('');
  const [pbResults, setPbResults] = useState([]);
  const [pbLoading, setPbLoading] = useState(false);
  const [pbError, setPbError] = useState(false);
  const [pbPicked, setPbPicked] = useState(null);
  const [localResults, setLocalResults] = useState([]);
  const [localPatient, setLocalPatient] = useState(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { user: appUser } = useAuth();

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    setTemplateLoadState('loading');
    getTemplates().then(result => {
      if (cancelled) return;
      setTemplates(result.templates || []);
      setTemplateLoadState('ready');
    }).catch(() => { if (!cancelled) setTemplateLoadState('error'); });
    return () => { cancelled = true; };
  }, [appUser, templateRetry]);

  // Search existing records first so a new plan can reuse its patient's history.
  useEffect(() => {
    if (step !== 1 || prePatientId || pbQuery.trim().length < 2) { setPbResults([]); setLocalResults([]); setPbLoading(false); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPbLoading(true);
      try {
        const [local, portal] = await Promise.allSettled([getPatients(pbQuery.trim()), searchPbClients(pbQuery.trim())]);
        if (cancelled) return;
        const patients = local.status === 'fulfilled' ? local.value.patients || [] : [];
        const emails = new Set(patients.map(patient => patient.email?.toLowerCase()).filter(Boolean));
        setLocalResults(patients);
        setPbResults(portal.status === 'fulfilled' ? (portal.value.clients || []).filter(client => !client.email || !emails.has(client.email.toLowerCase())) : []);
        setPbError(portal.status === 'rejected');
      } catch (err) {
        if (cancelled) return;
        setPbResults([]);
        setPbError(true);
      } finally {
        if (!cancelled) setPbLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pbQuery, step, prePatientId]);

  const pickPbClient = (c) => {
    setPatientName([c.first_name, c.last_name].filter(Boolean).join(' '));
    setPbPicked(c);
    setLocalPatient(null);
    setPbQuery('');
    setPbResults([]);
  };

  // If duplicates exist for a program+step, use the most recently updated one
  const selectedTemplate = templates
    .filter(t => (t.program_name || '').trim() === selectedProgram && t.step_number === Number(selectedStep))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  const templateSuppCount = selectedTemplate
    ? (selectedTemplate.months?.length
      ? new Set(selectedTemplate.months.flatMap(m => (m.supplements || []).map(s => s.supplement_name))).size
      : selectedTemplate.supplements?.length || 0)
    : 0;

  const programList = [...new Set([...DEFAULT_PROGRAMS, ...templates.map(t => (t.program_name || '').trim())])].sort();
  const stepList = [...new Set([...DEFAULT_STEPS, ...templates.filter(t => (t.program_name || '').trim() === selectedProgram).map(t => t.step_number)])].sort((a, b) => a - b);

  useEffect(() => {
    if (selectedTemplate) setMonthCount(selectedTemplate.default_months || 1);
  }, [selectedTemplate]);

  const validDuration = monthCount === 0.5 || (Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= 12);
  const canProceed = () => {
    if (step === 1) return patientName.trim().length > 0 && Boolean(planDate);
    if (step === 2) return selectedProgram && selectedStep && validDuration && templateLoadState === 'ready';
    if (step === 3) return patientName.trim().length > 0 && Boolean(planDate) && selectedProgram && selectedStep && validDuration && templateLoadState === 'ready';
    return true;
  };

  const handleCreate = async () => {
    if (creating || !canProceed()) return;
    setCreating(true);
    try {
      let patientId = prePatientId || localPatient?._id || null;
      if (!patientId && patientName.trim()) {
        // Reuse the existing local patient when the picked portal client's email matches
        let existing = null;
        if (pbPicked?.email) {
          const res = await getPatients(pbPicked.email).catch(() => null);
          existing = (res?.patients || []).find(p => (p.email || '').toLowerCase() === pbPicked.email.toLowerCase()) || null;
        }
        if (existing) {
          patientId = existing._id;
        } else {
          const newPatient = await createPatient({
            name: patientName.trim(),
            ...(pbPicked ? { email: pbPicked.email || '', phone: pbPicked.phone || '' } : {}),
          });
          patientId = newPatient._id;
        }
      }

      const data = {
        patient_name: patientName.trim(),
        patient_id: patientId,
        date: planDate,
        program_name: selectedProgram,
        step_label: `Step ${selectedStep}`,
        step_number: Number(selectedStep),
        template_id: selectedTemplate?._id || null,
        months: (() => {
          const templateMonths = selectedTemplate?.months || [];
          const templateSupps = templateMonths.length > 0
            ? templateMonths[0].supplements || []
            : selectedTemplate?.supplements || [];

          const mapSupp = (s) => normalizeDosageEntry({
            supplement_id: s.supplement_id || '',
            supplement_name: s.supplement_name,
            company: s.company || '',
            supplier: s.supplier || '',
            manufacturer: s.manufacturer || s.company || '',
            unit_type: s.unit_type || 'caps',
            quantity_per_dose: s.quantity_per_dose || null,
            frequency_per_day: s.frequency_per_day || null,
            dose_schedule: s.dose_schedule || null,
            dosage_display: s.dosage_display || '',
            instructions: s.instructions || '',
            with_food: true,
            times: s.times || ((s.frequency_per_day || 1) >= 3 ? ['AM', 'Afternoon', 'PM'] : (s.frequency_per_day || 1) === 2 ? ['AM', 'PM'] : ['AM']),
            hc_notes: '',
            units_per_bottle: s.units_per_bottle || null,
            cost_per_bottle: s.cost_per_bottle || 0,
            refrigerate: s.refrigerate || false,
            bottles_needed: null,
            calculated_cost: null,
          });

          // If user's monthCount matches template months, use template month-by-month data
          if (templateMonths.length > 0 && templateMonths.length === Math.ceil(monthCount)) {
            return templateMonths.map((m, i) => ({
              month_number: monthCount === 0.5 && i === 0 ? 0.5 : m.month_number,
              supplements: (m.supplements || []).map(mapSupp),
              monthly_total_cost: 0,
            }));
          }

          // Otherwise create the requested number of months, mapping template
          // months index-wise (extra months repeat the template's last month)
          const numMonths = Math.max(1, Math.ceil(monthCount));
          return Array.from({ length: numMonths }, (_, i) => ({
            month_number: monthCount === 0.5 && i === 0 ? 0.5 : i + 1,
            supplements: (templateMonths.length > 0
              ? templateMonths[Math.min(i, templateMonths.length - 1)].supplements || []
              : templateSupps
            ).map(mapSupp),
            monthly_total_cost: 0,
          }));
        })(),
      };
      const result = await createPlan(data);
      toast.success('Plan created');
      navigate(`/staff/supplements/plans/${result._id}`);
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err?.detail || 'Failed to create plan'));
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const wizardSteps = [
    { num: 1, label: 'Patient', detail: 'Choose who this plan is for' },
    { num: 2, label: 'Protocol', detail: 'Set the program and duration' },
    { num: 3, label: 'Review', detail: 'Confirm, then make it personal' },
  ];
  const durationLabel = monthCount === 0.5 ? '2 weeks' : `${monthCount} month${monthCount === 1 ? '' : 's'}`;
  const previewSupplements = selectedTemplate?.months?.[0]?.supplements || selectedTemplate?.supplements || [];

  return (
    <PageContainer className="plan-create-page">
      <PageHeader title="Create a plan" subtitle="Build a clear, personal supplement protocol.">
        <button onClick={() => navigate(prePatientId ? `/staff/supplements/patients/${prePatientId}` : '/staff/supplements')} className="plan-ui-button plan-ui-button-secondary">
          <ArrowLeft size={15} /> Cancel
        </button>
      </PageHeader>

      <div className="plan-setup-layout">
        <aside className="plan-setup-rail">
          <div className="plan-ui-eyebrow">New patient plan</div>
          <nav aria-label="Plan setup progress" className="plan-setup-steps">
            {wizardSteps.map(ws => (
              <button key={ws.num} type="button" className={`plan-setup-step ${step === ws.num ? 'is-current' : ''} ${step > ws.num ? 'is-complete' : ''}`}
                disabled={ws.num > step} onClick={() => setStep(ws.num)} aria-current={step === ws.num ? 'step' : undefined}>
                <span className="plan-step-number">{step > ws.num ? <Check size={15} /> : `0${ws.num}`}</span>
                <span><strong>{ws.label}</strong><small>{ws.detail}</small></span>
              </button>
            ))}
          </nav>
          <div className="plan-setup-summary">
            <div className="plan-ui-eyebrow">Your plan so far</div>
            <dl>
              <div><dt>Patient</dt><dd>{patientName || 'Not selected'}</dd></div>
              <div><dt>Program</dt><dd>{selectedProgram ? `${selectedProgram} · Step ${selectedStep || '—'}` : 'Not selected'}</dd></div>
              <div><dt>Duration</dt><dd>{selectedProgram ? durationLabel : 'Not selected'}</dd></div>
              <div><dt>Starts</dt><dd>{planDate ? new Date(`${planDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not selected'}</dd></div>
            </dl>
          </div>
          <p className="plan-setup-tip">Start with a protocol, then tailor every supplement, dose and instruction in the editor.</p>
        </aside>

        <section className="plan-setup-main" aria-label="Plan setup">
          <div className="plan-setup-heading">
            <span className="plan-ui-eyebrow">Step {step} of 3</span>
            <h2 ref={headingRef} tabIndex={-1}>{step === 1 ? 'Who is this plan for?' : step === 2 ? 'Choose a starting point.' : 'Ready to make it personal.'}</h2>
            <p>{step === 1 ? 'Find an existing patient, connect a portal record, or enter a new patient.' : step === 2 ? 'Use a template to get started. You can adjust the details after creating the plan.' : 'Check the setup below. Your new plan will open as a draft, ready to edit.'}</p>
          </div>

          <div className="plan-setup-form">
            {step === 1 && (
              <div className="plan-ui-form-stack">
                {!prePatientId && (
                  <div className="plan-ui-field">
                    <Label htmlFor="plan-patient-search">Find a patient</Label>
                    <div className="plan-ui-search-field">
                      <Search size={17} />
                      <Input id="plan-patient-search" value={pbQuery} onChange={e => setPbQuery(e.target.value)} placeholder="Search by name or email" data-testid="wizard-pb-search" autoFocus />
                    </div>
                    {pbLoading && <p className="plan-ui-field-hint" role="status">Searching patient records…</p>}
                    {(localResults.length > 0 || pbResults.length > 0) && (
                      <div className="plan-patient-results">
                        {localResults.length > 0 && <div className="plan-ui-eyebrow">Your patients</div>}
                        {localResults.map(p => <button key={p._id} type="button" onClick={() => { setLocalPatient(p); setPbPicked(null); setPatientName(p.name); setPbQuery(''); setLocalResults([]); setPbResults([]); }} className="plan-patient-result">
                          <span className="plan-ui-person-icon"><User size={16} /></span><span><strong>{p.name}</strong><small>{p.email || 'Existing patient'}</small></span><ChevronRight size={15} />
                        </button>)}
                        {pbResults.length > 0 && <div className="plan-ui-eyebrow">Practice Better</div>}
                        {pbResults.map(c => <button key={c.record_id} type="button" onClick={() => pickPbClient(c)} data-testid="wizard-pb-result" className="plan-patient-result">
                          <span className="plan-ui-person-icon"><User size={16} /></span><span><strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed'}</strong><small>{c.email || 'Portal patient'}</small></span><ChevronRight size={15} />
                        </button>)}
                      </div>
                    )}
                    {pbError && <p className="plan-ui-field-hint">Practice Better is unavailable. You can still select an existing patient or enter their name.</p>}
                    {!pbLoading && pbQuery.trim().length >= 2 && !localResults.length && !pbResults.length && !pbError && <p className="plan-ui-field-hint">No matching patients. Enter their name below to create a patient record.</p>}
                  </div>
                )}
                {(prePatientId || localPatient || pbPicked) && <div className="plan-ui-context-note"><Check size={16} /><span>{prePatientId || localPatient ? 'This plan will be added to the existing patient record.' : `Linked to Practice Better${pbPicked.email ? ` · ${pbPicked.email}` : ''}`}</span></div>}
                <div className="plan-ui-field">
                  <Label htmlFor="plan-patient-name">Patient name <span aria-hidden="true">*</span></Label>
                  <Input id="plan-patient-name" value={patientName} readOnly={Boolean(prePatientId && prePatientName)} onChange={e => { setPatientName(e.target.value); setPbPicked(null); setLocalPatient(null); }} placeholder="Full name" data-testid="wizard-patient-name-input" autoFocus={!!prePatientId} />
                  {!prePatientId && !localPatient && !pbPicked && <p className="plan-ui-field-hint">A new patient record will be created for this name.</p>}
                </div>
                <div className="plan-ui-field plan-ui-field-short">
                  <Label htmlFor="plan-start-date">Plan date <span aria-hidden="true">*</span></Label>
                  <Input id="plan-start-date" type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} data-testid="wizard-date-input" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="plan-ui-form-stack">
                {templateLoadState === 'loading' && <p className="plan-ui-field-hint" role="status">Loading protocol templates…</p>}
                {templateLoadState === 'error' && <div className="plan-template-error" role="alert"><div><strong>Templates could not be loaded.</strong><p>Retry to check which supplements are included in your protocol.</p></div><button type="button" className="plan-ui-button plan-ui-button-secondary" onClick={() => setTemplateRetry(value => value + 1)}>Retry</button></div>}
                <div className="plan-ui-field-grid">
                  <div className="plan-ui-field">
                    <Label htmlFor="plan-program">Program</Label>
                    <Select value={selectedProgram} onValueChange={p => { setSelectedProgram(p); setSelectedStep(''); }}>
                      <SelectTrigger id="plan-program" data-testid="wizard-program-select"><SelectValue placeholder="Choose a program" /></SelectTrigger>
                      <SelectContent className="supp-theme">{programList.filter(Boolean).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="plan-ui-field">
                    <Label htmlFor="plan-protocol-step">Protocol step</Label>
                    <Select value={selectedStep} onValueChange={setSelectedStep} disabled={!selectedProgram}>
                      <SelectTrigger id="plan-protocol-step" data-testid="wizard-step-select"><SelectValue placeholder="Choose a step" /></SelectTrigger>
                      <SelectContent className="supp-theme">{stepList.map(s => <SelectItem key={s} value={String(s)}>Step {s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {templateLoadState === 'ready' && selectedProgram && selectedStep && <div className="plan-template-preview">
                  <div className="plan-template-heading"><Layers size={18} /><div><strong>{selectedTemplate ? 'Template included' : 'Start with an empty protocol'}</strong><p>{selectedTemplate ? `${templateSuppCount} supplements · ${selectedTemplate.default_months || 1} month${selectedTemplate.default_months === 1 ? '' : 's'} recommended` : 'No template is saved for this step. Add supplements in the editor.'}</p></div></div>
                  {previewSupplements.length > 0 && <div className="plan-template-items">{previewSupplements.slice(0, 4).map((s, i) => <span key={`${s.supplement_name}-${i}`}>{s.supplement_name}</span>)}{previewSupplements.length > 4 && <span>+{previewSupplements.length - 4} more</span>}</div>}
                </div>}
                <fieldset className="plan-ui-field">
                  <legend>Plan duration</legend>
                  <div className="plan-duration-options">
                    {[0.5, 1, 2, 3].map(n => <button key={n} type="button" onClick={() => setMonthCount(n)} aria-pressed={monthCount === n} className={`plan-duration-option ${monthCount === n ? 'is-selected' : ''}`}><CalendarDays size={18} /><strong>{n === 0.5 ? '2 weeks' : `${n} month${n === 1 ? '' : 's'}`}</strong>{monthCount === n && <Check size={14} />}</button>)}
                  </div>
                  <div className="plan-custom-duration"><Label htmlFor="plan-month-count">Or set a duration</Label><Input id="plan-month-count" type="number" min={1} max={12} step={1} placeholder="Months" value={monthCount === 0.5 ? '' : monthCount} onChange={e => setMonthCount(e.target.value === '' ? '' : Number(e.target.value))} data-testid="wizard-month-count-input" /><span className="plan-ui-field-hint">1–12 whole months</span></div>
                  {!validDuration && monthCount !== '' && <p className="plan-ui-field-hint" role="alert">Choose 2 weeks above, or enter a whole number from 1 to 12.</p>}
                </fieldset>
              </div>
            )}

            {step === 3 && (
              <div className="plan-ui-form-stack">
                <div className="plan-review-patient"><span className="plan-ui-person-icon"><User size={23} /></span><div><span className="plan-ui-eyebrow">Prepared for</span><h3>{patientName}</h3></div><button className="plan-ui-text-button" onClick={() => setStep(1)}>Edit patient</button></div>
                <dl className="plan-review-details"><div><dt>Program</dt><dd>{selectedProgram} · Step {selectedStep}</dd></div><div><dt>Duration</dt><dd>{durationLabel}</dd></div><div><dt>Plan date</dt><dd>{new Date(`${planDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt>Starting supplements</dt><dd>{templateSuppCount} from template</dd></div></dl>
                <button className="plan-ui-text-button self-start" onClick={() => setStep(2)}>Edit protocol</button>
                <div className="plan-ui-context-note"><Layers size={17} /><span>Next, review the doses and instructions for this patient. You can save and export when the plan is ready.</span></div>
              </div>
            )}
          </div>

          <div className="plan-setup-footer">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1 || creating} className="plan-ui-button plan-ui-button-secondary"><ArrowLeft size={15} /> Back</button>
            {step < 3 ? <button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="plan-ui-button plan-ui-button-primary">{step === 1 ? 'Choose protocol' : 'Review plan'} <ArrowRight size={15} /></button> : <button onClick={handleCreate} disabled={creating || !canProceed()} data-testid="wizard-create-plan-button" className="plan-ui-button plan-ui-button-primary">{creating ? 'Creating plan…' : 'Create & edit plan'} <ArrowRight size={15} /></button>}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
