import io
import base64
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Brand colors
TEAL_PRIMARY = colors.HexColor('#0D9488')
TEAL_DARK = colors.HexColor('#115E59')
GRAY_BG = colors.HexColor('#F8FAFC')
GRAY_BORDER = colors.HexColor('#E2E8F0')
LABEL_BG = colors.HexColor('#F1F5F9')

# Consistent column widths for uniform alignment
LABEL_WIDTH = 2.0 * inch
VALUE_WIDTH = 5.0 * inch
TOTAL_WIDTH = 7.0 * inch

def create_intake_form_pdf(form_data: dict, user_name: str, user_email: str) -> bytes:
    """Generate a professionally styled PDF with uniform table-based layout."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, textColor=TEAL_PRIMARY, spaceAfter=4, alignment=TA_CENTER, fontName='Helvetica-Bold')
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, textColor=colors.gray, alignment=TA_CENTER, spaceAfter=12)
    section_style = ParagraphStyle('SectionHeader', parent=styles['Heading2'], fontSize=11, textColor=colors.white, spaceBefore=12, spaceAfter=0, fontName='Helvetica-Bold')
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=8, textColor=TEAL_DARK, fontName='Helvetica-Bold', leading=10)
    value_style = ParagraphStyle('Value', parent=styles['Normal'], fontSize=8, textColor=colors.black, leading=10)
    small_style = ParagraphStyle('SmallText', parent=styles['Normal'], fontSize=7, textColor=colors.gray, leading=9)
    
    story = []
    profile = form_data.get('profileData', {})
    
    # ===== HELPER FUNCTIONS =====
    
    def create_section_header(title):
        """Create a teal section header bar"""
        t = Table([[Paragraph(title, section_style)]], colWidths=[TOTAL_WIDTH])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), TEAL_PRIMARY),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        return t
    
    def create_row(label, value):
        """Create a single uniform row with label and value"""
        value_text = str(value) if value else 'N/A'
        data = [[Paragraph(f"<b>{label}</b>", label_style), Paragraph(value_text, value_style)]]
        t = Table(data, colWidths=[LABEL_WIDTH, VALUE_WIDTH])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), LABEL_BG),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        return t
    
    def create_two_column_row(label1, value1, label2, value2):
        """Create a row with two label-value pairs"""
        half_label = 1.0 * inch
        half_value = 2.5 * inch
        data = [[
            Paragraph(f"<b>{label1}</b>", label_style), 
            Paragraph(str(value1) if value1 else 'N/A', value_style),
            Paragraph(f"<b>{label2}</b>", label_style), 
            Paragraph(str(value2) if value2 else 'N/A', value_style)
        ]]
        t = Table(data, colWidths=[half_label, half_value, half_label, half_value])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), LABEL_BG),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('BACKGROUND', (2, 0), (2, -1), LABEL_BG),
            ('BACKGROUND', (3, 0), (3, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        return t
    
    # ===== HEADER =====
    story.append(Paragraph("INTAKE FORMS: DIABETES", title_style))
    story.append(Paragraph(f"Patient: {user_name} | Email: {user_email}", subtitle_style))
    story.append(Paragraph(f"Submitted: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", small_style))
    story.append(Spacer(1, 8))
    
    # ===== GENERAL INFORMATION =====
    story.append(create_section_header("GENERAL INFORMATION"))
    
    dob = profile.get('dateOfBirth', '')[:10] if profile.get('dateOfBirth') else 'N/A'
    current_date = profile.get('currentDate', '')[:10] if profile.get('currentDate') else 'N/A'
    
    story.append(create_two_column_row('Legal First Name', profile.get('legalFirstName'), 'Legal Last Name', profile.get('legalLastName')))
    story.append(create_two_column_row('Preferred Name', profile.get('preferredFirstName'), 'Email', profile.get('email', user_email)))
    story.append(create_two_column_row('Phone', profile.get('phone'), 'Date of Birth', dob))
    story.append(create_two_column_row('Gender', profile.get('gender'), 'Relationship Status', profile.get('relationshipStatus')))
    story.append(create_two_column_row('Weight', profile.get('weight'), 'Form Date', current_date))
    
    # Address - in same row format
    address_parts = []
    if profile.get('street'): address_parts.append(profile.get('street'))
    if profile.get('unit'): address_parts.append(profile.get('unit'))
    if profile.get('town'): address_parts.append(profile.get('town'))
    if profile.get('postalCode'): address_parts.append(profile.get('postalCode'))
    if profile.get('country'): address_parts.append(profile.get('country'))
    address_str = ', '.join(address_parts) if address_parts else 'N/A'
    
    story.append(create_row('Address', address_str))
    story.append(create_two_column_row('Occupation', profile.get('occupation'), 'Referred By', profile.get('referredBy')))
    
    story.append(Spacer(1, 8))
    
    # ===== GOALS AND CONCERNS =====
    story.append(create_section_header("GOALS AND CONCERNS"))
    story.append(create_row('Main Problems', profile.get('mainProblems')))
    story.append(create_row('Hoped Outcome', profile.get('hopedOutcome')))
    story.append(create_row('If No Solution Found', profile.get('noSolutionOutcome')))
    story.append(create_row('Previous Interventions', profile.get('previousInterventions')))
    story.append(create_two_column_row('Severity Level', profile.get('severityLevel'), 'Motivation Level', profile.get('motivationLevel')))
    
    story.append(Spacer(1, 8))
    
    # ===== PRIOR MEDICAL HISTORY =====
    story.append(create_section_header("PRIOR MEDICAL HISTORY"))
    story.append(create_row('Previous Diagnosis & Dates', profile.get('priorMedicalHistory')))
    
    story.append(Spacer(1, 8))
    
    # ===== MEDICATIONS AND SUPPLEMENTS =====
    story.append(create_section_header("MEDICATIONS AND SUPPLEMENTS"))
    medications = profile.get('medications', [])
    med_list = []
    for med in medications:
        if med.get('name') or med.get('dosage'):
            med_str = f"{med.get('name', '')} - {med.get('dosage', '')}" if med.get('dosage') else med.get('name', '')
            med_list.append(med_str)
    
    if med_list:
        story.append(create_row('Current Medications', '\n'.join(med_list)))
    else:
        story.append(create_row('Current Medications', 'None listed'))
    
    story.append(Spacer(1, 8))
    
    # ===== REVIEW OF SYMPTOMS =====
    story.append(create_section_header("REVIEW OF SYMPTOMS"))
    symptoms = profile.get('symptoms', {})
    symptom_categories = ['CONSTITUTIONAL', 'EYES', 'EAR/NOSE/MOUTH/THROAT', 'PSYCHIATRIC', 'GENITOURINARY', 'GASTROINTESTINAL', 'ENDOCRINE', 'MUSCULOSKELETAL', 'INTEGUMENTARY', 'NEUROLOGICAL', 'HEMATOLOGIC/LYMPHATIC']
    
    has_symptoms = False
    for category in symptom_categories:
        category_symptoms = symptoms.get(category, [])
        if category_symptoms:
            has_symptoms = True
            story.append(create_row(category.title(), ', '.join(category_symptoms)))
    
    if not has_symptoms:
        story.append(create_row('Symptoms', 'No symptoms reported'))
    
    # Allergies
    if profile.get('allergies'):
        story.append(create_row('Allergies', profile.get('allergies')))
    
    # Recent Tests
    if profile.get('recentTests'):
        story.append(create_row('Recent Tests', ', '.join(profile.get('recentTests', []))))
    
    # Other Providers
    if profile.get('otherProviders'):
        story.append(create_row('Other Providers', profile.get('otherProviders')))
    
    story.append(PageBreak())
    
    # ===== HIPAA NOTICE =====
    story.append(create_section_header("HIPAA - NOTICE OF PRIVACY"))
    
    hipaa_full_text = """Notice Of Privacy Practices

THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.

Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant's privacy and the confidentiality of your health information. This notice explains our privacy practices, as well as your rights, with regard to your health information.

We want you to know how your Protected Health Information (PHI) is going to be used in our coaching program and your rights concerning those records. Before we will begin any health coaching we require you to read and sign this consent form stating that you understand and agree with how your records will be used.

Some of the terms of uses include:

1. The health participant understands that Shumard Chiropractic Inc. and partnering laboratories transmit health information (such as lab results) electronically via a secure internet connection. Shumard Chiropractic Inc. has taken the necessary precautions to enhance all security; Shumard Chiropractic Inc. cannot be held liable if there is any security breach on the part of the laboratories.

2. A health participant's written consent need only be obtained one time for all subsequent coaching given to the health participant.

3. For your security and right to privacy, we have taken all precautions that we know of to assure that your records are not readily available to those who do not need access to them.

4. If the health participant refuses to sign this consent for the purpose of health coaching operations, Shumard Chiropractic Inc. reserves the right to refuse acceptance of the health participant.

5. Every effort is made to ensure cyber-security of you information, including password protection of computers, HIPAA-compliant email servers, and other means. No system is 100% secure and there are potential risks notwithstanding. The health participant agrees to hold Shumard Chiropractic Inc. harmless for information lost due to technical failures.

