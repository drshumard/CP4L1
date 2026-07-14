import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  LogOut, Home, HelpCircle, ArrowLeft, ArrowRight, CheckCircle2, Check, Loader2, Plus, Trash2,
  User, MapPin, Stethoscope, Target, FileText, Pill, Activity, AlertTriangle,
  FlaskConical, Users, ShieldCheck, Video, PenLine,
} from 'lucide-react';
import SafeSignatureCanvas from '../components/ui/SafeSignatureCanvas';
import ProtoSelect from './prototype/ProtoSelect';
import AddressAutocomplete from './prototype/AddressAutocomplete';
import './prototype/proto.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGO = 'https://portal-drshumard.b-cdn.net/logo.png';

/* ------------------------------------------------------------------ options */
const RELATIONSHIP_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated', 'Partnered'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const COUNTRY_OPTIONS = [
  'United States', 'Argentina', 'Bahamas', 'Barbados', 'Belize', 'Bolivia', 'Brazil', 'Canada',
  'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Dominican Republic', 'Ecuador', 'El Salvador',
  'Guatemala', 'Guyana', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua', 'Panama',
  'Paraguay', 'Peru', 'Puerto Rico', 'Suriname', 'Trinidad and Tobago', 'Uruguay', 'Venezuela',
];

// Default the Country field from the visitor's browser locale when it maps to one of our
// supported options; otherwise fall back to United States. Saved form data still overrides this.
function detectLocaleCountry() {
  try {
    const lang = navigator.language || '';
    const region = new Intl.Locale(lang).maximize().region || (lang.split('-')[1] || '').toUpperCase();
    if (!region) return null;
    // Intl renders some names with "&" (e.g. "Trinidad & Tobago"); our options spell out "and".
    const name = (new Intl.DisplayNames(['en'], { type: 'region' }).of(region) || '').replace(' & ', ' and ');
    return COUNTRY_OPTIONS.includes(name) ? name : null;
  } catch {
    return null;
  }
}
const DEFAULT_COUNTRY = detectLocaleCountry() || 'United States';

const US_STATE_OPTIONS = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'District of Columbia', 'Puerto Rico', 'Guam', 'American Samoa',
  'U.S. Virgin Islands', 'Northern Mariana Islands',
];
const DIAGNOSIS_OPTIONS = [
  'Type 2 Diabetes no medication',
  'Type 2 Diabetes with medication',
  'Pre-Diabetic with medication',
  'Pre-Diabetic no medication',
  'Non-Diabetic',
];
const SEVERITY_OPTIONS = [
  { value: 'Minimal', label: 'Minimal', desc: 'annoying but causing no limitation' },
  { value: 'Slight', label: 'Slight', desc: 'tolerable but causing a little limitation' },
  { value: 'Moderate', label: 'Moderate', desc: 'sometimes tolerable but definitely causing limitation' },
  { value: 'Severe', label: 'Severe', desc: 'causing significant limitation' },
  { value: 'Extreme', label: 'Extreme', desc: 'causing near constant limitation (>80% of the time)' },
];
const MOTIVATION_OPTIONS = [
  { value: '1-3', label: '1-3 (Low)' },
  { value: '4-6', label: '4-6 (Moderate)' },
  { value: '7-8', label: '7-8 (High)' },
  { value: '9-10', label: '9-10 (Very High)' },
];
const SYMPTOM_CATEGORIES = {
  CONSTITUTIONAL: ['Fatigue', 'Recent weight change', 'Fever'],
  EYES: ['Blurred/Double vision', 'Glasses/contacts', 'Eye disease or injury'],
  'EAR/NOSE/MOUTH/THROAT': [
    'Swollen glands in neck', 'Hearing loss or ringing', 'Earaches or drainage',
    'Chronic sinus problems or rhinitis', 'Nose bleeds', 'Mouth sores/Bleeding gums',
    'Bad breath/Bad taste', 'Sore throat or voice changes',
  ],
  PSYCHIATRIC: ['Insomnia', 'Memory loss or confusion', 'Nervousness', 'Depression'],
  GENITOURINARY: [
    'Frequent urination', 'Burning or painful urination', 'Blood in urine',
    'Change in force of urinating', 'Kidney stones', 'Sexual difficulty', 'Male: testicle pain',
    'Female: pain/irregular periods', 'Female: pregnant', 'Bladder infections', 'Kidney disease',
    'Hemorrhoids',
  ],
  GASTROINTESTINAL: [
    'Abdominal pain', 'Nausea or vomiting', 'Rectal bleeding/Blood in stool',
    'Painful burn/Constipation', 'Ulcer', 'Change in bowel movement', 'Frequent diarrhea',
    'Loss of appetite',
  ],
  ENDOCRINE: [
    'Glandular or hormone problem', 'Excessive thirst or urination', 'Heat or cold intolerance',
    'Skin becoming dryer', 'Change in hat or glove size', 'Diabetes', 'Thyroid disease',
  ],
  MUSCULOSKELETAL: [
    'Back Pain', 'Joint Pain', 'Joint stiffness and swelling', 'Muscle pain or cramps',
    'Muscle or joint weakness', 'Difficulty walking', 'Cold extremities',
  ],
  INTEGUMENTARY: [
    'Change in skin color', 'Change in hair or nails', 'Varicose veins', 'Breast pain/discharge',
    'Breast lump', 'Hives or eczema', 'Rash or itching',
  ],
  NEUROLOGICAL: [
    'Freq/Recurring headaches', 'Migraine headache', 'Convulsions or seizures',
    'Numbness or tingling', 'Tremors', 'Paralysis', 'Head injury', 'Light headed or dizzy',
    'Stroke',
  ],
  'HEMATOLOGIC/LYMPHATIC': [
    'Slow to heal after cuts', 'Easy bleeding or bruising', 'Anemia', 'Phlebitis',
    'Enlarged glands', 'Blood or plasma transfusion', 'Hepatitis', 'Cancer',
  ],
};
const RECENT_TEST_OPTIONS = ['Lab work', 'X-rays', 'CT scan', 'MRI', 'Ultrasound', 'EKG', 'Other'];

