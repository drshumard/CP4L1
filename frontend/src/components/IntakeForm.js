import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import axios from 'axios';
import SignatureCanvas from 'react-signature-canvas';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// North and South American countries - US at top, then alphabetical
const COUNTRIES = [
  'United States',
  'Argentina', 'Bahamas', 'Barbados', 'Belize', 'Bolivia', 'Brazil', 'Canada',
  'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Dominican Republic', 'Ecuador',
  'El Salvador', 'Guatemala', 'Guyana', 'Haiti', 'Honduras', 'Jamaica', 'Mexico',
  'Nicaragua', 'Panama', 'Paraguay', 'Peru', 'Puerto Rico', 'Suriname',
  'Trinidad and Tobago', 'Uruguay', 'Venezuela'
];

const MOTIVATION_LEVELS = [
  { value: '1-3', label: '1-3 (Low)' },
  { value: '4-6', label: '4-6 (Moderate)' },
  { value: '7-8', label: '7-8 (High)' },
  { value: '9-10', label: '9-10 (Very High)' }
];

const SEVERITY_LEVELS = [
  { value: 'Minimal', label: 'Minimal (annoying but causing no limitation)' },
  { value: 'Slight', label: 'Slight (tolerable but causing a little limitation)' },
  { value: 'Moderate', label: 'Moderate (sometimes tolerable but definitely causing limitation)' },
  { value: 'Severe', label: 'Severe (causing significant limitation)' },
  { value: 'Extreme', label: 'Extreme (causing near constant limitation (>80% of the time))' }
];

const RELATIONSHIP_STATUS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated', 'Partnered'];
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const SYMPTOM_CATEGORIES = {
  CONSTITUTIONAL: ['Fatigue', 'Recent weight change', 'Fever'],
  EYES: ['Blurred/Double vision', 'Glasses/contacts', 'Eye disease or injury'],
  'EAR/NOSE/MOUTH/THROAT': [
    'Swollen glands in neck', 'Hearing loss or ringing', 'Earaches or drainage',
    'Chronic sinus problems or rhinitis', 'Nose bleeds', 'Mouth sores/Bleeding gums',
    'Bad breath/Bad taste', 'Sore throat or voice changes'
  ],
  PSYCHIATRIC: ['Insomnia', 'Memory loss or confusion', 'Nervousness', 'Depression'],
  GENITOURINARY: [
    'Frequent urination', 'Burning or painful urination', 'Blood in urine',
    'Change in force of urinating', 'Kidney stones', 'Sexual difficulty',
    'Male: testicle pain', 'Female: pain/irregular periods', 'Female: pregnant',
    'Bladder infections', 'Kidney disease', 'Hemorrhoids'
  ],
  GASTROINTESTINAL: [
    'Abdominal pain', 'Nausea or vomiting', 'Rectal bleeding/Blood in stool',
    'Painful burn/Constipation', 'Ulcer', 'Change in bowel movement',
    'Frequent diarrhea', 'Loss of appetite'
  ],
  ENDOCRINE: [
    'Glandular or hormone problem', 'Excessive thirst or urination',
    'Heat or cold intolerance', 'Skin becoming dryer', 'Change in hat or glove size',
    'Diabetes', 'Thyroid disease'
  ],
  MUSCULOSKELETAL: [
    'Back Pain', 'Joint Pain', 'Joint stiffness and swelling', 'Muscle pain or cramps',
    'Muscle or joint weakness', 'Difficulty walking', 'Cold extremities'
  ],
  INTEGUMENTARY: [
    'Change in skin color', 'Change in hair or nails', 'Varicose veins',
    'Breast pain/discharge', 'Breast lump', 'Hives or eczema', 'Rash or itching'
  ],
  NEUROLOGICAL: [
    'Freq/Recurring headaches', 'Migraine headache', 'Convulsions or seizures',
    'Numbness or tingling', 'Tremors', 'Paralysis', 'Head injury',
    'Light headed or dizzy', 'Stroke'
  ],
  'HEMATOLOGIC/LYMPHATIC': [
    'Slow to heal after cuts', 'Easy bleeding or bruising', 'Anemia', 'Phlebitis',
    'Enlarged glands', 'Blood or plasma transfusion', 'Hepatitis', 'Cancer'
  ]
};