6. Consultations can be conducted either by audio via phone, PracticeBetter Telehealth or similar, or through video conferencing via Skype, Zoom, G-Suite's 'Meet', PracticeBetter Telehealth or similar. If the transmission fails during your consultation, every reasonable effort will be made to help you get reconnected. There are risks associated with using tele-coaching, including, but may not be limited to a breach of privacy and or PHI due to failure in security protocols.

Your Rights

When it comes to your health information, you have certain rights. This section explains your rights and how to exercise them. Specifically, you have the right to:

1. Get an electronic or paper copy of your medical record
You can ask to see or get an electronic or paper copy of your medical record and other health information we have about you. We will provide a copy or a summary of your health information, usually within 30 days of your request. We may charge a reasonable, cost-based fee.

2. Ask us to correct or amend your medical record
You can ask us to correct health information about you that you think is incorrect or incomplete. We may say "no" to your request, but we will tell you why in writing, usually within 60 days of your request.

3. Request confidential communications
You can ask us to contact you in a specific way (for example, home or office phone) or to send mail to a different address. We will say "yes" to all reasonable requests. Ask us to limit what we use or share. You can ask us not to use or share certain health information for treatment, payment, or our operations. We are not required to agree to these requests. For example, we may say "no" if it would affect your care. If you pay for a service or health care item out-of-pocket in full, you can ask us not to share that information for the purpose of payment or our operations with your health insurer. We will say "yes" unless a law requires us to share that information. Obtain a list of those with whom we have shared your information. You can ask us for a list (accounting) of the instances we have shared your health information for six years prior to the date you ask, with whom we shared it, and why. We will include all the disclosures except for those about treatment, payment, or health care operations, and certain other disclosures (such as any you asked us to make). We will provide one accounting per year for free but may charge a reasonable, cost-based fee if you ask for another one within 12 months.

4. Get a copy of this privacy notice
You can ask for a paper copy of this notice at any time, even if you have agreed to receive the notice electronically. We will provide you with a paper copy promptly.

5. Choose someone to act for you
If you have given someone health care power of attorney or if someone is your legal guardian, that person (your "personal representative") can exercise your rights and make choices about your health information. If someone has been appointed to act for you, a copy of the document appointing that person must be provided to us. We will make reasonable efforts to ensure the person has this authority and can act for you before we take any action.

6. File a complaint if you feel your rights are violated
Protecting your confidential information is important to us. If you feel we have violated your rights, please contact us using the information at the end of this Notice. You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights by sending a letter to 200 Independence Avenue, SW, Washington, DC 20201, calling 1.877.696.6775, or visiting hhs.gov/ocr/privacy/hipaa/complaints/. We will not retaliate against you for filing a complaint either to NM or to the Office for Civil Rights.

Please ask us how to accomplish any of the above items by contacting us using the information at the end of this Notice. You may have to complete a form and submit your request in writing. For example, to obtain a copy, amend or restrict your medical records, or to receive a listing of disclosures you must fill out a form.

Your Choices

For certain health information, you can tell us your choices about what we share. If you have a clear preference for how we share your information in the situations described below, talk to us. Tell us what you want us to do, and we will follow your instructions. In these cases, you have both the right and choice to tell us to:
- Share information with your family, close friends or others involved in your care.
- Share information in a disaster relief situation.
- Include your information in a hospital directory.

