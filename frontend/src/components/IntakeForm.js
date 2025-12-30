import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check, Save, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import axios from 'axios';
import SignatureCanvas from 'react-signature-canvas';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// North and South American countries - US at top, then alphabetical
const COUNTRIES = [
  'United States',
  'Argentina',
  'Bahamas',
  'Barbados',
  'Belize',
  'Bolivia',
  'Brazil',
  'Canada',
  'Chile',
  'Colombia',
  'Costa Rica',
  'Cuba',
  'Dominican Republic',
  'Ecuador',
  'El Salvador',
  'Guatemala',
  'Guyana',
  'Haiti',
  'Honduras',
  'Jamaica',
  'Mexico',
  'Nicaragua',
  'Panama',
  'Paraguay',
  'Peru',
  'Puerto Rico',
  'Suriname',
  'Trinidad and Tobago',
  'Uruguay',
  'Venezuela'
];

const MOTIVATION_LEVELS = [
  { value: '1-3', label: '1-3 (Low)' },
  { value: '4-6', label: '4-6 (Moderate)' },
  { value: '7-8', label: '7-8 (High)' },
  { value: '9-10', label: '9-10 (Very High)' }
];

const IntakeForm = ({ userData, onComplete }) => {
  const [currentPart, setCurrentPart] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  
  // Part 1: Profile Form Data
  const [formData, setFormData] = useState({
    firstName: userData?.first_name || userData?.name?.split(' ')[0] || '',
    legalLastName: userData?.last_name || userData?.name?.split(' ').slice(1).join(' ') || '',
    email: userData?.email || '',
    phone: userData?.phone || '',
    dateOfBirth: null,
    country: 'United States',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    emergencyContact: '',
    emergencyPhone: '',
    primaryConcerns: '',
    healthGoals: '',
    motivationLevel: '',
    medications: [{ name: '', dosage: '', frequency: '' }],
    allergies: '',
    previousTreatments: '',
    additionalNotes: ''
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
          medications: saved.profileData?.medications?.length > 0 
            ? saved.profileData.medications 
            : [{ name: '', dosage: '', frequency: '' }]
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
      
      // Get signature data URLs if available
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
          dateOfBirth: formData.dateOfBirth?.toISOString()
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
      medications: [...prev.medications, { name: '', dosage: '', frequency: '' }]
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
    const required = ['firstName', 'legalLastName', 'email', 'dateOfBirth', 'country'];
    for (const field of required) {
      if (!formData[field]) {
        toast.error(`Please fill in all required fields`);
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
    
    // Save signature before moving
    if (currentPart === 2 && hipaaSignatureRef.current && !hipaaSignatureRef.current.isEmpty()) {
      setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png'));
    }
    
    await saveProgress(true);
    setCurrentPart(prev => Math.min(prev + 1, 3));
    window.scrollTo(0, 0);
  };

  const goToPreviousPart = () => {
    // Save signature before moving
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
      
      // Get final signature data
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
          dateOfBirth: formData.dateOfBirth?.toISOString()
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
      
      toast.success('Form submitted successfully!');
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
        <h2 className="text-2xl font-bold text-gray-800">Part 1: Your Health Profile</h2>
        <p className="text-gray-600 mt-2">Please provide your information below</p>
      </div>

      {/* Personal Information */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">1</span>
            Personal Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter your first name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="legalLastName">Legal Last Name *</Label>
              <Input
                id="legalLastName"
                value={formData.legalLastName}
                onChange={(e) => handleInputChange('legalLastName', e.target.value)}
                placeholder="Enter your legal last name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <DatePicker
                selected={formData.dateOfBirth}
                onChange={(date) => handleInputChange('dateOfBirth', date)}
                dateFormat="MMMM d, yyyy"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                maxDate={new Date()}
                yearDropdownItemNumber={100}
                scrollableYearDropdown
                placeholderText="Select your date of birth"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                wrapperClassName="w-full"
                calendarClassName="shadow-lg border-0 rounded-lg"
                popperClassName="z-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Country *</Label>
              <Select value={formData.country} onValueChange={(value) => handleInputChange('country', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="123 Main Street"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="City"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="State"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  placeholder="12345"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">2</span>
            Emergency Contact
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContact">Emergency Contact Name</Label>
              <Input
                id="emergencyContact"
                value={formData.emergencyContact}
                onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                placeholder="Contact name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="emergencyPhone">Emergency Contact Phone</Label>
              <Input
                id="emergencyPhone"
                type="tel"
                value={formData.emergencyPhone}
                onChange={(e) => handleInputChange('emergencyPhone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Information */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">3</span>
            Health Information
          </h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryConcerns">Primary Health Concerns</Label>
              <Textarea
                id="primaryConcerns"
                value={formData.primaryConcerns}
                onChange={(e) => handleInputChange('primaryConcerns', e.target.value)}
                placeholder="Describe your main health concerns..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="healthGoals">Health Goals</Label>
              <Textarea
                id="healthGoals"
                value={formData.healthGoals}
                onChange={(e) => handleInputChange('healthGoals', e.target.value)}
                placeholder="What health goals would you like to achieve?"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Motivation Level</Label>
              <Select value={formData.motivationLevel} onValueChange={(value) => handleInputChange('motivationLevel', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="How motivated are you to improve your health?" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVATION_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Medications & Supplements */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-sm font-bold">4</span>
            Medications & Supplements
          </h3>
          
          <div className="space-y-4">
            {formData.medications.map((med, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-2">
                  <Label>Medication/Supplement</Label>
                  <Input
                    value={med.name}
                    onChange={(e) => updateMedication(index, 'name', e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dosage</Label>
                  <Input
                    value={med.dosage}
                    onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                    placeholder="e.g., 500mg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Input
                    value={med.frequency}
                    onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                    placeholder="e.g., Daily"
                  />
                </div>
                <div className="flex items-end">
                  {formData.medications.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMedicationRow(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={18} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              onClick={addMedicationRow}
              className="w-full border-dashed border-2 border-teal-300 text-teal-600 hover:bg-teal-50"
            >
              <Plus size={18} className="mr-2" />
              Add Row
            </Button>
          </div>
          
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="allergies">Known Allergies</Label>
              <Textarea
                id="allergies"
                value={formData.allergies}
                onChange={(e) => handleInputChange('allergies', e.target.value)}
                placeholder="List any known allergies (medications, foods, environmental)..."
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="previousTreatments">Previous Treatments</Label>
              <Textarea
                id="previousTreatments"
                value={formData.previousTreatments}
                onChange={(e) => handleInputChange('previousTreatments', e.target.value)}
                placeholder="Have you tried any treatments or programs before? What were the results?"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="additionalNotes">Additional Notes</Label>
              <Textarea
                id="additionalNotes"
                value={formData.additionalNotes}
                onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                placeholder="Any additional information you'd like us to know..."
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderPart2 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 2: HIPAA - Notice of Privacy</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-6 mb-6">
            <p className="text-sm text-gray-700 mb-4 font-medium">
              Please read the information below and then sign at the bottom of the form. Thank you so much!
            </p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
            <h3 className="text-lg font-bold text-gray-800">Notice Of Privacy Practices</h3>
            
            <p className="font-semibold text-red-600">
              THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.
            </p>
            
            <p>
              Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant's privacy and the confidentiality of your health information. This notice explains our privacy practices, as well as your rights, with regard to your health information.
            </p>
            
            <p>
              We want you to know how your Protected Health Information (PHI) is going to be used in our coaching program and your rights concerning those records. Before we will begin any health coaching we require you to read and sign this consent form stating that you understand and agree with how your records will be used.
            </p>
            
            <p className="font-semibold">Some of the terms of uses include:</p>
            
            <ol className="list-decimal pl-5 space-y-2">
              <li>The health participant understands that Shumard Chiropractic Inc. and partnering laboratories transmit health information (such as lab results) electronically via a secure internet connection. Shumard Chiropractic Inc. has taken the necessary precautions to enhance all security; Shumard Chiropractic Inc. cannot be held liable if there is any security breach on the part of the laboratories.</li>
              <li>A health participant's written consent need only be obtained one time for all subsequent coaching given to the health participant.</li>
              <li>For your security and right to privacy, we have taken all precautions that we know of to assure that your records are not readily available to those who do not need access to them.</li>
              <li>If the health participant refuses to sign this consent for the purpose of health coaching operations, Shumard Chiropractic Inc. reserves the right to refuse acceptance of the health participant.</li>
              <li>Every effort is made to ensure cyber-security of your information, including password protection of computers, HIPAA-compliant email servers, and other means. No system is 100% secure and there are potential risks notwithstanding. The health participant agrees to hold Shumard Chiropractic Inc. harmless for information lost due to technical failures.</li>
              <li>Consultations can be conducted either by audio via phone, PracticeBetter Telehealth or similar, or through video conferencing via Skype, Zoom, G-Suite's 'Meet', PracticeBetter Telehealth or similar. If the transmission fails during your consultation, every reasonable effort will be made to help you get reconnected. There are risks associated with using tele-coaching, including, but may not be limited to a breach of privacy and or PHI due to failure in security protocols.</li>
            </ol>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">Your Rights</h4>
            <p>When it comes to your health information, you have certain rights. This section explains your rights and how to exercise them. Specifically, you have the right to:</p>
            
            <h5 className="font-semibold">1. Get an electronic or paper copy of your medical record</h5>
            <ul className="list-disc pl-5 space-y-1">
              <li>You can ask to see or get an electronic or paper copy of your medical record and other health information we have about you.</li>
              <li>We will provide a copy or a summary of your health information, usually within 30 days of your request.</li>
              <li>We may charge a reasonable, cost-based fee.</li>
            </ul>
            
            <h5 className="font-semibold">2. Ask us to correct or amend your medical record</h5>
            <ul className="list-disc pl-5 space-y-1">
              <li>You can ask us to correct health information about you that you think is incorrect or incomplete.</li>
              <li>We may say "no" to your request, but we will tell you why in writing, usually within 60 days of your request.</li>
            </ul>
            
            <h5 className="font-semibold">3. Request confidential communications</h5>
            <p>You can ask us to contact you in a specific way (for example, home or office phone) or to send mail to a different address. We will say "yes" to all reasonable requests.</p>
            
            <h5 className="font-semibold">4. Get a copy of this privacy notice</h5>
            <p>You can ask for a paper copy of this notice at any time, even if you have agreed to receive the notice electronically. We will provide you with a paper copy promptly.</p>
            
            <h5 className="font-semibold">5. Choose someone to act for you</h5>
            <p>If you have given someone health care power of attorney or if someone is your legal guardian, that person (your "personal representative") can exercise your rights and make choices about your health information.</p>
            
            <h5 className="font-semibold">6. File a complaint if you feel your rights are violated</h5>
            <p>Protecting your confidential information is important to us. If you feel we have violated your rights, please contact us. You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights by sending a letter to 200 Independence Avenue, SW, Washington, DC 20201, calling 1.877.696.6775, or visiting hhs.gov/ocr/privacy/hipaa/complaints/.</p>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">Your Choices</h4>
            <p>For certain health information, you can tell us your choices about what we share. If you have a clear preference for how we share your information in the situations described below, talk to us. In these cases, you have both the right and choice to tell us to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Share information with your family, close friends or others involved in your care.</li>
              <li>Share information in a disaster relief situation.</li>
              <li>Include your information in a hospital directory.</li>
            </ul>
            
            <p className="font-semibold">We never share your information unless you give us written authorization:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Marketing purposes</li>
              <li>Sale of your information</li>
              <li>Most, but not all, sharing of psychotherapy notes</li>
            </ol>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">How We May Use and Share Your Health Information</h4>
            <p>We may, without your written permission, use your health information within our organization and share or disclose your health information to others outside our organization for treatment, payment, and healthcare operations.</p>
            
            <h5 className="font-semibold">1. Treatment</h5>
            <p>We may use your health information and share it with other professionals who are treating you.</p>
            
            <h5 className="font-semibold">2. Payment</h5>
            <p>We may use and share your health information to bill and get payment from health plans or other entities.</p>
            
            <h5 className="font-semibold">3. Healthcare operations</h5>
            <p>We may use and disclose your health information to run our organization, improve your care, and contact you when necessary.</p>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">Our Responsibilities</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>We are required by law to maintain the privacy and security of your protected health information.</li>
              <li>We will let you know promptly if a breach occurs that may have compromised the privacy or security of your information.</li>
              <li>We must follow the duties and privacy practices described in this Notice and offer you a written copy of it.</li>
              <li>We will not use or share your information other than as described here unless you tell us we can do so in writing.</li>
            </ul>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">Changes to This Notice</h4>
            <p>We can change the terms of this Notice, and the changes will apply to all information we have about you. The new Notice will be available upon request and on our website.</p>
            
            <h4 className="text-lg font-bold text-gray-800 mt-6">Who To Contact</h4>
            <p>If you have any questions about this Notice, or any complaints, please contact Shumard Chiropractic Inc.</p>
            
            <p className="font-semibold mt-4">EFFECTIVE DATE OF THIS NOTICE: February, 2021</p>
            
            <p className="font-semibold text-teal-700 mt-6">
              Please sign below saying you have read, understand and agree to the Privacy Notice. Thank you.
            </p>
          </div>
          
          {/* Agreement Checkbox */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="hipaaAgreed"
                checked={hipaaAgreed}
                onCheckedChange={setHipaaAgreed}
              />
              <Label htmlFor="hipaaAgreed" className="text-sm leading-relaxed cursor-pointer">
                I have read, understand, and agree to the HIPAA Notice of Privacy Practices above.
              </Label>
            </div>
          </div>
          
          {/* Signature Section */}
          <div className="mt-6">
            <Label className="text-lg font-semibold">Your Signature *</Label>
            <p className="text-sm text-gray-600 mb-3">Please sign using your mouse or finger below</p>
            
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={hipaaSignatureRef}
                canvasProps={{
                  className: 'w-full h-48 bg-white',
                  style: { width: '100%', height: '200px' }
                }}
                backgroundColor="white"
                onEnd={() => {
                  if (hipaaSignatureRef.current) {
                    setHipaaSignature(hipaaSignatureRef.current.toDataURL('image/png'));
                  }
                }}
              />
            </div>
            
            <div className="flex justify-between items-center mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearHipaaSignature}
                className="text-gray-600"
              >
                Clear Signature
              </Button>
              <p className="text-sm text-gray-600">
                Date: <span className="font-semibold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderPart3 = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 3: Telehealth Consent</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          {/* Header with Doctor Info */}
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-6 mb-6 text-center">
            <h3 className="text-xl font-bold text-teal-700">DRSHUMARD</h3>
            <p className="font-semibold text-gray-800 mt-2">Dr. Shumard</p>
            <p className="text-gray-600 text-sm">740 Nordahl Rd, Suite 294</p>
            <p className="text-gray-600 text-sm">San Marcos CA 92069</p>
            <p className="text-gray-600 text-sm">858-564-7081</p>
            <p className="text-teal-600 text-sm">drjason@drshumard.com</p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            <p className="font-semibold">
              I understand that my health and wellness provider Dr. Shumard, DC wishes me to have a tele-health consultation.
            </p>
            
            <p>
              This means that through an interactive video connection, I will be able to consult with the above named provider about my health and wellness concerns.
            </p>
            
            <h4 className="font-bold text-gray-800">I understand there are potential risks with this technology:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>The video connection may not work or it may stop working during the consultation.</li>
              <li>The video picture or information transmitted may not be clear enough to be useful for the consultation.</li>
            </ul>
            
            <h4 className="font-bold text-gray-800">The benefits of a tele-health consultation are:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>I do not need to travel to the consult location.</li>
              <li>I have access to a specialist through this consultation.</li>
            </ul>
            
            <p>
              I also understand other individuals may need to use Practice Better tele-health platform and that they will take reasonable steps to maintain confidentiality of the information obtained. I also understand that this may be recorded for training purposes.
            </p>
            
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 my-4">
              <p className="font-semibold text-amber-800">
                I understand that I am paying for an initial consultation with Dr. Shumard or one of his director of admissions. I will be allowed to reschedule this appointment one time with no additional charge. If I reschedule this appointment I agree to put a credit card on file for my follow up visit. If I do not inform or cancel with Dr. Shumard at least 24 hrs prior to my rescheduled appointment I will then be charged an additional $97 that is non-refundable.
              </p>
            </div>
            
            <div className="bg-red-50 border-l-4 border-red-500 p-4 my-4">
              <p className="font-semibold text-red-800">
                I understand all cancellations must be received 24 hrs prior to my scheduled appointment, otherwise the paid consultation fee of $97.00 will be forfeited and nonrefundable.
              </p>
            </div>
            
            <p className="font-semibold">
              I have read this document and understand the risk and benefits of the tele-health consultation and have had my questions regarding the procedure explained and I hereby consent to participate in tele-health sessions under the conditions described in this document.
            </p>
            
            <div className="bg-teal-50 border-l-4 border-teal-500 p-4 my-4">
              <p className="font-bold text-teal-800">Client</p>
              <p className="text-teal-700">
                I have read, understand, and accept the information and conditions specified in this agreement.
              </p>
            </div>
          </div>
          
          {/* Agreement Checkbox */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="telehealthAgreed"
                checked={telehealthAgreed}
                onCheckedChange={setTelehealthAgreed}
              />
              <Label htmlFor="telehealthAgreed" className="text-sm leading-relaxed cursor-pointer">
                I have read, understand, and accept the information and conditions specified in this agreement.
              </Label>
            </div>
          </div>
          
          {/* Print Name */}
          <div className="mt-6">
            <Label htmlFor="printName" className="text-lg font-semibold">Print Name Here *</Label>
            <Input
              id="printName"
              value={telehealthPrintName}
              onChange={(e) => setTelehealthPrintName(e.target.value)}
              placeholder="Type your full legal name"
              className="mt-2 text-lg"
            />
          </div>
          
          {/* Signature Section */}
          <div className="mt-6">
            <Label className="text-lg font-semibold">Digital Signature *</Label>
            <p className="text-sm text-gray-600 mb-3">Please sign using your mouse or finger below</p>
            
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={telehealthSignatureRef}
                canvasProps={{
                  className: 'w-full h-48 bg-white',
                  style: { width: '100%', height: '200px' }
                }}
                backgroundColor="white"
                onEnd={() => {
                  if (telehealthSignatureRef.current) {
                    setTelehealthSignature(telehealthSignatureRef.current.toDataURL('image/png'));
                  }
                }}
              />
            </div>
            
            <div className="flex justify-between items-center mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearTelehealthSignature}
                className="text-gray-600"
              >
                Clear Signature
              </Button>
              <p className="text-sm text-gray-600">
                Date: <span className="font-semibold">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Auto-save indicator */}
      <div className="flex justify-end items-center gap-2 mb-4 text-sm text-gray-500">
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Saving...</span>
          </>
        ) : lastSaved ? (
          <>
            <Check className="w-4 h-4 text-green-500" />
            <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
          </>
        ) : null}
      </div>
      
      {/* Progress Indicator */}
      {renderProgressIndicator()}
      
      {/* Form Parts */}
      <AnimatePresence mode="wait">
        {currentPart === 1 && renderPart1()}
        {currentPart === 2 && renderPart2()}
        {currentPart === 3 && renderPart3()}
      </AnimatePresence>
      
      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-between items-center">
        <Button
          type="button"
          variant="outline"
          onClick={goToPreviousPart}
          disabled={currentPart === 1}
          className="flex items-center gap-2"
        >
          <ChevronLeft size={18} />
          Previous
        </Button>
        
        {currentPart < 3 ? (
          <Button
            type="button"
            onClick={goToNextPart}
            className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white flex items-center gap-2"
          >
            Next
            <ChevronRight size={18} />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white flex items-center gap-2 min-w-32"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check size={18} />
                Submit
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default IntakeForm;