/* ------------------------------------------------------- field labels (val) */
const FIELD_LABELS = {
  legalFirstName: 'Legal First Name', legalLastName: 'Legal Last Name', dateOfBirth: 'Date of Birth',
  relationshipStatus: 'Relationship Status', street: 'Street', town: 'Town/City', country: 'Country',
  state: 'State/Province', postalCode: 'Postal Code', mainProblems: 'List Your Main Problems',
  hopedOutcome: 'Hoped Outcome', noSolutionOutcome: 'No Solution Outcome',
  severityLevel: 'Severity of your problem', motivationLevel: 'Motivation Level',
  medications: 'Medications and Supplements',
  hipaaPrintName: 'HIPAA Print Name', hipaaAgreed: 'HIPAA Agreement', hipaaSignature: 'HIPAA Signature',
  telehealthPrintName: 'Telehealth Print Name', telehealthAgreed: 'Telehealth Agreement',
  telehealthSignature: 'Telehealth Signature',
};

const fmtCurrentDate = (d) => (d instanceof Date && !isNaN(d))
  ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  : '';
const liveDateStr = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const formatUSPhone = (v) => {
  let d = (v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1); // drop US country code
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

/* ================================================================= component */
export default function PortalForms() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    legalFirstName: '', legalLastName: '', preferredFirstName: '',
    street: '', unit: '', town: '', state: '', postalCode: '', country: DEFAULT_COUNTRY,
    email: '', phone: '',
    dateOfBirth: null,
    relationshipStatus: '', gender: '', weight: '',
    currentDate: new Date(),
    currentDiagnosis: '', occupation: '', referredBy: '',
    mainProblems: '', hopedOutcome: '', noSolutionOutcome: '',
    previousInterventions: '', severityLevel: '', motivationLevel: '',
    priorMedicalHistory: '',
    medications: [{ name: '', dosage: '' }],
    noMedications: false,
    symptoms: {},
    allergies: '',
    recentTests: [],
    otherProviders: '',
  });

  // consent state
  const [hipaaSignature, setHipaaSignature] = useState(null);
  const [hipaaAgreed, setHipaaAgreed] = useState(false);
  const [hipaaPrintName, setHipaaPrintName] = useState('');
  const hipaaSignatureRef = useRef(null);

  const [telehealthPrintName, setTelehealthPrintName] = useState('');
  const [telehealthSignature, setTelehealthSignature] = useState(null);
  const [telehealthAgreed, setTelehealthAgreed] = useState(false);
  const telehealthSignatureRef = useRef(null);

  // flow / status
  const [currentPart, setCurrentPart] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const printNameManuallyEdited = useRef(false);
  const saveTimer = useRef(null);
  const hasLoadedOnce = useRef(false);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('access_token')}`,
  }), []);

  const handleInputChange = useCallback((key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Fill the address columns from a chosen autocomplete suggestion (non-empty parts only).
  const handleAddressPick = useCallback((parts) => {
    setFormData((prev) => {
      const next = { ...prev };
      Object.entries(parts).forEach(([k, v]) => { if (v) next[k] = v; });
      return next;
    });
  }, []);

  /* --------------------------------------------- medications / symptom utils */
  const addMedicationRow = () =>
    setFormData((p) => ({ ...p, medications: [...p.medications, { name: '', dosage: '' }] }));
  const removeMedicationRow = (index) =>
    setFormData((p) => ({ ...p, medications: p.medications.filter((_, i) => i !== index) }));
  const updateMedication = (index, field, value) =>
    setFormData((p) => ({
      ...p,
      medications: p.medications.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));
  const toggleNoMedications = (checked) =>
    setFormData((p) => ({
      ...p,
      noMedications: checked,
      medications: checked ? [{ name: '', dosage: '' }] : p.medications,
    }));
  const toggleSymptom = (category, symptom) =>
    setFormData((p) => {
      const current = p.symptoms[category] || [];
      const next = current.includes(symptom)
        ? current.filter((s) => s !== symptom)
        : [...current, symptom];
      return { ...p, symptoms: { ...p.symptoms, [category]: next } };
    });
  const toggleRecentTest = (test) =>
    setFormData((p) => ({
      ...p,
      recentTests: p.recentTests.includes(test)
        ? p.recentTests.filter((t) => t !== test)
        : [...p.recentTests, test],
    }));

  /* --------------------------------------------------------- load on mount */
  useEffect(() => {
    (async () => {
      // prefill from /user/me
      try {
        const { data: u } = await axios.get(`${API}/user/me`, { headers: authHeaders() });
        const parts = (u.name || '').trim().split(' ');
        setFormData((prev) => ({
          ...prev,
          legalFirstName: prev.legalFirstName || u.first_name || parts[0] || '',
          legalLastName: prev.legalLastName || u.last_name || parts.slice(1).join(' ') || '',
          email: prev.email || u.email || '',
          phone: prev.phone || u.phone || '',
        }));
      } catch { /* best-effort */ }

      // restore saved form
      try {
        const { data } = await axios.get(`${API}/user/intake-form`, { headers: authHeaders() });
        const saved = data?.form_data;
        if (saved?.profileData) {
          const pd = saved.profileData;
          setFormData((prev) => ({
            ...prev,
            ...pd,
            dateOfBirth: pd.dateOfBirth ? new Date(pd.dateOfBirth) : null,
            currentDate: pd.currentDate ? new Date(pd.currentDate) : new Date(),
            medications: (pd.medications && pd.medications.length) ? pd.medications : [{ name: '', dosage: '' }],
            symptoms: pd.symptoms || {},
            recentTests: pd.recentTests || [],
          }));
        }
        if (saved) {
          if (saved.hipaaSignature) setHipaaSignature(saved.hipaaSignature);
          if (saved.hipaaAgreed) setHipaaAgreed(saved.hipaaAgreed);
          if (saved.hipaaPrintName) { setHipaaPrintName(saved.hipaaPrintName); printNameManuallyEdited.current = true; }
          if (saved.telehealthPrintName) { setTelehealthPrintName(saved.telehealthPrintName); printNameManuallyEdited.current = true; }
          if (saved.telehealthSignature) setTelehealthSignature(saved.telehealthSignature);
          if (saved.telehealthAgreed) setTelehealthAgreed(saved.telehealthAgreed);
          if (saved.currentPart) setCurrentPart(saved.currentPart);
        }
        if (data?.last_saved) setLastSaved(new Date(data.last_saved));
      } catch {
        // No saved form data found
      } finally {
        setLoaded(true);
        hasLoadedOnce.current = true;
      }
    })();
  }, []);

  /* ------------------------------------ auto-fill print names from legal name */
  useEffect(() => {
    if (printNameManuallyEdited.current) return;
    const full = `${formData.legalFirstName} ${formData.legalLastName}`.trim();
    if (full) {
      setHipaaPrintName(full);
      setTelehealthPrintName(full);
    }
  }, [formData.legalFirstName, formData.legalLastName]);

  /* ----------------------------------------------------- build save payload */
  const buildFormData = useCallback((forSubmit) => {
    // re-read signatures from canvas refs if non-empty
    let hSig = hipaaSignature;
    let tSig = telehealthSignature;
    if (hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
      hSig = hipaaSignatureRef.current.toDataURL('image/png');
    }
    if (telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty()) {
      tSig = telehealthSignatureRef.current.toDataURL('image/png');
    }
    const profileData = {
      ...formData,
      dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth.toISOString() : null,
      currentDate: (formData.currentDate instanceof Date ? formData.currentDate : new Date()).toISOString(),
    };
    if (forSubmit) {
      return {
        profileData,
        hipaaSignature: hSig,
        hipaaPrintName,
        hipaaSignedAt: new Date().toISOString(),
        telehealthPrintName,
        telehealthSignature: tSig,
        telehealthSignedAt: new Date().toISOString(),
      };
    }
    return {
      profileData,
      hipaaSignature: hSig,
      hipaaAgreed,
      hipaaPrintName,
      telehealthPrintName,
      telehealthSignature: tSig,
      telehealthAgreed,
      currentPart,
    };
  }, [formData, hipaaSignature, hipaaAgreed, hipaaPrintName, telehealthPrintName, telehealthSignature, telehealthAgreed, currentPart]);

  /* ------------------------------------------------------------ save progress */
  const saveProgress = useCallback(async (showToast = false) => {
    try {
      setIsSaving(true);
      const { data } = await axios.post(
        `${API}/user/intake-form/save`,
        { form_data: buildFormData(false) },
        { headers: authHeaders() },
      );
      setLastSaved(data?.last_saved ? new Date(data.last_saved) : new Date());
      if (showToast) toast.success('Progress saved!');
    } catch {
      if (showToast) toast.error('Could not save progress.');
    } finally {
      setIsSaving(false);
    }
  }, [authHeaders, buildFormData]);

  /* --------------------------------------------------- debounced autosave 3s */
  useEffect(() => {
    if (!hasLoadedOnce.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveProgress(false); }, 3000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [formData, hipaaSignature, hipaaAgreed, hipaaPrintName, telehealthPrintName, telehealthSignature, telehealthAgreed]);

  /* ------------------------------------------------------------- validation */
  const validatePart1 = () => {
    const missing = [];
    const reqText = ['legalFirstName', 'legalLastName', 'relationshipStatus', 'street', 'town',
      'country', 'state', 'postalCode', 'mainProblems', 'hopedOutcome', 'noSolutionOutcome',
      'severityLevel', 'motivationLevel'];
    reqText.forEach((f) => { if (!formData[f]) missing.push({ field: f, id: f, label: FIELD_LABELS[f] }); });
    if (!formData.dateOfBirth) missing.push({ field: 'dateOfBirth', id: 'dateOfBirth', label: FIELD_LABELS.dateOfBirth });
    const medsOk = formData.noMedications || formData.medications.some((m) => m.name && m.name.trim());
    if (!medsOk) missing.push({ field: 'medications', id: 'medication-name-0', label: FIELD_LABELS.medications });
    return missing;
  };
  const validatePart2 = () => {
    const missing = [];
    if (!hipaaPrintName.trim()) missing.push({ field: 'hipaaPrintName', id: 'hipaaPrintName', label: FIELD_LABELS.hipaaPrintName });
    if (!hipaaAgreed) missing.push({ field: 'hipaaAgreed', id: 'hipaaAgreed', label: FIELD_LABELS.hipaaAgreed });
    const sigOk = !!(hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty());
    if (!sigOk) missing.push({ field: 'hipaaSignature', id: 'hipaaSignature', label: FIELD_LABELS.hipaaSignature });
    return missing;
  };
  const validatePart3 = () => {
    const missing = [];
    if (!telehealthPrintName.trim()) missing.push({ field: 'telehealthPrintName', id: 'telehealthPrintName', label: FIELD_LABELS.telehealthPrintName });
    if (!telehealthAgreed) missing.push({ field: 'telehealthAgreed', id: 'telehealthAgreed', label: FIELD_LABELS.telehealthAgreed });
    const sigOk = !!(telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty());
    if (!sigOk) missing.push({ field: 'telehealthSignature', id: 'telehealthSignature', label: FIELD_LABELS.telehealthSignature });
    return missing;
  };

  const scrollToField = (id) => {
    const el = document.getElementById(id) || document.querySelector(`[data-field="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { el.focus({ preventScroll: true }); } catch { /* noop */ }
      el.classList.add('proto-flash');
      setTimeout(() => el.classList.remove('proto-flash'), 3000);
    }
  };

  /* ---------------------------------------------------------- clear handlers */
  const clearHipaaSignature = () => {
    if (hipaaSignatureRef.current) hipaaSignatureRef.current.clear();
    setHipaaSignature(null);
  };
  const clearTelehealthSignature = () => {
    if (telehealthSignatureRef.current) telehealthSignatureRef.current.clear();
    setTelehealthSignature(null);
  };

  /* --------------------------------------------------------------- nav/submit */
  const goToNextPart = async () => {
    const missing = currentPart === 1 ? validatePart1() : validatePart2();
    if (missing.length) {
      setMissingFields(missing);
      return;
    }
    setMissingFields([]);
    await saveProgress(true);
    setCurrentPart((p) => Math.min(3, p + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goToPreviousPart = () => {
    setMissingFields([]);
    setCurrentPart((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleSubmit = async () => {
    const missing = validatePart3();
    if (missing.length) {
      setMissingFields(missing);
      return;
    }
    setMissingFields([]);
    try {
      setIsSubmitting(true);
      await axios.post(
        `${API}/user/intake-form/submit`,
        { form_data: buildFormData(true) },
        { headers: authHeaders() },
      );
      // Advance the journey server-side (2 -> 3). This must succeed before we move on —
      // /ready is step-locked, so navigating while still on step 2 would bounce right back.
      // Only advance when the server really is on step 2: advance-step blindly increments,
      // so a double submit (or an out-of-sync tab) must not push the user past step 3.
      try {
        const p = await axios.get(`${API}/user/progress`, { headers: authHeaders() });
        if (p.data?.current_step === 2) {
          await axios.post(`${API}/user/advance-step`, {}, { headers: authHeaders() });
        }
      } catch {
        toast.error("Your form was saved, but we couldn't unlock the next step. Please press Submit again.");
        return;
      }
      toast.success('Form submitted! Moving to Step 3...');
      navigate('/ready');
    } catch {
      toast.error('Something went wrong submitting your form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------- render */
  const partLabel = ['Profile', 'HIPAA', 'Telehealth'];
  const fullName = `${formData.legalFirstName} ${formData.legalLastName}`.trim();

  if (!loaded) {
    return (
      <div className="proto proto-book">
        <main className="proto-container proto-container--form proto-main">
          <div className="proto-card proto-card--pad" style={{ textAlign: 'center', color: 'var(--p-ink-soft)' }}>
            <Loader2 size={20} className="proto-spin" style={{ marginBottom: 8 }} /> Loading your forms...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="proto proto-book">
      {/* top bar */}
      <header className="proto-topbar">
        <div className="proto-container" style={{ height: 62, display: 'flex', alignItems: 'center' }}>
          <img src={LOGO} alt="Dr. Shumard" style={{ height: 22 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="proto-btn proto-btn--ghost proto-help-sm" style={{ padding: '8px 12px' }} aria-label="Help"
              onClick={() => window.dispatchEvent(new Event('open-support'))}>
              <HelpCircle size={16} />
            </button>
            <button className="proto-btn proto-btn--ghost" style={{ padding: '8px 12px' }} aria-label="Home" onClick={() => navigate('/dashboard')}>
              <Home size={16} /> <span className="proto-hide-sm">Home</span>
            </button>
            <button className="proto-btn proto-btn--danger" style={{ padding: '8px 12px' }} aria-label="Log out"
              onClick={() => { localStorage.clear(); navigate('/login'); }}>
              <LogOut size={16} /> <span className="proto-hide-sm">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="proto-container proto-container--form proto-main">
        {/* page header */}
        <div style={{ marginBottom: 18 }}>
          <p className="proto-eyebrow">Step 2 of 3 · Health profile</p>
          <h1 style={{ marginTop: 6 }}>Tell us about your health</h1>
          <p className="proto-soft proto-book-sub" style={{ marginTop: 8 }}>This helps our team prepare for your Diabetes Reversal Strategy Session. It takes about 8 minutes - everything saves automatically as you go.</p>
        </div>

        {/* stepper + autosave indicator */}
        <div className="proto-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', marginBottom: 18 }}>
          <div className="proto-seg" role="tablist" aria-label="Form parts">
            {partLabel.map((lbl, i) => (
              <button
                key={lbl}
                type="button"
                role="tab"
                aria-selected={currentPart === i + 1}
                className={currentPart === i + 1 ? 'is-active' : ''}
                onClick={() => { if (i + 1 < currentPart) setCurrentPart(i + 1); }}
              >
                <span style={{ opacity: 0.6, marginRight: 4 }}>{i + 1}</span>{lbl}
              </button>
            ))}
          </div>
          <div className="proto-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600 }}>
            {isSaving ? (
              <><Loader2 size={14} className="proto-spin" /> Saving...</>
            ) : lastSaved ? (
              <><Check size={14} style={{ color: '#157a4b' }} /> Saved</>
            ) : null}
          </div>
        </div>

        {/* validation modal — jump straight to each missing field */}
        {missingFields.length > 0 && (
          <div className="proto-modal-overlay" onClick={() => setMissingFields([])}>
            <div className="geist-modal" onClick={(e) => e.stopPropagation()}>
              <div className="geist-modal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <AlertTriangle size={19} strokeWidth={2.2} />
                  </span>
                  <h2 className="geist-modal-title">
                    {missingFields.length} {missingFields.length === 1 ? 'thing needs' : 'things need'} your attention
                  </h2>
                </div>
                <p className="geist-modal-subtitle">These are required before you can continue. Tap Fix to jump straight to each one.</p>
                <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                  {missingFields.map((m) => (
                    <div key={m.field}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ef4444', flex: 'none' }} />
                        <span style={{ fontWeight: 600, color: '#991b1b' }}>{m.label}</span>
                      </span>
                      <button type="button" className="proto-btn"
                        style={{ padding: '6px 13px', fontSize: 13, background: '#dc2626', color: '#fff', border: 0, flex: 'none' }}
                        onClick={() => { const id = m.id; setMissingFields([]); requestAnimationFrame(() => scrollToField(id)); }}>
                        Fix <ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="geist-modal-actions">
                <button type="button" className="geist-modal-action" onClick={() => setMissingFields([])}>Close</button>
                <button type="button" className="geist-modal-action geist-modal-action--danger"
                  onClick={() => { const id = missingFields[0]?.id; setMissingFields([]); if (id) requestAnimationFrame(() => scrollToField(id)); }}>
                  Fix first issue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* parts */}
        {currentPart === 1 && (
          <Part1
            formData={formData}
            handleInputChange={handleInputChange}
            handleAddressPick={handleAddressPick}
            addMedicationRow={addMedicationRow}
            removeMedicationRow={removeMedicationRow}
            updateMedication={updateMedication}
            toggleNoMedications={toggleNoMedications}
            toggleSymptom={toggleSymptom}
            toggleRecentTest={toggleRecentTest}
          />
        )}

        {currentPart === 2 && (
          <ConsentPart
            kind="hipaa"
            printName={hipaaPrintName}
            setPrintName={(v) => { printNameManuallyEdited.current = true; setHipaaPrintName(v); }}
            agreed={hipaaAgreed}
            setAgreed={setHipaaAgreed}
            signatureRef={hipaaSignatureRef}
            setSignature={setHipaaSignature}
            clearSignature={clearHipaaSignature}
            savedSignature={hipaaSignature}
          />
        )}

        {currentPart === 3 && (
          <ConsentPart
            kind="telehealth"
            printName={telehealthPrintName}
            setPrintName={(v) => { printNameManuallyEdited.current = true; setTelehealthPrintName(v); }}
            agreed={telehealthAgreed}
            setAgreed={setTelehealthAgreed}
            signatureRef={telehealthSignatureRef}
            setSignature={setTelehealthSignature}
            clearSignature={clearTelehealthSignature}
            savedSignature={telehealthSignature}
          />
        )}

        {/* sticky action bar */}
        <div className="proto-actionbar" style={{ display: 'flex', gap: 12 }}>
          <button
            className="proto-btn proto-btn--secondary proto-btn--lg"
            onClick={goToPreviousPart}
            disabled={currentPart === 1 || isSubmitting}
          >
            <ArrowLeft size={18} /> Previous
          </button>
          {currentPart < 3 ? (
            <button
              className="proto-btn proto-btn--primary proto-btn--lg"
              style={{ marginLeft: 'auto', minWidth: 160 }}
              onClick={goToNextPart}
              disabled={isSaving}
            >
              Next <ArrowRight size={18} />
            </button>
          ) : (
            <button
              className="proto-btn proto-btn--primary proto-btn--lg"
              style={{ marginLeft: 'auto', minWidth: 160 }}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? <><Loader2 size={18} className="proto-spin" /> Submitting...</> : <>Submit <CheckCircle2 size={18} /></>}
            </button>
          )}
        </div>
      </main>

      <style>{`
        .proto-spin { animation: proto-spin 0.8s linear infinite; }
        @keyframes proto-spin { to { transform: rotate(360deg); } }
        .proto-flash { box-shadow: 0 0 0 2px #ef4444 !important; border-radius: 12px; }
        .proto-hide-sm { display: none; }
        @media (min-width: 560px) { .proto-hide-sm { display: inline; } }
        .proto-sec-grid { display: grid; gap: 13px; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .proto-sec-grid { gap: 16px; grid-template-columns: 1fr 1fr; } }
        .proto-sec-head { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; }
        .proto-sec-head h3 { font-size: 18px; }
        .proto-sec-ico { width: 34px; height: 34px; border-radius: 10px; background: var(--brand-50); color: var(--brand-600); display: grid; place-items: center; flex: none; }
        .proto-col-span { grid-column: 1 / -1; }
        .proto .react-datepicker-wrapper { width: 100%; }
        .proto-notice { border: 1px solid var(--p-line-2); border-radius: 12px; padding: 16px 18px; background: #fcfdfe; font-size: 14.5px; line-height: 1.6; color: var(--p-ink-soft); }
        .proto-notice h3 { font-size: 17px; color: var(--p-ink); margin-bottom: 6px; }
        .proto-notice h4 { font-size: 14.5px; font-weight: 700; color: var(--p-ink); margin: 14px 0 4px; }
        .proto-notice p { margin-bottom: 10px; }
        .proto-notice ol, .proto-notice ul { margin: 0 0 10px 18px; display: grid; gap: 3px; }
      `}</style>
    </div>
  );
}

/* ============================================================ section header */
function SectionHead({ icon: Icon, title }) {
  return (
    <div className="proto-sec-head">
      <span className="proto-sec-ico"><Icon size={18} /></span>
      <h3>{title}</h3>
    </div>
  );
}

/* ==================================================================== Field */
function Field({ label, req, htmlFor, span, children }) {
  return (
    <div className={span ? 'proto-col-span' : ''} style={{ minWidth: 0 }}>
      {label && (
        <label className="proto-label" htmlFor={htmlFor}>
          {label}{req && <span className="proto-req"> *</span>}
        </label>
      )}
      {children}
    </div>
  );
}

/* =================================================================== PART 1 */
function Part1({
  formData, handleInputChange, handleAddressPick, addMedicationRow, removeMedicationRow,
  updateMedication, toggleNoMedications, toggleSymptom, toggleRecentTest,
}) {
  const isUS = formData.country === 'United States';
  return (
    <motion.div className="proto-formgroup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* ---- General Information / About you ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={User} title="About you" />
        <div className="proto-sec-grid">
          <Field label="Legal First Name" req htmlFor="legalFirstName">
            <input id="legalFirstName" className="proto-input" placeholder="Legal first name"
              value={formData.legalFirstName} onChange={(e) => handleInputChange('legalFirstName', e.target.value)} />
          </Field>
          <Field label="Legal Last Name" req htmlFor="legalLastName">
            <input id="legalLastName" className="proto-input" placeholder="Legal last name"
              value={formData.legalLastName} onChange={(e) => handleInputChange('legalLastName', e.target.value)} />
          </Field>
          <Field label="Preferred First Name" htmlFor="preferredFirstName">
            <input id="preferredFirstName" className="proto-input" placeholder="Preferred name (optional)"
              value={formData.preferredFirstName} onChange={(e) => handleInputChange('preferredFirstName', e.target.value)} />
          </Field>
          <Field label="Email Address" htmlFor="email">
            <input id="email" className="proto-input" placeholder="email@example.com" disabled
              style={{ background: 'var(--p-line)', cursor: 'not-allowed' }}
              value={formData.email} readOnly />
          </Field>
          <Field label="Preferred Phone" htmlFor="phone">
            <input id="phone" className="proto-input" placeholder="(555) 123-4567" inputMode="tel"
              value={formatUSPhone(formData.phone)} onChange={(e) => handleInputChange('phone', formatUSPhone(e.target.value))} />
          </Field>
          <Field label="Date of Birth" req htmlFor="dateOfBirth">
            <DatePicker
              id="dateOfBirth"
              selected={formData.dateOfBirth}
              onChange={(d) => handleInputChange('dateOfBirth', d)}
              dateFormat="MMMM d, yyyy"
              placeholderText="Select your date of birth"
              autoComplete="off"
              onFocus={(e) => { e.target.setAttribute('autocomplete', 'off'); e.target.setAttribute('readonly', 'readonly'); }}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              maxDate={new Date()}
              scrollableYearDropdown
              yearDropdownItemNumber={100}
              className="proto-input"
              wrapperClassName="proto-dp-wrap"
            />
          </Field>
          <Field label="Relationship Status" req htmlFor="relationshipStatus">
            <ProtoSelect id="relationshipStatus" ariaLabel="Relationship Status" placeholder="Select status"
              value={formData.relationshipStatus} onChange={(v) => handleInputChange('relationshipStatus', v)}
              options={RELATIONSHIP_OPTIONS.map((o) => ({ value: o, label: o }))} />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <ProtoSelect id="gender" ariaLabel="Gender" placeholder="Select gender"
              value={formData.gender} onChange={(v) => handleInputChange('gender', v)}
              options={GENDER_OPTIONS.map((o) => ({ value: o, label: o }))} />
          </Field>
          <Field label="Weight" htmlFor="weight">
            <input id="weight" className="proto-input" placeholder="e.g., 180 lbs"
              value={formData.weight} onChange={(e) => handleInputChange('weight', e.target.value)} />
          </Field>
          <Field label="Current Date" req htmlFor="currentDate">
            <input id="currentDate" className="proto-input" disabled
              style={{ background: 'var(--p-line)', cursor: 'not-allowed' }}
              value={fmtCurrentDate(formData.currentDate)} readOnly />
          </Field>
        </div>
      </div>

      {/* ---- Address ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={MapPin} title="Address" />
        <div className="proto-sec-grid">
          <Field label="Street" req htmlFor="street" span>
            <AddressAutocomplete id="street" placeholder="Start typing your address..."
              value={formData.street}
              onChange={(v) => handleInputChange('street', v)}
              onPick={handleAddressPick} />
          </Field>
          <Field label="Unit" htmlFor="unit">
            <input id="unit" className="proto-input" placeholder="Apt, Suite, etc."
              value={formData.unit} onChange={(e) => handleInputChange('unit', e.target.value)} />
          </Field>
          <Field label="Town/City" req htmlFor="town">
            <input id="town" required className="proto-input" placeholder="City/Town"
              value={formData.town} onChange={(e) => handleInputChange('town', e.target.value)} />
          </Field>
          <Field label="Country" req htmlFor="country">
            <ProtoSelect id="country" ariaLabel="Country" placeholder="Select country"
              value={formData.country} onChange={(v) => handleInputChange('country', v)}
              options={COUNTRY_OPTIONS.map((o) => ({ value: o, label: o }))} />
          </Field>
          <Field label="State/Province" req htmlFor="state">
            {isUS ? (
              <ProtoSelect id="state" ariaLabel="State/Province" placeholder="Select state"
                value={formData.state} onChange={(v) => handleInputChange('state', v)}
                options={US_STATE_OPTIONS.map((o) => ({ value: o, label: o }))} />
            ) : (
              <input id="state" required className="proto-input" placeholder="State/Province/Region"
                value={formData.state} onChange={(e) => handleInputChange('state', e.target.value)} />
            )}
          </Field>
          <Field label="Postal Code" req htmlFor="postalCode" span>
            <input id="postalCode" required className="proto-input" placeholder="ZIP/Postal code"
              style={{ maxWidth: 280 }}
              value={formData.postalCode} onChange={(e) => handleInputChange('postalCode', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* ---- Diagnosis & background ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={Stethoscope} title="Diagnosis & background" />
        <Field label="What is your current Diagnosis?" req htmlFor="currentDiagnosis">
          <ProtoSelect id="currentDiagnosis" ariaLabel="Current Diagnosis" placeholder="Select your diagnosis"
            value={formData.currentDiagnosis} onChange={(v) => handleInputChange('currentDiagnosis', v)}
            options={DIAGNOSIS_OPTIONS.map((o) => ({ value: o, label: o }))} />
        </Field>

        <div className="proto-sec-grid" style={{ marginTop: 16 }}>
          <Field label="Occupation" htmlFor="occupation">
            <input id="occupation" className="proto-input" placeholder="Your occupation"
              value={formData.occupation} onChange={(e) => handleInputChange('occupation', e.target.value)} />
          </Field>
          <Field label="Referred By" htmlFor="referredBy">
            <input id="referredBy" className="proto-input" placeholder="How did you hear about us?"
              value={formData.referredBy} onChange={(e) => handleInputChange('referredBy', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* ---- Goals and Concerns ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={Target} title="Goals and Concerns" />
        <div style={{ display: 'grid', gap: 16 }}>
          <Field label="List Your Main Problems" req htmlFor="mainProblems">
            <textarea id="mainProblems" className="proto-textarea" rows={3} placeholder="Describe your main health concerns..."
              value={formData.mainProblems} onChange={(e) => handleInputChange('mainProblems', e.target.value)} />
          </Field>
          <Field label="What are you hoping happens today as a result of your consultation?" req htmlFor="hopedOutcome">
            <textarea id="hopedOutcome" className="proto-textarea" rows={3} placeholder="What outcomes are you hoping for?"
              value={formData.hopedOutcome} onChange={(e) => handleInputChange('hopedOutcome', e.target.value)} />
          </Field>
          <Field label="If you cannot find a solution to your problem what do you think will happen?" req htmlFor="noSolutionOutcome">
            <textarea id="noSolutionOutcome" className="proto-textarea" rows={3} placeholder="What concerns do you have if this isn't resolved?"
              value={formData.noSolutionOutcome} onChange={(e) => handleInputChange('noSolutionOutcome', e.target.value)} />
          </Field>
          <Field label="What interventions have you tried in the past that have NOT succeeded?" htmlFor="previousInterventions">
            <textarea id="previousInterventions" className="proto-textarea" rows={3} placeholder="e.g., diet, cleanse, medication, supplement, etc."
              value={formData.previousInterventions} onChange={(e) => handleInputChange('previousInterventions', e.target.value)} />
          </Field>
          <div className="proto-sec-grid">
            <Field label="Severity of your problem" req htmlFor="severityLevel">
              <ProtoSelect id="severityLevel" ariaLabel="Severity" placeholder="Select severity"
                value={formData.severityLevel} onChange={(v) => handleInputChange('severityLevel', v)}
                options={SEVERITY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} - ${o.desc}` }))} />
            </Field>
            <Field label="Motivation Level" req htmlFor="motivationLevel">
              <ProtoSelect id="motivationLevel" ariaLabel="Motivation Level" placeholder="Select motivation (10 = highest)"
                value={formData.motivationLevel} onChange={(v) => handleInputChange('motivationLevel', v)}
                options={MOTIVATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
            </Field>
          </div>
        </div>
      </div>

      {/* ---- Prior Medical History ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={FileText} title="Prior Medical History" />
        <Field label="Please state if you have any previous diagnosis and dates when this occurred" htmlFor="priorMedicalHistory">
          <textarea id="priorMedicalHistory" className="proto-textarea" rows={4} placeholder="List any previous diagnoses and their dates..."
            value={formData.priorMedicalHistory} onChange={(e) => handleInputChange('priorMedicalHistory', e.target.value)} />
        </Field>
      </div>

      {/* ---- Medications and Supplements ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={Pill} title="Medications and Supplements" />
        <p className="proto-soft" style={{ marginBottom: 14, fontSize: 14.5 }}>
          Please list Current Medications and dosage, or select "None" if not applicable.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2 }}
            checked={formData.noMedications || false}
            onChange={(e) => toggleNoMedications(e.target.checked)} />
          <span className="proto-soft" style={{ fontSize: 14.5 }}>
            None - I am not currently taking any medications or supplements
          </span>
        </label>

        <div className={formData.noMedications ? 'opacity-50 pointer-events-none' : ''} style={{ display: 'grid', gap: 12 }}>
          {formData.medications.map((med, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: formData.medications.length > 1 ? '1fr 1fr auto' : '1fr 1fr', gap: 10, alignItems: 'end' }}>
              <Field label={index === 0 ? 'Name' : ''} htmlFor={`medication-name-${index}`}>
                <input id={`medication-name-${index}`} className="proto-input" placeholder="Medication/Supplement name"
                  disabled={formData.noMedications}
                  value={med.name} onChange={(e) => updateMedication(index, 'name', e.target.value)} />
              </Field>
              <Field label={index === 0 ? 'Dosage' : ''} htmlFor={`medication-dosage-${index}`}>
                <input id={`medication-dosage-${index}`} className="proto-input" placeholder="e.g., 500mg daily"
                  disabled={formData.noMedications}
                  value={med.dosage} onChange={(e) => updateMedication(index, 'dosage', e.target.value)} />
              </Field>
              {formData.medications.length > 1 && (
                <button type="button" className="proto-btn proto-btn--secondary" style={{ padding: '13px' }}
                  disabled={formData.noMedications}
                  onClick={() => removeMedicationRow(index)} aria-label="Remove medication">
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="proto-btn proto-btn--ghost proto-btn--block"
            disabled={formData.noMedications}
            style={{ border: '1px dashed var(--p-line-2)', justifyContent: 'center' }}
            onClick={addMedicationRow}>
            <Plus size={17} /> Add Row
          </button>
        </div>
      </div>

      {/* ---- Review of Symptoms ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={Activity} title="Review of Symptoms" />
        <p className="proto-soft" style={{ marginBottom: 16, fontSize: 14.5 }}>Select current symptoms that apply to you:</p>
        <div style={{ display: 'grid', gap: 18 }}>
          {Object.entries(SYMPTOM_CATEGORIES).map(([category, symptoms]) => (
            <div key={category} style={{ border: '1px solid var(--p-line)', borderRadius: 'var(--p-r-sm)', padding: '14px 16px' }}>
              <p className="proto-eyebrow" style={{ marginBottom: 10, fontWeight: 800, color: 'var(--p-ink)' }}>{category}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {symptoms.map((symptom) => {
                  const active = (formData.symptoms[category] || []).includes(symptom);
                  return (
                    <button key={symptom} type="button"
                      className={`proto-chip proto-chip--sm${active ? ' proto-chip--active' : ''}`}
                      onClick={() => toggleSymptom(category, symptom)}>
                      {symptom}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Allergies/Other ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={AlertTriangle} title="Allergies/Other" />
        <Field label="List any allergies (drugs, food, environmental)" htmlFor="allergies">
          <textarea id="allergies" className="proto-textarea" rows={3} placeholder="List any known allergies..."
            value={formData.allergies} onChange={(e) => handleInputChange('allergies', e.target.value)} />
        </Field>
      </div>

      {/* ---- Recent Tests ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={FlaskConical} title="Recent Tests" />
        <p className="proto-soft" style={{ marginBottom: 14, fontSize: 14.5 }}>Select any recent tests you've had:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {RECENT_TEST_OPTIONS.map((test) => {
            const active = formData.recentTests.includes(test);
            return (
              <button key={test} type="button"
                className={`proto-chip proto-chip--sm${active ? ' proto-chip--active' : ''}`}
                onClick={() => toggleRecentTest(test)}>
                {test}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Other Providers ---- */}
      <div className="proto-card proto-card--pad">
        <SectionHead icon={Users} title="Other Providers" />
        <Field label="List any other healthcare providers you are currently seeing" htmlFor="otherProviders">
          <textarea id="otherProviders" className="proto-textarea" rows={3} placeholder="Name, specialty, reason for treatment..."
            value={formData.otherProviders} onChange={(e) => handleInputChange('otherProviders', e.target.value)} />
        </Field>
      </div>
    </motion.div>
  );
}

/* ============================================================ Consent (2/3) */
function ConsentPart({ kind, printName, setPrintName, agreed, setAgreed, signatureRef, setSignature, clearSignature, savedSignature }) {
  const isHipaa = kind === 'hipaa';
  const idPrefix = isHipaa ? 'hipaa' : 'telehealth';
  const agreeId = `${idPrefix}Agreed`;
  const printId = `${idPrefix}PrintName`;
  const sigId = `${idPrefix}Signature`;
  const today = useMemo(() => liveDateStr(), []);

  // Redraw a previously-saved signature onto the pad on mount, so returning users keep theirs
  // and the pad reads as signed. A signature is otherwise required (the pad must be non-empty).
  useEffect(() => {
    if (!savedSignature) return undefined;
    const t = setTimeout(() => {
      try {
        if (signatureRef.current && signatureRef.current.isEmpty()) {
          signatureRef.current.fromDataURL(savedSignature);
        }
      } catch { /* ignore redraw failures - the user can simply re-sign */ }
    }, 80);
    return () => clearTimeout(t);
  }, []);

  const agreeLabel = isHipaa
    ? 'I have read, understand, and agree to the HIPAA Notice of Privacy Practices above.'
    : 'I have read, understand, and accept the information and conditions specified in this agreement.';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gap: 18 }}>
      <div className="proto-card proto-card--pad">
        <SectionHead icon={isHipaa ? ShieldCheck : Video} title={isHipaa ? 'Part 2: HIPAA - Notice of Privacy' : 'Part 3: Telehealth Consent'} />
        <p className="proto-soft" style={{ marginBottom: 16, fontSize: 14.5 }}>
          {isHipaa
            ? 'Please read the information below and then sign at the bottom of the form. Thank you so much!'
            : 'Please read the information below and then sign at the bottom of the form. Thank you so much!'}
        </p>

        {/* full notice - the page scrolls, not the box */}
        <div className="proto-notice" id={`${idPrefix}Notice`}>
          {isHipaa ? <HipaaNotice /> : <TelehealthNotice />}
        </div>
      </div>

      <div className="proto-card proto-card--pad">
        {/* agreement checkbox */}
        <label
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, background: 'var(--brand-50)', borderRadius: 12, cursor: 'pointer' }}
        >
          <input id={agreeId} type="checkbox" style={{ width: 18, height: 18, marginTop: 2 }}
            checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{agreeLabel}</span>
        </label>

        {/* print name */}
        <div style={{ marginTop: 18 }}>
          <label className="proto-label" htmlFor={printId}>Print Name Here <span className="proto-req">*</span></label>
          <input id={printId} className="proto-input" placeholder="Type your full legal name"
            value={printName} onChange={(e) => setPrintName(e.target.value)} />
        </div>

        {/* signature */}
        <div style={{ marginTop: 18 }} id={sigId} data-field={sigId}>
          <label className="proto-label">{isHipaa ? 'Your Signature' : 'Digital Signature'} <span className="proto-req">*</span></label>
          <p className="proto-hint" style={{ marginTop: 0, marginBottom: 8 }}>Please sign using your mouse or finger below</p>
          <div style={{ border: '2px solid var(--p-line-2)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <SafeSignatureCanvas
              ref={signatureRef}
              canvasProps={{ className: 'w-full h-48 bg-white', style: { width: '100%', height: '200px' } }}
              backgroundColor="white"
              onEnd={() => {
                if (signatureRef.current) {
                  setSignature(signatureRef.current.toDataURL('image/png'));
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <button type="button" className="proto-btn proto-btn--secondary" style={{ padding: '8px 14px', fontSize: 14 }}
              onClick={clearSignature}>
              <PenLine size={15} /> Clear Signature
            </button>
            <span className="proto-muted" style={{ fontSize: 13.5 }}>Date: {today}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------- consent body content */
function HipaaNotice() {
  return (
    <>
      <h3>Notice Of Privacy Practices</h3>
      <p style={{ color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
        THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU
        CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.
      </p>
      <p>
        Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care
        in an environment that protects a health participant's privacy and the confidentiality of your
        health information. This notice explains our privacy practices, as well as your rights, with
        regard to your health information.
      </p>
      <p>
        Before we use or disclose your protected health information (PHI) for coaching, we will ask you
        to sign this consent. Some of the terms of uses include providing care, coordinating services,
        billing, and required legal disclosures.
      </p>
      <h4>Your Rights</h4>
      <ol>
        <li>Get an electronic or paper copy of your medical record.</li>
        <li>Ask us to correct your medical record.</li>
        <li>Request confidential communications.</li>
        <li>Ask us to limit what we use or share.</li>
        <li>Get a list of those with whom we've shared information.</li>
        <li>Get a copy of this privacy notice and file a complaint.</li>
      </ol>
      <h4>Your Choices</h4>
      <p>We never share your information unless you give us written authorization:</p>
      <ul>
        <li>Marketing purposes</li>
        <li>Sale of your information</li>
        <li>Most, but not all, sharing of psychotherapy notes</li>
      </ul>
      <h4>How We May Use and Share Your Health Information</h4>
      <ul>
        <li>Treatment</li>
        <li>Payment</li>
        <li>Healthcare operations</li>
      </ul>
      <h4>Our Responsibilities</h4>
      <ul>
        <li>We are required by law to maintain the privacy and security of your PHI.</li>
        <li>We will let you know promptly if a breach occurs that may have compromised your information.</li>
        <li>We must follow the duties and privacy practices described in this notice.</li>
        <li>We will not use or share your information other than as described here unless you tell us we can.</li>
      </ul>
      <h4>Changes to This Notice</h4>
      <p>We can change the terms of this notice, and the changes will apply to all information we have about you.</p>
      <h4>Who To Contact For Information or With a Complaint</h4>
      <p>Please contact our office for any questions or to file a complaint regarding your privacy rights.</p>
      <p style={{ fontWeight: 700, color: 'var(--p-ink)' }}>EFFECTIVE DATE OF THIS NOTICE: February, 2021</p>
      <p style={{ color: 'var(--brand-700)', fontWeight: 600 }}>
        Please sign below saying you have read, understand and agree to the Privacy Notice. Thank you.
      </p>
    </>
  );
}

function TelehealthNotice() {
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 12, color: 'var(--p-ink)' }}>
        <p style={{ fontWeight: 800, letterSpacing: '0.08em' }}>DRSHUMARD</p>
        <p>Dr. Shumard</p>
        <p>740 Nordahl Rd, Suite 294</p>
        <p>San Marcos CA 92069</p>
        <p>858-564-7081</p>
        <p>drjason@drshumard.com</p>
      </div>
      <p>I understand that my health and wellness provider Dr. Shumard, DC wishes me to have a tele-health consultation.</p>
      <p>This means that through an interactive video connection, I will be able to consult with the above named provider about my health and wellness concerns.</p>
      <p style={{ fontWeight: 700, color: 'var(--p-ink)' }}>I understand there are potential risks with this technology:</p>
      <ul>
        <li>The video connection may fail or stop during the consultation.</li>
        <li>The picture or information may not be clear enough to be useful.</li>
      </ul>
      <p style={{ fontWeight: 700, color: 'var(--p-ink)' }}>The benefits of a tele-health consultation are:</p>
      <ul>
        <li>No need to travel to a physical office.</li>
        <li>Access to a specialist who may not be locally available.</li>
      </ul>
      <p>Practice Better is used to maintain confidentiality, and the consultation may be recorded for training purposes.</p>
      <p>
        I understand that I am paying for an initial consultation with Dr. Shumard or one of his director
        of admissions. I will be allowed to reschedule this appointment one time with no additional
        charge. If I reschedule this appointment I agree to put a credit card on file for my follow up
        visit. If I do not inform or cancel with Dr. Shumard at least 24 hrs prior to my rescheduled
        appointment I will then be charged an additional $97 that is non-refundable.
      </p>
      <p>
        I understand all cancellations must be received 24 hrs prior to my scheduled appointment,
        otherwise the paid consultation fee of $97.00 will be forfeited and nonrefundable.
      </p>
      <p>I have read this document and understand the risk and benefits of a tele-health consultation, and consent to participate.</p>
      <h4>Client</h4>
      <p>I have read, understand, and accept the information and conditions specified in this agreement.</p>
    </>
  );
}