If you are not able to tell us your preference (for example, if you are unconscious), we may go ahead and share your information if we believe it is in your best interest. We may also share your information when needed to lessen a serious and imminent threat to health or safety.

We never share your information unless you give us written authorization:
1. Marketing purposes
2. Sale of your information
3. Most, but not all, sharing of psychotherapy notes

How We May Use and Share Your Health Information

We may, without your written permission, use your health information within our organization and share or disclose your health information to others outside our organization for treatment, payment, and healthcare operations. We may use and disclose your health information without your written authorization for treatment, payment and health care operations.

1. Treatment
We may use your health information and share it with other professionals who are treating you. For example, a physician treating you for an injury may ask another physician about your overall health condition. Note, however, that we may ask for your written permission if certain kinds of information are being disclosed (such as mental health information). We may keep your information electronically using and electronic medical record ("EMR"). In some cases, you may be asked to give permission to allow the sharing of your health information.

2. Payment
We may use and share your health information to bill and get payment from health plans or other entities. For example, we may send health information about you to your health insurance plan so it will pay for your services. We may also disclose your information to other providers for their payment activities.

3. Healthcare operations
We may use and disclose your health information to run our organization, improve your care, and contact you when necessary. For example, we use health information to manage your treatment and services, including to contact you to remind you that you have an appointment for medical care. We may also disclose information to clinicians, residents and fellows, medical students, and other authorized personnel for educational and learning purposes. Those instances that require the use or disclosure of your health information we may disclose your health information without your written permission: With some limited exceptions, to you or someone who has the legal right to act on your behalf (your personal representative). To the Secretary of the Department of Health and Human Services, if necessary, to make sure your privacy is protected. When required by law.

4. Other purposes for which we are allowed or required to use or disclose your health information:
We may use or disclose your health information to others without your written permission in other ways, usually in ways that contribute to the public good, such as public health and research. We must meet many conditions in the law before we can share your information for these purposes. For more information see: hhs.gov/ocr/privacy/hipaa/understanding/consumers/index.html.

Examples include:
- To help with public health and safety issues we may share health information about you for certain situations such as: Preventing disease, Helping with product recalls, Reporting adverse reactions to medications, Reporting suspected abuse, neglect or domestic violence, Preventing or reducing a serious threat to anyone's health or safety.
- To work with a coroner, medical examiner or funeral director we may share health information with a coroner, medical examiner or funeral director when an individual dies.
- To address workers' compensation, law enforcement, and other government requests we may use or share health information about you: For workers' compensation claims, For law enforcement purposes or with a law enforcement official, With health oversight agencies for activities authorized by law, For special government functions such as military, national security, and presidential protective services.
- To respond to lawsuits and legal actions, we may disclose health information about you in response to a court or administrative order, or non-sensitive information in response to a subpoena if there is a qualified protective order or satisfactory assurances.
- To business associates: We may disclose your health information to our "business associates," or individuals or companies that provide services to us. For example, a business associate would include the company that administers the billing claims for us, a software vendor, a telehealth or other digital health solutions company, and other service providers. We require that business associates keep your information safe.
- To parents and legal guardians of minors: We may share a minor's health information with his or her parents or guardians unless such disclosure is otherwise prohibited by law.

Additional State and Federal Requirements

Some State and federal laws provide additional privacy protection of your health information. These include:
- Sensitive health information. Some types of health information are particularly sensitive, and the law, with limited exceptions, may require that we obtain your written permission or in some instances, a court order, to use or disclose that information. Sensitive health information includes information dealing with mental health and developmental disabilities, HIV/AIDS, alcohol and drug abuse treatment, genetic testing and genetic counseling.
- Prior to receiving care from us, a patient signs, where required by law, a consent to allow us to use and disclose sensitive health information in the same way that the Health Insurance Portability and Accountability Act of 1996 ("HIPAA") allows us to use and share non-sensitive health information for treatment, payment and healthcare operations as described in this Notice.
- Information used in certain disciplinary proceedings. State law may require your written permission if certain health information is to be used in various review and disciplinary proceedings by state health oversight boards.
- Information used in certain litigation proceedings. State law may require your written permission for certain providers to disclose information in certain legal proceedings.
- Disclosures to certain registries. Some laws require your written permission if we disclose your health information to certain state-sponsored registries.

