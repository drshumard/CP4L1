import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Plus, Trash2 } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Constants
const COUNTRIES = [
  'United States',
  'Argentina', 'Bahamas', 'Barbados', 'Belize', 'Bolivia', 'Brazil', 'Canada',
  'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Dominican Republic', 'Ecuador',
  'El Salvador', 'Guatemala', 'Guyana', 'Haiti', 'Honduras', 'Jamaica', 'Mexico',
  'Nicaragua', 'Panama', 'Paraguay', 'Peru', 'Puerto Rico', 'Suriname',
  'Trinidad and Tobago', 'Uruguay', 'Venezuela'
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming', 'District of Columbia', 'Puerto Rico', 'Guam', 'American Samoa',
  'U.S. Virgin Islands', 'Northern Mariana Islands'
];

const MOTIVATION_LEVELS = [
  { value: '1-3', label: '1-3 (Low)' },
  { value: '4-6', label: '4-6 (Moderate)' },
  { value: '7-8', label: '7-8 (High)' },
  { value: '9-10', label: '9-10 (Very High)' }
];

const SEVERITY_LEVELS = [
  { value: 'Minimal', label: 'Minimal', description: 'annoying but causing no limitation' },
  { value: 'Slight', label: 'Slight', description: 'tolerable but causing a little limitation' },
  { value: 'Moderate', label: 'Moderate', description: 'sometimes tolerable but definitely causing limitation' },
  { value: 'Severe', label: 'Severe', description: 'causing significant limitation' },
  { value: 'Extreme', label: 'Extreme', description: 'causing near constant limitation (>80% of the time)' }
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

const Part1_DiabetesProfile = ({ 
  formData, 
  handleInputChange, 
  addMedicationRow, 
  removeMedicationRow, 
  updateMedication, 
  toggleSymptom, 
  toggleRecentTest 
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Intake Forms: Diabetes</h2>
        <p className="text-gray-600 mt-2">Please complete all sections below</p>
        <div className="hr-gradient mt-4"></div>
      </div>

      {/* General Information */}
      <Card className="border-0 shadow-md hover-lift card-accent overflow-hidden">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">General Information *</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Legal First Name *</Label>
              <Input id="legalFirstName" value={formData.legalFirstName} onChange={(e) => handleInputChange('legalFirstName', e.target.value)} placeholder="Legal first name" />
            </div>
            <div className="space-y-2">
              <Label>Legal Last Name *</Label>
              <Input id="legalLastName" value={formData.legalLastName} onChange={(e) => handleInputChange('legalLastName', e.target.value)} placeholder="Legal last name" />
            </div>
            <div className="space-y-2">
              <Label>Preferred First Name</Label>
              <Input id="preferredFirstName" value={formData.preferredFirstName} onChange={(e) => handleInputChange('preferredFirstName', e.target.value)} placeholder="Preferred name (optional)" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input id="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} placeholder="email@example.com" disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label>Preferred Phone</Label>
              <Input id="phone" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2" data-field="dateOfBirth">
              <Label>Date of Birth *</Label>
              <DatePicker
                id="dateOfBirth"
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
              <Label>Relationship Status *</Label>
              <Select value={formData.relationshipStatus} onValueChange={(v) => handleInputChange('relationshipStatus', v)}>
                <SelectTrigger id="relationshipStatus"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={formData.gender} onValueChange={(v) => handleInputChange('gender', v)}>
                <SelectTrigger id="gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Weight</Label>
              <Input id="weight" value={formData.weight} onChange={(e) => handleInputChange('weight', e.target.value)} placeholder="e.g., 180 lbs" />
            </div>
            <div className="space-y-2">
              <Label>Current Date *</Label>
              <Input id="currentDate" value={formData.currentDate?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} disabled className="bg-gray-50" />
            </div>
          </div>

          {/* Address */}
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Address</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Street *</Label>
                <Input id="street" value={formData.street} onChange={(e) => handleInputChange('street', e.target.value)} placeholder="Street address" required />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input id="unit" value={formData.unit} onChange={(e) => handleInputChange('unit', e.target.value)} placeholder="Apt, Suite, etc." />
              </div>
              <div className="space-y-2">
                <Label>Town/City *</Label>
                <Input id="town" value={formData.town} onChange={(e) => handleInputChange('town', e.target.value)} placeholder="City/Town" required />
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select value={formData.country} onValueChange={(v) => handleInputChange('country', v)} required>
                  <SelectTrigger id="country"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>State/Province *</Label>
                {formData.country === 'United States' ? (
                  <Select value={formData.state} onValueChange={(v) => handleInputChange('state', v)} required>
                    <SelectTrigger id="state"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="state" value={formData.state} onChange={(e) => handleInputChange('state', e.target.value)} placeholder="State/Province/Region" required />
                )}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Postal Code *</Label>
                <Input id="postalCode" value={formData.postalCode} onChange={(e) => handleInputChange('postalCode', e.target.value)} placeholder="ZIP/Postal code" className="md:w-1/2" required />
              </div>
            </div>
          </div>

          {/* Occupation & Referred By (moved from Contact Information) */}
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Occupation</Label>
                <Input id="occupation" value={formData.occupation} onChange={(e) => handleInputChange('occupation', e.target.value)} placeholder="Your occupation" />
              </div>
              <div className="space-y-2">
                <Label>Referred By</Label>
                <Input id="referredBy" value={formData.referredBy} onChange={(e) => handleInputChange('referredBy', e.target.value)} placeholder="How did you hear about us?" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Goals and Concerns */}
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Goals and Concerns</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>List Your Main Problems *</Label>
              <Textarea id="mainProblems" value={formData.mainProblems} onChange={(e) => handleInputChange('mainProblems', e.target.value)} placeholder="Describe your main health concerns..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>What are you hoping happens today as a result of your consultation? *</Label>
              <Textarea id="hopedOutcome" value={formData.hopedOutcome} onChange={(e) => handleInputChange('hopedOutcome', e.target.value)} placeholder="What outcomes are you hoping for?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>If you cannot find a solution to your problem what do you think will happen? *</Label>
              <Textarea id="noSolutionOutcome" value={formData.noSolutionOutcome} onChange={(e) => handleInputChange('noSolutionOutcome', e.target.value)} placeholder="What concerns do you have if this isn't resolved?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>What interventions have you tried in the past that have NOT succeeded?</Label>
              <Textarea id="previousInterventions" value={formData.previousInterventions} onChange={(e) => handleInputChange('previousInterventions', e.target.value)} placeholder="e.g., diet, cleanse, medication, supplement, etc." rows={3} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2" data-field="severityLevel">
                <Label>Severity of your problem *</Label>
                <Select value={formData.severityLevel} onValueChange={(v) => handleInputChange('severityLevel', v)}>
                  <SelectTrigger id="severityLevel" className="w-full"><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent className="max-w-[90vw]">
                    {SEVERITY_LEVELS.map(l => (
                      <SelectItem key={l.value} value={l.value} className="whitespace-normal">
                        <div className="flex flex-col">
                          <span className="font-medium">{l.label}</span>
                          <span className="text-xs text-gray-500">{l.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2" data-field="motivationLevel">
                <Label>Motivation Level *</Label>
                <Select value={formData.motivationLevel} onValueChange={(v) => handleInputChange('motivationLevel', v)}>
                  <SelectTrigger id="motivationLevel"><SelectValue placeholder="Select motivation (10 = highest)" /></SelectTrigger>
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
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Prior Medical History</h3>
          <div className="space-y-2">
            <Label>Please state if you have any previous diagnosis and dates when this occurred</Label>
            <Textarea id="priorMedicalHistory" value={formData.priorMedicalHistory} onChange={(e) => handleInputChange('priorMedicalHistory', e.target.value)} placeholder="List any previous diagnoses and their dates..." rows={4} />
          </div>
        </CardContent>
      </Card>

      {/* Medications and Supplements */}
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Medications and Supplements *</h3>
          <p className="text-sm text-gray-600 mb-4">Please list Current Medications and dosage, or select "None" if not applicable.</p>
          
          {/* None checkbox */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.noMedications || false}
                onChange={(e) => {
                  handleInputChange('noMedications', e.target.checked);
                  // If "None" is checked, clear the medications list
                  if (e.target.checked) {
                    handleInputChange('medications', [{ name: '', dosage: '' }]);
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-600">None - I am not currently taking any medications or supplements</span>
            </label>
          </div>
          
          {/* Medication inputs - disabled if "None" is checked */}
          <div className={`space-y-3 ${formData.noMedications ? 'opacity-50 pointer-events-none' : ''}`}>
            {formData.medications.map((med, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input id={`medication-name-${index}`} value={med.name} onChange={(e) => updateMedication(index, 'name', e.target.value)} placeholder="Medication/Supplement name" disabled={formData.noMedications} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dosage</Label>
                  <Input id={`medication-dosage-${index}`} value={med.dosage} onChange={(e) => updateMedication(index, 'dosage', e.target.value)} placeholder="e.g., 500mg daily" disabled={formData.noMedications} />
                </div>
                <div className="flex items-end">
                  {formData.medications.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMedicationRow(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50" disabled={formData.noMedications}>
                      <Trash2 size={18} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            <Button type="button" variant="outline" onClick={addMedicationRow} className="w-full border-dashed border-2 border-teal-300 text-teal-600 hover:bg-teal-50" disabled={formData.noMedications}>
              <Plus size={18} className="mr-2" /> Add Row
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Review of Symptoms */}
      <Card className="border-0 shadow-sm hover-lift">
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
                        id={`symptom-${category}-${symptom}`.replace(/[\s\/]/g, '-')}
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
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Allergies/Other</h3>
          <div className="space-y-2">
            <Label>List any allergies (drugs, food, environmental)</Label>
            <Textarea id="allergies" value={formData.allergies} onChange={(e) => handleInputChange('allergies', e.target.value)} placeholder="List any known allergies..." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Recent Tests */}
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Recent Tests</h3>
          <p className="text-sm text-gray-600 mb-3">Select any recent tests you&apos;ve had:</p>
          <div className="flex flex-wrap gap-3">
            {RECENT_TESTS.map(test => (
              <label key={test} className="flex items-center gap-2 text-sm cursor-pointer bg-gray-50 px-3 py-2 rounded-lg hover:bg-gray-100">
                <Checkbox id={`test-${test}`} checked={formData.recentTests.includes(test)} onCheckedChange={() => toggleRecentTest(test)} />
                <span>{test}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Other Providers */}
      <Card className="border-0 shadow-sm hover-lift">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-teal-700 mb-4 border-b pb-2">Other Providers</h3>
          <div className="space-y-2">
            <Label>List any other healthcare providers you are currently seeing</Label>
            <Textarea id="otherProviders" value={formData.otherProviders} onChange={(e) => handleInputChange('otherProviders', e.target.value)} placeholder="Name, specialty, reason for treatment..." rows={3} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Part1_DiabetesProfile;
