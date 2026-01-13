import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';
import axios from 'axios';
import 'react-datepicker/dist/react-datepicker.css';

// Import refactored components
import { Part1_DiabetesProfile, Part2_HIPAAConsent, Part3_TelehealthConsent, ValidationModal } from './intake-form';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Field labels for validation modal
const FIELD_LABELS = {
  legalFirstName: 'Legal First Name',
  legalLastName: 'Legal Last Name',
  dateOfBirth: 'Date of Birth',
  relationshipStatus: 'Relationship Status',
  street: 'Street Address',
  town: 'City',
  country: 'Country',
  state: 'State',
  postalCode: 'Postal Code',
  mainProblems: 'Main Problems',
  hopedOutcome: 'Hoped Outcome from Consultation',
  noSolutionOutcome: 'What happens if no solution',
  severityLevel: 'Severity Level',
  motivationLevel: 'Motivation Level',
  medications: 'Medications/Supplements',
  hipaaPrintName: 'HIPAA - Print Name',
  hipaaAgreed: 'HIPAA Agreement Checkbox',
  hipaaSignature: 'HIPAA Signature',
  telehealthPrintName: 'Telehealth - Print Name',
  telehealthAgreed: 'Telehealth Agreement Checkbox',
  telehealthSignature: 'Telehealth Signature'
};

