import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import SignatureCanvas from 'react-signature-canvas';

const Part2_HIPAAConsent = ({
  hipaaAgreed,
  setHipaaAgreed,
  hipaaPrintName,
  setHipaaPrintName,
  hipaaSignatureRef,
  hipaaSignature,
  setHipaaSignature,
  clearHipaaSignature
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Part 2: HIPAA - Notice of Privacy</h2>
        <p className="text-gray-600 mt-2">Please read and sign below</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-700 font-medium">Please read the information below and then sign at the bottom of the form. Thank you so much!</p>
          </div>
          
          <div className="prose prose-sm max-w-none text-gray-700 space-y-3 text-sm">
            <h3 className="text-lg font-bold text-gray-800">Notice Of Privacy Practices</h3>
            <p className="font-semibold text-red-600 text-xs">THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.</p>
            <p>Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant&apos;s privacy and the confidentiality of your health information. This notice explains our privacy practices, as well as your rights, with regard to your health information.</p>
            <p>We want you to know how your Protected Health Information (PHI) is going to be used in our coaching program and your rights concerning those records. Before we will begin any health coaching we require you to read and sign this consent form stating that you understand and agree with how your records will be used.</p>
            <p className="font-semibold">Some of the terms of uses include:</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>The health participant understands that Shumard Chiropractic Inc. and partnering laboratories transmit health information (such as lab results) electronically via a secure internet connection. Shumard Chiropractic Inc. has taken the necessary precautions to enhance all security; Shumard Chiropractic Inc. cannot be held liable if there is any security breach on the part of the laboratories.</li>
              <li>A health participant&apos;s written consent need only be obtained one time for all subsequent coaching given to the health participant.</li>
              <li>For your security and right to privacy, we have taken all precautions that we know of to assure that your records are not readily available to those who do not need access to them.</li>
              <li>If the health participant refuses to sign this consent for the purpose of health coaching operations, Shumard Chiropractic Inc. reserves the right to refuse acceptance of the health participant.</li>
              <li>Every effort is made to ensure cyber-security of your information, including password protection of computers, HIPAA-compliant email servers, and other means. No system is 100% secure and there are potential risks notwithstanding. The health participant agrees to hold Shumard Chiropractic Inc. harmless for information lost due to technical failures.</li>
              <li>Consultations can be conducted either by audio via phone, PracticeBetter Telehealth or similar, or through video conferencing via Skype, Zoom, G-Suite&apos;s &apos;Meet&apos;, PracticeBetter Telehealth or similar. If the transmission fails during your consultation, every reasonable effort will be made to help you get reconnected. There are risks associated with using tele-coaching, including, but may not be limited to a breach of privacy and or PHI due to failure in security protocols.</li>
            </ol>
            <h4 className="font-bold text-gray-800 mt-4">Your Rights</h4>
            <p>When it comes to your health information, you have certain rights. This section explains your rights and how to exercise them. Specifically, you have the right to:</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li><strong>Get an electronic or paper copy of your medical record</strong> - You can ask to see or get an electronic or paper copy of your medical record and other health information we have about you. We will provide a copy or a summary of your health information, usually within 30 days of your request. We may charge a reasonable, cost-based fee.</li>
              <li><strong>Ask us to correct or amend your medical record</strong> - You can ask us to correct health information about you that you think is incorrect or incomplete. We may say &quot;no&quot; to your request, but we will tell you why in writing, usually within 60 days of your request.</li>
              <li><strong>Request confidential communications</strong> - You can ask us to contact you in a specific way (for example, home or office phone) or to send mail to a different address. We will say &quot;yes&quot; to all reasonable requests.</li>
              <li><strong>Get a copy of this privacy notice</strong> - You can ask for a paper copy of this notice at any time, even if you have agreed to receive the notice electronically. We will provide you with a paper copy promptly.</li>
              <li><strong>Choose someone to act for you</strong> - If you have given someone health care power of attorney or if someone is your legal guardian, that person (your &quot;personal representative&quot;) can exercise your rights and make choices about your health information.</li>
              <li><strong>File a complaint if you feel your rights are violated</strong> - Protecting your confidential information is important to us. If you feel we have violated your rights, please contact us. You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights.</li>
            </ol>
            <h4 className="font-bold text-gray-800 mt-4">Your Choices</h4>
            <p>For certain health information, you can tell us your choices about what we share. In these cases, you have both the right and choice to tell us to: share information with your family, close friends or others involved in your care; share information in a disaster relief situation; include your information in a hospital directory.</p>
            <p className="font-semibold">We never share your information unless you give us written authorization:</p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>Marketing purposes</li>
              <li>Sale of your information</li>
              <li>Most, but not all, sharing of psychotherapy notes</li>
            </ul>
            <h4 className="font-bold text-gray-800 mt-4">How We May Use and Share Your Health Information</h4>
            <p>We may, without your written permission, use your health information within our organization and share or disclose your health information to others outside our organization for treatment, payment, and healthcare operations.</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li><strong>Treatment</strong> - We may use your health information and share it with other professionals who are treating you.</li>
              <li><strong>Payment</strong> - We may use and share your health information to bill and get payment from health plans or other entities.</li>
              <li><strong>Healthcare operations</strong> - We may use and disclose your health information to run our organization, improve your care, and contact you when necessary.</li>
            </ol>
            <h4 className="font-bold text-gray-800 mt-4">Our Responsibilities</h4>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>We are required by law to maintain the privacy and security of your protected health information.</li>
              <li>We will let you know promptly if a breach occurs that may have compromised the privacy or security of your information.</li>
              <li>We must follow the duties and privacy practices described in this Notice and offer you a written copy of it.</li>
              <li>We will not use or share your information other than as described here unless you tell us we can do so in writing.</li>
            </ul>
            <h4 className="font-bold text-gray-800 mt-4">Changes to This Notice</h4>
            <p>We can change the terms of this Notice, and the changes will apply to all information we have about you. The new Notice will be available upon request and on our website.</p>
            <h4 className="font-bold text-gray-800 mt-4">Who To Contact For Information or With a Complaint</h4>
            <p>If you have any questions about this Notice, or any complaints, please contact Shumard Chiropractic Inc.</p>
            <p className="font-semibold mt-4">EFFECTIVE DATE OF THIS NOTICE: February, 2021</p>
            <p className="font-semibold text-teal-700 mt-4">Please sign below saying you have read, understand and agree to the Privacy Notice. Thank you.</p>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start space-x-3">
              <Checkbox id="hipaaAgreed" checked={hipaaAgreed} onCheckedChange={setHipaaAgreed} />
              <Label htmlFor="hipaaAgreed" className="text-sm leading-relaxed cursor-pointer">I have read, understand, and agree to the HIPAA Notice of Privacy Practices above.</Label>
            </div>
          </div>
          
          <div className="mt-6">
            <Label htmlFor="hipaaPrintName" className="text-lg font-semibold">Print Name Here *</Label>
            <Input id="hipaaPrintName" value={hipaaPrintName} onChange={(e) => setHipaaPrintName(e.target.value)} placeholder="Type your full legal name" className="mt-2 text-lg" />
          </div>
          
          <div className="mt-6" id="hipaaSignature" data-field="hipaaSignature">
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
    </div>
  );
};

export default Part2_HIPAAConsent;