const RECENT_TESTS = ['Lab work', 'X-rays', 'CT scan', 'MRI', 'Ultrasound', 'EKG', 'Other'];

const IntakeForm = ({ userData, onComplete }) => {
  const [currentPart, setCurrentPart] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  
  // Part 1: Comprehensive Form Data
  const [formData, setFormData] = useState({
    // General Information
    legalFirstName: userData?.name?.split(' ')[0] || '',
    legalLastName: userData?.name?.split(' ').slice(1).join(' ') || '',
    preferredFirstName: '',
    street: '',
    unit: '',
    town: '',
    postalCode: '',
    country: 'United States',
    email: userData?.email || '',
    phone: userData?.phone || '',
    dateOfBirth: null,
    relationshipStatus: '',
    gender: '',
    weight: '',
    currentDate: new Date(),
    // Contact Information
    occupation: '',
    referredBy: '',
    // Goals and Concerns
    mainProblems: '',
    hopedOutcome: '',
    noSolutionOutcome: '',
    previousInterventions: '',
    severityLevel: '',
    motivationLevel: '',
    // Prior Medical History
    priorMedicalHistory: '',
    // Medications
    medications: [{ name: '', dosage: '' }],
    // Symptoms
    symptoms: {},
    // Allergies
    allergies: '',
    // Recent Tests
    recentTests: [],
    // Other Providers
    otherProviders: ''
  });
  
  // Part 2: HIPAA Signature
  const [hipaaSignature, setHipaaSignature] = useState(null);
  const [hipaaAgreed, setHipaaAgreed] = useState(false);
  const hipaaSignatureRef = useRef(null);
  
  // Part 3: Telehealth Signature
  const [telehealthPrintName, setTelehealthPrintName] = useState('');
  const [telehealthSignature, setTelehealthSignature] = useState(null);
  const [telehealthAgreed, setTelehealthAgreed] = useState(false);
  const telehealthSignatureRef = useRef(null);
  
  const autoSaveTimeoutRef = useRef(null);

  // Load saved form data on mount
  useEffect(() => {
    loadSavedData();
  }, []);

  // Auto-save with debounce
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveProgress();
    }, 3000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, hipaaSignature, hipaaAgreed, telehealthPrintName, telehealthSignature, telehealthAgreed]);

  const loadSavedData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/user/intake-form`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data?.form_data) {
        const saved = response.data.form_data;
        
        setFormData(prev => ({
          ...prev,
          ...saved.profileData,
          dateOfBirth: saved.profileData?.dateOfBirth ? new Date(saved.profileData.dateOfBirth) : null,
          currentDate: saved.profileData?.currentDate ? new Date(saved.profileData.currentDate) : new Date(),
          medications: saved.profileData?.medications?.length > 0 
            ? saved.profileData.medications 
            : [{ name: '', dosage: '' }]
        }));
        
        if (saved.hipaaSignature) setHipaaSignature(saved.hipaaSignature);
        if (saved.hipaaAgreed) setHipaaAgreed(saved.hipaaAgreed);
        if (saved.telehealthPrintName) setTelehealthPrintName(saved.telehealthPrintName);
        if (saved.telehealthSignature) setTelehealthSignature(saved.telehealthSignature);
        if (saved.telehealthAgreed) setTelehealthAgreed(saved.telehealthAgreed);
        if (saved.currentPart) setCurrentPart(saved.currentPart);
        
        setLastSaved(new Date(response.data.last_saved));
      }
    } catch (error) {
      console.log('No saved form data found');
    }
  };

  const saveProgress = async (showToast = false) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('access_token');
      
      let hipaaSignatureData = hipaaSignature;
      if (hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
        hipaaSignatureData = hipaaSignatureRef.current.toDataURL('image/png');
      }
      
      let telehealthSignatureData = telehealthSignature;
      if (telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty()) {
        telehealthSignatureData = telehealthSignatureRef.current.toDataURL('image/png');
      }
      
      const dataToSave = {
        profileData: {
          ...formData,
          dateOfBirth: formData.dateOfBirth?.toISOString(),
          currentDate: formData.currentDate?.toISOString()
        },
        hipaaSignature: hipaaSignatureData,
        hipaaAgreed,
        telehealthPrintName,
        telehealthSignature: telehealthSignatureData,
        telehealthAgreed,
        currentPart
      };
      
      await axios.post(`${API}/user/intake-form/save`, 
        { form_data: dataToSave },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setLastSaved(new Date());
      if (showToast) {
        toast.success('Progress saved!');
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
      if (showToast) {
        toast.error('Failed to save progress');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addMedicationRow = () => {
    setFormData(prev => ({
      ...prev,
      medications: [...prev.medications, { name: '', dosage: '' }]
    }));
  };

  const removeMedicationRow = (index) => {
    if (formData.medications.length > 1) {
      setFormData(prev => ({
        ...prev,
        medications: prev.medications.filter((_, i) => i !== index)
      }));
    }
  };

  const updateMedication = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      medications: prev.medications.map((med, i) => 
        i === index ? { ...med, [field]: value } : med
      )
    }));
  };

  const toggleSymptom = (category, symptom) => {
    setFormData(prev => {
      const categorySymptoms = prev.symptoms[category] || [];
      const newCategorySymptoms = categorySymptoms.includes(symptom)
        ? categorySymptoms.filter(s => s !== symptom)
        : [...categorySymptoms, symptom];
      
      return {
        ...prev,
        symptoms: {
          ...prev.symptoms,
          [category]: newCategorySymptoms
        }
      };
    });
  };

  const toggleRecentTest = (test) => {
    setFormData(prev => ({
      ...prev,
      recentTests: prev.recentTests.includes(test)
        ? prev.recentTests.filter(t => t !== test)
        : [...prev.recentTests, test]
    }));
  };

  const clearHipaaSignature = () => {
    if (hipaaSignatureRef.current) {
      hipaaSignatureRef.current.clear();
    }
    setHipaaSignature(null);
  };

  const clearTelehealthSignature = () => {
    if (telehealthSignatureRef.current) {
      telehealthSignatureRef.current.clear();
    }
    setTelehealthSignature(null);
  };

  const validatePart1 = () => {
    const required = ['legalFirstName', 'legalLastName', 'dateOfBirth', 'mainProblems', 'hopedOutcome', 'noSolutionOutcome', 'severityLevel', 'motivationLevel', 'weight'];
    for (const field of required) {
      if (!formData[field]) {
        toast.error('Please fill in all required fields marked with *');
        return false;
      }
    }
    return true;
  };

  const validatePart2 = () => {
    if (!hipaaAgreed) {
      toast.error('Please agree to the HIPAA Privacy Notice');
      return false;
    }
    const hasSignature = hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty();
    if (!hasSignature && !hipaaSignature) {
      toast.error('Please provide your signature');
      return false;
    }
    return true;
  };

  const validatePart3 = () => {
    if (!telehealthPrintName.trim()) {
      toast.error('Please print your name');
      return false;
    }
    if (!telehealthAgreed) {
      toast.error('Please agree to the Telehealth Consent');
      return false;
    }
    const hasSignature = telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty();
    if (!hasSignature && !telehealthSignature) {
      toast.error('Please provide your signature');
      return false;
    }
    return true;
  };

  const goToNextPart = async () => {
    if (currentPart === 1 && !validatePart1()) return;
    if (currentPart === 2 && !validatePart2()) return;
    
    if (currentPart === 2 && hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
      setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png'));
    }
    
    await saveProgress(true);
    setCurrentPart(prev => Math.min(prev + 1, 3));
    window.scrollTo(0, 0);
  };

  const goToPreviousPart = () => {
    if (currentPart === 2 && hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
      setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png'));
    }
    if (currentPart === 3 && telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty()) {
      setTelehealthSignature(telehealthSignatureRef.current.toDataURL('image/png'));
    }
    
    setCurrentPart(prev => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!validatePart3()) return;
    
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('access_token');
      
      let finalTelehealthSignature = telehealthSignature;
      if (telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty()) {
        finalTelehealthSignature = telehealthSignatureRef.current.toDataURL('image/png');
      }
      
      let finalHipaaSignature = hipaaSignature;
      if (hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
        finalHipaaSignature = hipaaSignatureRef.current.toDataURL('image/png');
      }
      
      const submissionData = {
        profileData: {
          ...formData,
          dateOfBirth: formData.dateOfBirth?.toISOString(),
          currentDate: formData.currentDate?.toISOString()
        },
        hipaaSignature: finalHipaaSignature,
        hipaaSignedAt: new Date().toISOString(),
        telehealthPrintName,
        telehealthSignature: finalTelehealthSignature,
        telehealthSignedAt: new Date().toISOString()
      };
      
      await axios.post(`${API}/user/intake-form/submit`, 
        { form_data: submissionData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Form submitted successfully! PDF has been uploaded to Google Drive.');
      onComplete?.();
    } catch (error) {
      console.error('Failed to submit form:', error);
      toast.error('Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderProgressIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((part) => (
        <React.Fragment key={part}>
          <button
            onClick={() => {
              if (part < currentPart) {
                setCurrentPart(part);
                window.scrollTo(0, 0);
              }
            }}
            disabled={part > currentPart}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
              part < currentPart
                ? 'bg-green-500 text-white cursor-pointer hover:bg-green-600'
                : part === currentPart
                ? 'bg-teal-600 text-white'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {part < currentPart ? <Check size={18} /> : part}
          </button>
          {part < 3 && (
            <div className={`w-12 h-1 rounded ${
              part < currentPart ? 'bg-green-500' : 'bg-gray-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderPart1 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Intake Forms: Diabetes</h2>
        <p className="text-gray-600 mt-2">Please complete all sections below</p>
      </div>

      {/* General Information */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">General Information *</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Legal First Name *</Label>
              <Input value={formData.legalFirstName} onChange={(e) => handleInputChange('legalFirstName', e.target.value)} placeholder="Legal first name" />
            </div>
            <div className="space-y-2">
              <Label>Legal Last Name *</Label>
              <Input value={formData.legalLastName} onChange={(e) => handleInputChange('legalLastName', e.target.value)} placeholder="Legal last name" />
            </div>
            <div className="space-y-2">
              <Label>Preferred First Name</Label>
              <Input value={formData.preferredFirstName} onChange={(e) => handleInputChange('preferredFirstName', e.target.value)} placeholder="Preferred name (optional)" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} placeholder="email@example.com" disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label>Preferred Phone</Label>
              <Input value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <DatePicker
                selected={formData.dateOfBirth}
                onChange={(date) => handleInputChange('dateOfBirth', date)}
                dateFormat="MMMM d, yyyy"
                showMonthDropdown showYearDropdown dropdownMode="select"
                maxDate={new Date()} yearDropdownItemNumber={100} scrollableYearDropdown
                placeholderText="Select your date of birth"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                wrapperClassName="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Relationship Status</Label>
              <Select value={formData.relationshipStatus} onValueChange={(v) => handleInputChange('relationshipStatus', v)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={formData.gender} onValueChange={(v) => handleInputChange('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Weight *</Label>
              <Input value={formData.weight} onChange={(e) => handleInputChange('weight', e.target.value)} placeholder="e.g., 180 lbs" />
            </div>
            <div className="space-y-2">
              <Label>Current Date *</Label>
              <Input value={formData.currentDate?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} disabled className="bg-gray-50" />
            </div>
          </div>

          {/* Address */}
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Address</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Street</Label>
                <Input value={formData.street} onChange={(e) => handleInputChange('street', e.target.value)} placeholder="Street address" />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={formData.unit} onChange={(e) => handleInputChange('unit', e.target.value)} placeholder="Apt, Suite, etc." />
              </div>
              <div className="space-y-2">
                <Label>Town</Label>
                <Input value={formData.town} onChange={(e) => handleInputChange('town', e.target.value)} placeholder="City/Town" />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input value={formData.postalCode} onChange={(e) => handleInputChange('postalCode', e.target.value)} placeholder="ZIP/Postal code" />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={formData.country} onValueChange={(v) => handleInputChange('country', v)}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Occupation</Label>
              <Input value={formData.occupation} onChange={(e) => handleInputChange('occupation', e.target.value)} placeholder="Your occupation" />
            </div>
            <div className="space-y-2">
              <Label>Referred By</Label>
              <Input value={formData.referredBy} onChange={(e) => handleInputChange('referredBy', e.target.value)} placeholder="How did you hear about us?" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Goals and Concerns */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Goals and Concerns</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>List Your Main Problems *</Label>
              <Textarea value={formData.mainProblems} onChange={(e) => handleInputChange('mainProblems', e.target.value)} placeholder="Describe your main health concerns..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>What are you hoping happens today as a result of your consultation? *</Label>
              <Textarea value={formData.hopedOutcome} onChange={(e) => handleInputChange('hopedOutcome', e.target.value)} placeholder="What outcomes are you hoping for?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>If you cannot find a solution to your problem what do you think will happen? *</Label>
              <Textarea value={formData.noSolutionOutcome} onChange={(e) => handleInputChange('noSolutionOutcome', e.target.value)} placeholder="What concerns do you have if this isn't resolved?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>What interventions have you tried in the past that have NOT succeeded?</Label>
              <Textarea value={formData.previousInterventions} onChange={(e) => handleInputChange('previousInterventions', e.target.value)} placeholder="e.g., diet, cleanse, medication, supplement, etc." rows={3} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Severity of your problem *</Label>
                <Select value={formData.severityLevel} onValueChange={(v) => handleInputChange('severityLevel', v)}>
                  <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivation Level *</Label>
                <Select value={formData.motivationLevel} onValueChange={(v) => handleInputChange('motivationLevel', v)}>
                  <SelectTrigger><SelectValue placeholder="Select motivation (10 = highest)" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVATION_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prior Medical History */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Prior Medical History</h3>
          <div className="space-y-2">
            <Label>Please state if you have any previous diagnosis and dates when this occurred</Label>
            <Textarea value={formData.priorMedicalHistory} onChange={(e) => handleInputChange('priorMedicalHistory', e.target.value)} placeholder="List any previous diagnoses and their dates..." rows={4} />
          </div>
        </CardContent>
      </Card>

      {/* Medications and Supplements */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Medications and Supplements *</h3>
          <p className="text-sm text-gray-600 mb-4">Please list Current Medications and dosage.</p>
          
          <div className="space-y-3">
            {formData.medications.map((med, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={med.name} onChange={(e) => updateMedication(index, 'name', e.target.value)} placeholder="Medication/Supplement name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage</Label>
                  <Input value={med.dosage} onChange={(e) => updateMedication(index, 'dosage', e.target.value)} placeholder="e.g., 500mg daily" />
                </div>
                <div className="flex items-end">
                  {formData.medications.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMedicationRow(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 size={18} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            <Button type="button" variant="outline" onClick={addMedicationRow} className="w-full border-dashed border-2 border-teal-300 text-teal-600 hover:bg-teal-50">
              <Plus size={18} className="mr-2" /> Add Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review of Symptoms */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Review of Symptoms</h3>
          <p className="text-sm text-gray-600 mb-4">Select current symptoms that apply to you:</p>
          
          <div className="space-y-6">
            {Object.entries(SYMPTOM_CATEGORIES).map(([category, symptoms]) => (
              <div key={category} className="border rounded-lg p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase">{category}</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {symptoms.map(symptom => (
                    <label key={symptom} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <Checkbox
                        checked={(formData.symptoms[category] || []).includes(symptom)}
                        onCheckedChange={() => toggleSymptom(category, symptom)}
                      />
                      <span className="text-gray-700">{symptom}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Allergies */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Allergies/Other</h3>
          <div className="space-y-2">
            <Label>List any allergies (drugs, food, environmental)</Label>
            <Textarea value={formData.allergies} onChange={(e) => handleInputChange('allergies', e.target.value)} placeholder="List any known allergies..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Recent Tests */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Recent Tests</h3>
          <p className="text-sm text-gray-600 mb-3">Select any recent tests you've had:</p>
          <div className="flex flex-wrap gap-3">
            {RECENT_TESTS.map(test => (
              <label key={test} className="flex items-center gap-2 text-sm cursor-pointer bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100">
                <Checkbox checked={formData.recentTests.includes(test)} onCheckedChange={() => toggleRecentTest(test)} />
                <span>{test}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Other Providers */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Other Providers</h3>
          <div className="space-y-2">
            <Label>List any other healthcare providers you are currently seeing</Label>
            <Textarea value={formData.otherProviders} onChange={(e) => handleInputChange('otherProviders', e.target.value)} placeholder="Name, specialty, reason for treatment..." rows={3} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderPart2 = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 2: HIPAA - Notice of Privacy</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700 font-medium">Please read the information below and then sign at the bottom of the form. Thank you so much!</p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar text-sm">
            <h3 className="text-lg font-bold text-gray-800">Notice Of Privacy Practices</h3>
            <p className="font-semibold text-red-600 text-xs">THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.</p>
            <p>Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant's privacy and the confidentiality of your health information.</p>
            <p>We want you to know how your Protected Health Information (PHI) is going to be used in our coaching program and your rights concerning those records.</p>
            <p className="font-semibold">Some of the terms of uses include:</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>The health participant understands that Shumard Chiropractic Inc. and partnering laboratories transmit health information electronically via a secure internet connection.</li>
              <li>A health participant's written consent need only be obtained one time for all subsequent coaching given to the health participant.</li>
              <li>For your security and right to privacy, we have taken all precautions to assure that your records are not readily available to those who do not need access to them.</li>
              <li>If the health participant refuses to sign this consent, Shumard Chiropractic Inc. reserves the right to refuse acceptance of the health participant.</li>
              <li>Every effort is made to ensure cyber-security of your information. The health participant agrees to hold Shumard Chiropractic Inc. harmless for information lost due to technical failures.</li>
              <li>Consultations can be conducted via phone, PracticeBetter Telehealth, Skype, Zoom, G-Suite's 'Meet' or similar.</li>
            </ol>
            <h4 className="font-bold text-gray-800 mt-4">Your Rights</h4>
            <p>You have the right to: get copies of your medical record, ask us to correct your record, request confidential communications, get a copy of this privacy notice, choose someone to act for you, and file a complaint if you feel your rights are violated.</p>
            <h4 className="font-bold text-gray-800 mt-4">Our Responsibilities</h4>
            <p>We are required by law to maintain the privacy and security of your protected health information. We will let you know promptly if a breach occurs.</p>
            <p className="font-semibold mt-4">EFFECTIVE DATE OF THIS NOTICE: February, 2021</p>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox id="hipaaAgreed" checked={hipaaAgreed} onCheckedChange={setHipaaAgreed} />
              <Label htmlFor="hipaaAgreed" className="text-sm leading-relaxed cursor-pointer">I have read, understand, and agree to the HIPAA Notice of Privacy Practices above.</Label>
            </div>
          </div>
          
          <div className="mt-6">
            <Label className="text-lg font-semibold">Your Signature *</Label>
            <p className="text-sm text-gray-600 mb-3">Please sign using your mouse or finger below</p>
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={hipaaSignatureRef}
                canvasProps={{ className: 'w-full h-48 bg-white', style: { width: '100%', height: '200px' } }}
                backgroundColor="white"
                onEnd={() => { if (hipaaSignatureRef.current) setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png')); }}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <Button type="button" variant="outline" size="sm" onClick={clearHipaaSignature} className="text-gray-600">Clear Signature</Button>
              <p className="text-sm text-gray-600">Date: <span className="font-semibold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderPart3 = () => (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 3: Telehealth Consent</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-6 mb-6 text-center">
            <h3 className="text-xl font-bold text-teal-700">DRSHUMARD</h3>
            <p className="font-semibold text-gray-800 mt-2">Dr. Shumard</p>
            <p className="text-gray-600 text-sm">740 Nordahl Rd, Suite 294</p>
            <p className="text-gray-600 text-sm">San Marcos CA 92069</p>
            <p className="text-gray-600 text-sm">858-564-7081</p>
            <p className="text-teal-600 text-sm">drjason@drshumard.com</p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 text-sm">
            <p className="font-semibold">I understand that my health and wellness provider Dr. Shumard, DC wishes me to have a tele-health consultation.</p>
            <p>This means that through an interactive video connection, I will be able to consult with the above named provider about my health and wellness concerns.</p>
            <h4 className="font-bold text-gray-800">Potential risks:</h4>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>The video connection may not work or it may stop working during the consultation.</li>
              <li>The video picture or information transmitted may not be clear enough to be useful.</li>
            </ul>
            <h4 className="font-bold text-gray-800">Benefits:</h4>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>I do not need to travel to the consult location.</li>
              <li>I have access to a specialist through this consultation.</li>
            </ul>
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 my-4">
              <p className="text-amber-800 text-xs font-semibold">I understand that I am paying for an initial consultation with Dr. Shumard. I will be allowed to reschedule one time with no additional charge. If I reschedule, I agree to put a credit card on file. If I do not cancel at least 24 hrs prior to my rescheduled appointment, I will be charged $97 that is non-refundable.</p>
            </div>
            <div className="bg-red-50 border-l-4 border-red-500 p-3 my-4">
              <p className="text-red-800 text-xs font-semibold">I understand all cancellations must be received 24 hrs prior to my scheduled appointment, otherwise the paid consultation fee of $97.00 will be forfeited and nonrefundable.</p>
            </div>
            <div className="bg-teal-50 border-l-4 border-teal-500 p-3 my-4">
              <p className="font-bold text-teal-800 text-xs">Client: I have read, understand, and accept the information and conditions specified in this agreement.</p>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox id="telehealthAgreed" checked={telehealthAgreed} onCheckedChange={setTelehealthAgreed} />
              <Label htmlFor="telehealthAgreed" className="text-sm leading-relaxed cursor-pointer">I have read, understand, and accept the information and conditions specified in this agreement.</Label>
            </div>
          </div>
          
          <div className="mt-6">
            <Label htmlFor="printName" className="text-lg font-semibold">Print Name Here *</Label>
            <Input id="printName" value={telehealthPrintName} onChange={(e) => setTelehealthPrintName(e.target.value)} placeholder="Type your full legal name" className="mt-2 text-lg" />
          </div>
          
          <div className="mt-6">
            <Label className="text-lg font-semibold">Digital Signature *</Label>
            <p className="text-sm text-gray-600 mb-3">Please sign using your mouse or finger below</p>
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={telehealthSignatureRef}
                canvasProps={{ className: 'w-full h-48 bg-white', style: { width: '100%', height: '200px' } }}
                backgroundColor="white"
                onEnd={() => { if (telehealthSignatureRef.current) setTelehealthSignature(telehealthSignatureRef.current.toDataURL('image/png')); }}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <Button type="button" variant="outline" size="sm" onClick={clearTelehealthSignature} className="text-gray-600">Clear Signature</Button>
              <p className="text-sm text-gray-600">Date: <span className="font-semibold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex justify-end items-center gap-2 mb-4 text-sm text-gray-500">
        {isSaving ? (
          <><Loader2 className="w-4 h-4 animate-spin" /><span>Saving...</span></>
        ) : lastSaved ? (
          <><Check className="w-4 h-4 text-green-500" /><span>Last saved: {lastSaved.toLocaleTimeString()}</span></>
        ) : null}
      </div>
      
      {renderProgressIndicator()}
      
      <AnimatePresence mode="wait">
        {currentPart === 1 && renderPart1()}
        {currentPart === 2 && renderPart2()}
        {currentPart === 3 && renderPart3()}
      </AnimatePresence>
      
      <div className="mt-8 flex justify-between items-center">
        <Button type="button" variant="outline" onClick={goToPreviousPart} disabled={currentPart === 1} className="flex items-center gap-2">
          <ChevronLeft size={18} /> Previous
        </Button>
        
        {currentPart < 3 ? (
          <Button type="button" onClick={goToNextPart} className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white flex items-center gap-2">
            Next <ChevronRight size={18} />
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white flex items-center gap-2 min-w-32">
            {isSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" />Submitting...</>) : (<><Check size={18} />Submit</>)}
          </Button>
        )}
      </div>
    </div>
  );
};

export default IntakeForm;