const IntakeForm = forwardRef(({ userData, onComplete, onPartChange, onStateChange }, ref) => {
  const [currentPart, setCurrentPart] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  
  // Validation modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  
  // Part 1: Comprehensive Form Data
  const [formData, setFormData] = useState({
    // General Information - Use first_name/last_name from GHL if available, fallback to splitting name
    legalFirstName: userData?.first_name || userData?.name?.split(' ')[0] || '',
    legalLastName: userData?.last_name || userData?.name?.split(' ').slice(1).join(' ') || '',
    preferredFirstName: '',
    street: '',
    unit: '',
    town: '',
    state: '',
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
    noMedications: false, // "None" checkbox for no medications
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
  const [hipaaPrintName, setHipaaPrintName] = useState('');
  const hipaaSignatureRef = useRef(null);
  
  // Part 3: Telehealth Signature
  const [telehealthPrintName, setTelehealthPrintName] = useState('');
  const [telehealthSignature, setTelehealthSignature] = useState(null);
  const [telehealthAgreed, setTelehealthAgreed] = useState(false);
  const telehealthSignatureRef = useRef(null);
  
  const autoSaveTimeoutRef = useRef(null);
  
  // Track if print names have been manually edited
  const printNameManuallyEdited = useRef({ hipaa: false, telehealth: false });
  
  // Store the last auto-filled name to detect when legal name changes
  const lastAutoFilledName = useRef('');

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        currentPart,
        isSaving,
        isSubmitting,
        lastSaved
      });
    }
  }, [currentPart, isSaving, isSubmitting, lastSaved, onStateChange]);

  // Notify parent when part changes
  useEffect(() => {
    if (onPartChange) {
      onPartChange(currentPart);
    }
  }, [currentPart, onPartChange]);

  // Load saved form data on mount
  useEffect(() => {
    loadSavedData();
  }, []);
  
  // Auto-fill print names when legal names change
  useEffect(() => {
    const fullLegalName = `${formData.legalFirstName} ${formData.legalLastName}`.trim();
    
    // Only auto-fill if there's a legal name
    if (fullLegalName && fullLegalName !== lastAutoFilledName.current) {
      // Update HIPAA print name if it hasn't been manually edited OR if it matches the old auto-filled name
      if (!printNameManuallyEdited.current.hipaa || hipaaPrintName === lastAutoFilledName.current || !hipaaPrintName) {
        setHipaaPrintName(fullLegalName);
        printNameManuallyEdited.current.hipaa = false; // Reset since we're auto-filling
      }
      
      // Update Telehealth print name if it hasn't been manually edited OR if it matches the old auto-filled name
      if (!printNameManuallyEdited.current.telehealth || telehealthPrintName === lastAutoFilledName.current || !telehealthPrintName) {
        setTelehealthPrintName(fullLegalName);
        printNameManuallyEdited.current.telehealth = false; // Reset since we're auto-filling
      }
      
      lastAutoFilledName.current = fullLegalName;
    }
  }, [formData.legalFirstName, formData.legalLastName]);

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
  }, [formData, hipaaSignature, hipaaAgreed, hipaaPrintName, telehealthPrintName, telehealthSignature, telehealthAgreed]);

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
        if (saved.hipaaPrintName) setHipaaPrintName(saved.hipaaPrintName);
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
        hipaaPrintName,
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

  // Scroll to a specific field
  const scrollToField = (fieldId) => {
    setShowValidationModal(false);
    setTimeout(() => {
      const element = document.getElementById(fieldId) || document.querySelector(`[data-field="${fieldId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus?.();
        // Add highlight effect
        element.classList.add('ring-2', 'ring-red-500');
        setTimeout(() => element.classList.remove('ring-2', 'ring-red-500'), 3000);
      }
    }, 100);
  };

  const validatePart1 = () => {
    const required = [
      { field: 'legalFirstName', id: 'legalFirstName' },
      { field: 'legalLastName', id: 'legalLastName' },
      { field: 'dateOfBirth', id: 'dateOfBirth' },
      { field: 'relationshipStatus', id: 'relationshipStatus' },
      { field: 'street', id: 'street' },
      { field: 'town', id: 'town' },
      { field: 'country', id: 'country' },
      { field: 'state', id: 'state' },
      { field: 'postalCode', id: 'postalCode' },
      { field: 'mainProblems', id: 'mainProblems' },
      { field: 'hopedOutcome', id: 'hopedOutcome' },
      { field: 'noSolutionOutcome', id: 'noSolutionOutcome' },
      { field: 'severityLevel', id: 'severityLevel' },
      { field: 'motivationLevel', id: 'motivationLevel' }
    ];
    
    const missing = required.filter(r => !formData[r.field]).map(r => ({
      field: r.field,
      id: r.id,
      label: FIELD_LABELS[r.field] || r.field
    }));
    
    // Check medications - must have at least one entry with a name OR "None" selected
    const hasValidMedication = formData.medications && formData.medications.some(med => med.name && med.name.trim() !== '');
    const hasNoneMedication = formData.noMedications === true;
    
    if (!hasValidMedication && !hasNoneMedication) {
      missing.push({ field: 'medications', id: 'medication-name-0', label: FIELD_LABELS.medications });
    }
    
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationModal(true);
      return false;
    }
    return true;
  };

  const validatePart2 = () => {
    const missing = [];
    
    if (!hipaaPrintName.trim()) {
      missing.push({ field: 'hipaaPrintName', id: 'hipaaPrintName', label: FIELD_LABELS.hipaaPrintName });
    }
    if (!hipaaAgreed) {
      missing.push({ field: 'hipaaAgreed', id: 'hipaaAgreed', label: FIELD_LABELS.hipaaAgreed });
    }
    const hasSignature = hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty();
    if (!hasSignature && !hipaaSignature) {
      missing.push({ field: 'hipaaSignature', id: 'hipaaSignature', label: FIELD_LABELS.hipaaSignature });
    }
    
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationModal(true);
      return false;
    }
    return true;
  };

  const validatePart3 = () => {
    const missing = [];
    
    if (!telehealthPrintName.trim()) {
      missing.push({ field: 'telehealthPrintName', id: 'telehealthPrintName', label: FIELD_LABELS.telehealthPrintName });
    }
    if (!telehealthAgreed) {
      missing.push({ field: 'telehealthAgreed', id: 'telehealthAgreed', label: FIELD_LABELS.telehealthAgreed });
    }
    const hasSignature = telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty();
    if (!hasSignature && !telehealthSignature) {
      missing.push({ field: 'telehealthSignature', id: 'telehealthSignature', label: FIELD_LABELS.telehealthSignature });
    }
    
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationModal(true);
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
    
    // Scroll to top of form section after component re-renders
    setTimeout(() => {
      // Find the form section and scroll to it
      const formSection = document.querySelector('[data-testid="form-section"]');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        // Fallback: scroll the main content container
        const mainContent = document.querySelector('[data-main-content]');
        if (mainContent) {
          mainContent.scrollTo({ top: 0, behavior: 'instant' });
        }
      }
    }, 150);
  };

  const goToPreviousPart = () => {
    if (currentPart === 2 && hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
      setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png'));
    }
    if (currentPart === 3 && telehealthSignatureRef.current && !telehealthSignatureRef.current.isEmpty()) {
      setTelehealthSignature(telehealthSignatureRef.current.toDataURL('image/png'));
    }
    
    setCurrentPart(prev => Math.max(prev - 1, 1));
    
    // Scroll to top of form section after component re-renders
    setTimeout(() => {
      const formSection = document.querySelector('[data-testid="form-section"]');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        const mainContent = document.querySelector('[data-main-content]');
        if (mainContent) {
          mainContent.scrollTo({ top: 0, behavior: 'instant' });
        }
      }
    }, 150);
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    goToNextPart,
    goToPreviousPart,
    handleSubmit,
    getCurrentPart: () => currentPart,
    getIsSubmitting: () => isSubmitting
  }));

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
        hipaaPrintName,
        telehealthPrintName,
        telehealthSignature: finalTelehealthSignature,
        telehealthSignedAt: new Date().toISOString()
      };
      
      await axios.post(`${API}/user/intake-form/submit`, 
        { form_data: submissionData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Form submitted successfully!', { id: 'form-submit-success' });
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

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Validation Modal */}
      <ValidationModal 
        showValidationModal={showValidationModal}
        setShowValidationModal={setShowValidationModal}
        missingFields={missingFields}
        scrollToField={scrollToField}
      />
      
      <AnimatePresence mode="wait">
        {currentPart === 1 && (
          <motion.div
            key="part1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Part1_DiabetesProfile
              formData={formData}
              handleInputChange={handleInputChange}
              addMedicationRow={addMedicationRow}
              removeMedicationRow={removeMedicationRow}
              updateMedication={updateMedication}
              toggleSymptom={toggleSymptom}
              toggleRecentTest={toggleRecentTest}
            />
          </motion.div>
        )}
        {currentPart === 2 && (
          <motion.div
            key="part2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Part2_HIPAAConsent
              hipaaAgreed={hipaaAgreed}
              setHipaaAgreed={setHipaaAgreed}
              hipaaPrintName={hipaaPrintName}
              setHipaaPrintName={(value) => {
                printNameManuallyEdited.current.hipaa = true;
                setHipaaPrintName(value);
              }}
              hipaaSignatureRef={hipaaSignatureRef}
              hipaaSignature={hipaaSignature}
              setHipaaSignature={setHipaaSignature}
              clearHipaaSignature={clearHipaaSignature}
            />
          </motion.div>
        )}
        {currentPart === 3 && (
          <motion.div
            key="part3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Part3_TelehealthConsent
              telehealthPrintName={telehealthPrintName}
              setTelehealthPrintName={(value) => {
                printNameManuallyEdited.current.telehealth = true;
                setTelehealthPrintName(value);
              }}
              telehealthAgreed={telehealthAgreed}
              setTelehealthAgreed={setTelehealthAgreed}
              telehealthSignatureRef={telehealthSignatureRef}
              telehealthSignature={telehealthSignature}
              setTelehealthSignature={setTelehealthSignature}
              clearTelehealthSignature={clearTelehealthSignature}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Export navigation functions for parent component
IntakeForm.displayName = 'IntakeForm';

export default IntakeForm;
