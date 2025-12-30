import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import SignatureCanvas from 'react-signature-canvas';

const Part3_TelehealthConsent = ({
  telehealthPrintName,
  setTelehealthPrintName,
  telehealthAgreed,
  setTelehealthAgreed,
  telehealthSignatureRef,
  telehealthSignature,
  setTelehealthSignature,
  clearTelehealthSignature
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 3: Telehealth Consent</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <p className="text-xl font-bold text-gray-800">DRSHUMARD</p>
            <p className="font-semibold text-gray-800 mt-2">Dr. Shumard</p>
            <p className="text-gray-600 text-sm">740 Nordahl Rd, Suite 294</p>
            <p className="text-gray-600 text-sm">San Marcos CA 92069</p>
            <p className="text-gray-600 text-sm">858-564-7081</p>
            <p className="text-gray-600 text-sm">drjason@drshumard.com</p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 text-sm">
            <p>I understand that my health and wellness provider Dr. Shumard, DC wishes me to have a tele-health consultation.</p>
            <p>This means that through an interactive video connection, I will be able to consult with the above named provider about my health and wellness concerns.</p>
            <p className="font-semibold mt-4">I understand there are potential risks with this technology:</p>
            <p>The video connection may not work or it may stop working during the consultation.</p>
            <p>The video picture or information transmitted may not be clear enough to be useful for the consultation.</p>
            <p className="font-semibold mt-4">The benefits of a tele-health consultation are:</p>
            <p>I do not need to travel to the consult location.</p>
            <p>I have access to a specialist through this consultation.</p>
            <p className="mt-4">I also understand other individuals may need to use Practice Better tele-health platform and that they will take reasonable steps to maintain confidentiality of the information obtained. I also understand that this may be recorded for training purposes.</p>
            <p className="mt-4">I understand that I am paying for an initial consultation with Dr. Shumard or one of his director of admissions. I will be allowed to reschedule this appointment one time with no additional charge. If I reschedule this appointment I agree to put a credit card on file for my follow up visit. If I do not inform or cancel with Dr. Shumard at least 24 hrs prior to my rescheduled appointment I will then be charged an additional $97 that is non-refundable.</p>
            <p className="mt-4">I understand all cancellations must be received 24 hrs prior to my scheduled appointment, otherwise the paid consultation fee of $97.00 will be forfeited and nonrefundable.</p>
            <p className="mt-4">I have read this document and understand the risk and benefits of the tele-health consultation and have had my questions regarding the procedure explained and I hereby consent to participate in tele-health sessions under the conditions described in this document.</p>
            <p className="font-semibold mt-4">Client</p>
            <p>I have read, understand, and accept the information and conditions specified in this agreement.</p>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox id="telehealthAgreed" checked={telehealthAgreed} onCheckedChange={setTelehealthAgreed} />
              <Label htmlFor="telehealthAgreed" className="text-sm leading-relaxed cursor-pointer">I have read, understand, and accept the information and conditions specified in this agreement.</Label>
            </div>
          </div>
          
          <div className="mt-6">
            <Label htmlFor="telehealthPrintName" className="text-lg font-semibold">Print Name Here *</Label>
            <Input id="telehealthPrintName" value={telehealthPrintName} onChange={(e) => setTelehealthPrintName(e.target.value)} placeholder="Type your full legal name" className="mt-2 text-lg" />
          </div>
          
          <div className="mt-6" id="telehealthSignature" data-field="telehealthSignature">
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
    </div>
  );
};

export default Part3_TelehealthConsent;