We are committed to following all applicable state and federal legal requirements.

Our Responsibilities

- We are required by law to maintain the privacy and security of your protected health information.
- We will let you know promptly if a breach occurs that may have compromised the privacy or security of your information.
- We must follow the duties and privacy practices described in this Notice and offer you a written copy of it.
- We will not use or share your information other than as described here unless you tell us we can do so in writing. If you tell us we can, you may change your mind at any time. Let us know in writing if you change your mind.

Changes to This Notice

We can change the terms of this Notice, and the changes will apply to all information we have about you. The new Notice will be available upon request and on our website. However, any changes to the terms will not change our commitment to complying with applicable laws and ensuring the privacy of patient information.

Who Will Follow This Notice

This Notice will be followed by all locations that provide health related services to health participants.

Who To Contact For Information or With a Complaint

If you have any questions about this Notice, or any complaints, please contact Shumard Chiropractic Inc.

EFFECTIVE DATE OF THIS NOTICE

This Notice is effective as of February, 2021."""
    
    story.append(create_row('HIPAA Notice', hipaa_full_text))
    story.append(create_row('Print Name', form_data.get('hipaaPrintName', 'N/A')))
    story.append(create_row('Agreement', 'I have read, understand, and agree to the HIPAA Notice of Privacy Practices.'))
    
    # HIPAA Signature
    hipaa_sig = form_data.get('hipaaSignature')
    if hipaa_sig and hipaa_sig.startswith('data:image'):
        try:
            sig_data = hipaa_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=2*inch, height=0.6*inch)
            sig_table = Table([
                [Paragraph("<b>Signature</b>", label_style), sig_image]
            ], colWidths=[LABEL_WIDTH, VALUE_WIDTH])
            sig_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), LABEL_BG),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(sig_table)
        except Exception:
            story.append(create_row('Signature', '[On file]'))
    else:
        story.append(create_row('Signature', '[On file]'))
    
    story.append(create_row('Date Signed', form_data.get('hipaaSignedAt', '')[:10] if form_data.get('hipaaSignedAt') else datetime.now().strftime('%Y-%m-%d')))
    
    story.append(PageBreak())
    
    # ===== TELEHEALTH CONSENT =====
    story.append(create_section_header("TELEHEALTH CONSENT"))
    
    story.append(create_two_column_row('Provider', 'Dr. Shumard, DC', 'Phone', '858-564-7081'))
    story.append(create_row('Address', '740 Nordahl Rd, Suite 294, San Marcos CA 92069'))
    
    telehealth_full_text = """I understand that my health and wellness provider wishes me to have a tele-health consultation through an interactive video connection.

Potential Risks: Video connection may not work or stop during consultation. Video quality may not be sufficient.

Benefits: No travel required. Access to specialist consultation.

Cancellation Policy: Cancellations must be received 24 hours prior to appointment. Consultation fee of $97.00 will be forfeited if not cancelled in time. One reschedule allowed without charge.

I have read this document and understand the risks and benefits of tele-health consultation."""
    
    story.append(create_row('Telehealth Consent', telehealth_full_text))
    story.append(create_row('Print Name', form_data.get('telehealthPrintName', 'N/A')))
    story.append(create_row('Agreement', 'I have read, understand, and accept the telehealth consent terms.'))
    
    # Telehealth Signature
    telehealth_sig = form_data.get('telehealthSignature')
    if telehealth_sig and telehealth_sig.startswith('data:image'):
        try:
            sig_data = telehealth_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=2*inch, height=0.6*inch)
            sig_table = Table([
                [Paragraph("<b>Signature</b>", label_style), sig_image]
            ], colWidths=[LABEL_WIDTH, VALUE_WIDTH])
            sig_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), LABEL_BG),
                ('BACKGROUND', (1, 0), (1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(sig_table)
        except Exception:
            story.append(create_row('Signature', '[On file]'))
    else:
        story.append(create_row('Signature', '[On file]'))
    
    story.append(create_row('Date Signed', form_data.get('telehealthSignedAt', '')[:10] if form_data.get('telehealthSignedAt') else datetime.now().strftime('%Y-%m-%d')))
    
    # Build PDF
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
