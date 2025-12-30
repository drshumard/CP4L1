import io
import base64
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Brand colors matching the form
TEAL_PRIMARY = colors.HexColor('#0D9488')
TEAL_DARK = colors.HexColor('#155E75')
GRAY_BG = colors.HexColor('#F9FAFB')
GRAY_BORDER = colors.HexColor('#E5E7EB')

def create_intake_form_pdf(form_data: dict, user_name: str, user_email: str) -> bytes:
    """Generate a professionally styled PDF from intake form data with free text in table rows."""
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
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=TEAL_PRIMARY, spaceAfter=5, alignment=TA_CENTER, fontName='Helvetica-Bold')
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, textColor=colors.gray, alignment=TA_CENTER, spaceAfter=15)
    section_style = ParagraphStyle('SectionHeader', parent=styles['Heading2'], fontSize=12, textColor=TEAL_PRIMARY, spaceBefore=12, spaceAfter=6, fontName='Helvetica-Bold')
    subsection_style = ParagraphStyle('SubsectionHeader', parent=styles['Heading3'], fontSize=10, textColor=TEAL_DARK, spaceBefore=8, spaceAfter=4, fontName='Helvetica-Bold')
    label_style = ParagraphStyle('Label', parent=styles['Normal'], fontSize=9, textColor=TEAL_DARK, fontName='Helvetica-Bold')
    normal_style = ParagraphStyle('CustomNormal', parent=styles['Normal'], fontSize=9, spaceAfter=3)
    small_style = ParagraphStyle('SmallText', parent=styles['Normal'], fontSize=8, textColor=colors.gray, spaceAfter=2)
    table_text_style = ParagraphStyle('TableText', parent=styles['Normal'], fontSize=8, leading=10)
    
    story = []
    profile = form_data.get('profileData', {})
    
    # Helper function for field tables (2-column layout)
    def create_field_table(data, col_widths=None):
        if col_widths is None:
            col_widths = [1.4*inch, 2*inch, 1.4*inch, 2*inch]
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'), ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (0, -1), TEAL_DARK), ('TEXTCOLOR', (2, 0), (2, -1), TEAL_DARK),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER), ('BACKGROUND', (0, 0), (-1, -1), GRAY_BG),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        return t
    
    # Helper function for free text fields in table row format
    def create_text_field_table(label, value):
        """Create a table row for free text fields"""
        value_text = str(value) if value else 'N/A'
        # Wrap long text in Paragraph for proper formatting
        value_para = Paragraph(value_text, table_text_style)
        
        data = [[Paragraph(f"<b>{label}</b>", label_style), value_para]]
        t = Table(data, colWidths=[2.2*inch, 4.8*inch])
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('TEXTCOLOR', (0, 0), (0, -1), TEAL_DARK),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ('BACKGROUND', (0, 0), (0, -1), GRAY_BG),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        return t
    
    # ===== HEADER =====
    story.append(Paragraph("INTAKE FORMS: DIABETES", title_style))
    story.append(Paragraph(f"Patient: {user_name} | Email: {user_email}", subtitle_style))
    story.append(Paragraph(f"Submitted: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", small_style))
    story.append(Spacer(1, 10))
    
    # ===== GENERAL INFORMATION =====
    story.append(Paragraph("GENERAL INFORMATION", section_style))
    dob = profile.get('dateOfBirth', '')[:10] if profile.get('dateOfBirth') else 'N/A'
    current_date = profile.get('currentDate', '')[:10] if profile.get('currentDate') else 'N/A'
    
    general_data = [
        ['Legal First Name:', profile.get('legalFirstName', 'N/A'), 'Legal Last Name:', profile.get('legalLastName', 'N/A')],
        ['Preferred Name:', profile.get('preferredFirstName', 'N/A'), 'Email:', profile.get('email', user_email)],
        ['Phone:', profile.get('phone', 'N/A'), 'Date of Birth:', dob],
        ['Gender:', profile.get('gender', 'N/A'), 'Relationship:', profile.get('relationshipStatus', 'N/A')],
        ['Weight:', profile.get('weight', 'N/A'), 'Form Date:', current_date],
    ]
    story.append(create_field_table(general_data))
    
    # Address
    story.append(Paragraph("Address", subsection_style))
    address_parts = [profile.get('street', ''), profile.get('unit', ''), profile.get('town', ''), profile.get('postalCode', ''), profile.get('country', '')]
    story.append(Paragraph(', '.join([p for p in address_parts if p]) or 'N/A', normal_style))
    
    # Contact Information
    story.append(Paragraph("Contact Information", subsection_style))
    story.append(create_field_table([['Occupation:', profile.get('occupation', 'N/A'), 'Referred By:', profile.get('referredBy', 'N/A')]]))
    
    # ===== GOALS AND CONCERNS - Using Table Rows for Free Text =====
    story.append(Paragraph("GOALS AND CONCERNS", section_style))
    story.append(create_text_field_table("Main Problems", profile.get('mainProblems')))
    story.append(Spacer(1, 4))
    story.append(create_text_field_table("Hoped Outcome from Consultation", profile.get('hopedOutcome')))
    story.append(Spacer(1, 4))
    story.append(create_text_field_table("If No Solution Found", profile.get('noSolutionOutcome')))
    story.append(Spacer(1, 4))
    story.append(create_text_field_table("Previous Interventions (Not Worked)", profile.get('previousInterventions')))
    story.append(Spacer(1, 4))
    story.append(create_field_table([['Severity Level:', profile.get('severityLevel', 'N/A'), 'Motivation Level:', profile.get('motivationLevel', 'N/A')]]))
    
    # ===== PRIOR MEDICAL HISTORY - Using Table Row for Free Text =====
    story.append(Paragraph("PRIOR MEDICAL HISTORY", section_style))
    story.append(create_text_field_table("Previous Diagnosis and Dates", profile.get('priorMedicalHistory')))
    
    # ===== MEDICATIONS AND SUPPLEMENTS =====
    story.append(Paragraph("MEDICATIONS AND SUPPLEMENTS", section_style))
    medications = profile.get('medications', [])
    if medications and any(m.get('name') or m.get('dosage') for m in medications):
        med_data = [['Medication/Supplement', 'Dosage']]
        for med in medications:
            if med.get('name') or med.get('dosage'):
                med_data.append([med.get('name', ''), med.get('dosage', '')])
        if len(med_data) > 1:
            t = Table(med_data, colWidths=[3.5*inch, 3.5*inch])
            t.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BACKGROUND', (0, 0), (-1, 0), TEAL_PRIMARY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER), ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('BACKGROUND', (0, 1), (-1, -1), GRAY_BG),
            ]))
            story.append(t)
    else:
        story.append(Paragraph("None listed", normal_style))
    
    # ===== REVIEW OF SYMPTOMS =====
    story.append(Paragraph("REVIEW OF SYMPTOMS", section_style))
    symptoms = profile.get('symptoms', {})
    symptom_categories = ['CONSTITUTIONAL', 'EYES', 'EAR/NOSE/MOUTH/THROAT', 'PSYCHIATRIC', 'GENITOURINARY', 'GASTROINTESTINAL', 'ENDOCRINE', 'MUSCULOSKELETAL', 'INTEGUMENTARY', 'NEUROLOGICAL', 'HEMATOLOGIC/LYMPHATIC']
    has_symptoms = False
    for category in symptom_categories:
        category_symptoms = symptoms.get(category, [])
        if category_symptoms:
            has_symptoms = True
            story.append(Paragraph(f"<b>{category}:</b> {', '.join(category_symptoms)}", small_style))
    if not has_symptoms:
        story.append(Paragraph("No symptoms reported", normal_style))
    
    # Allergies - Using Table Row for Free Text
    story.append(Spacer(1, 6))
    if profile.get('allergies'):
        story.append(create_text_field_table("Allergies/Other", profile.get('allergies')))
    
    # Recent Tests
    if profile.get('recentTests'):
        story.append(Spacer(1, 4))
        story.append(create_text_field_table("Recent Tests", ', '.join(profile.get('recentTests', []))))
    
    # Other Providers - Using Table Row for Free Text
    if profile.get('otherProviders'):
        story.append(Spacer(1, 4))
        story.append(create_text_field_table("Other Providers", profile.get('otherProviders')))
    
    story.append(PageBreak())
    
    # ===== HIPAA NOTICE - FULL TEXT =====
    story.append(Paragraph("HIPAA - NOTICE OF PRIVACY", title_style))
    story.append(Spacer(1, 8))
    
    hipaa_text = """
    <b>Notice Of Privacy Practices</b><br/><br/>
    THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.<br/><br/>
    Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant's privacy and the confidentiality of your health information. This notice explains our privacy practices, as well as your rights, with regard to your health information.<br/><br/>
    We want you to know how your Protected Health Information (PHI) is going to be used in our coaching program and your rights concerning those records. Before we will begin any health coaching we require you to read and sign this consent form stating that you understand and agree with how your records will be used.<br/><br/>
    <b>Some of the terms of uses include:</b><br/>
    1. The health participant understands that Shumard Chiropractic Inc. and partnering laboratories transmit health information (such as lab results) electronically via a secure internet connection. Shumard Chiropractic Inc. has taken the necessary precautions to enhance all security; Shumard Chiropractic Inc. cannot be held liable if there is any security breach on the part of the laboratories.<br/>
    2. A health participant's written consent need only be obtained one time for all subsequent coaching given to the health participant.<br/>
    3. For your security and right to privacy, we have taken all precautions that we know of to assure that your records are not readily available to those who do not need access to them.<br/>
    4. If the health participant refuses to sign this consent for the purpose of health coaching operations, Shumard Chiropractic Inc. reserves the right to refuse acceptance of the health participant.<br/>
    5. Every effort is made to ensure cyber-security of your information, including password protection of computers, HIPAA-compliant email servers, and other means. No system is 100% secure and there are potential risks notwithstanding. The health participant agrees to hold Shumard Chiropractic Inc. harmless for information lost due to technical failures.<br/>
    6. Consultations can be conducted either by audio via phone, PracticeBetter Telehealth or similar, or through video conferencing via Skype, Zoom, G-Suite's 'Meet', PracticeBetter Telehealth or similar.<br/><br/>
    <b>Your Rights:</b><br/>
    1. Get an electronic or paper copy of your medical record<br/>
    2. Ask us to correct or amend your medical record<br/>
    3. Request confidential communications<br/>
    4. Get a copy of this privacy notice<br/>
    5. Choose someone to act for you<br/>
    6. File a complaint if you feel your rights are violated<br/><br/>
    <b>Your Choices:</b> We never share your information unless you give us written authorization for: Marketing purposes, Sale of your information, Most sharing of psychotherapy notes.<br/><br/>
    <b>How We May Use and Share Your Health Information:</b> Treatment, Payment, Healthcare operations.<br/><br/>
    <b>Our Responsibilities:</b> We are required by law to maintain the privacy and security of your protected health information. We will let you know promptly if a breach occurs.<br/><br/>
    <b>EFFECTIVE DATE OF THIS NOTICE: February, 2021</b>
    """
    story.append(Paragraph(hipaa_text, small_style))
    story.append(Spacer(1, 10))
    
    # HIPAA Signature
    story.append(Paragraph(f"<b>Printed Name:</b> {form_data.get('hipaaPrintName', 'N/A')}", normal_style))
    hipaa_sig = form_data.get('hipaaSignature')
    if hipaa_sig and hipaa_sig.startswith('data:image'):
        try:
            sig_data = hipaa_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=2.5*inch, height=0.8*inch)
            story.append(Paragraph("<b>Signature:</b>", label_style))
            story.append(sig_image)
        except Exception:
            story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    else:
        story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    story.append(Paragraph(f"<b>Date Signed:</b> {form_data.get('hipaaSignedAt', '')[:10] if form_data.get('hipaaSignedAt') else datetime.now().strftime('%Y-%m-%d')}", normal_style))
    
    story.append(PageBreak())
    
    # ===== TELEHEALTH CONSENT - FULL TEXT =====
    story.append(Paragraph("TELEHEALTH CONSENT", title_style))
    story.append(Spacer(1, 8))
    
    story.append(Paragraph("<b>Dr. Shumard</b>", normal_style))
    story.append(Paragraph("740 Nordahl Rd, Suite 294, San Marcos CA 92069", small_style))
    story.append(Paragraph("858-564-7081 | drjason@drshumard.com", small_style))
    story.append(Spacer(1, 8))
    
    telehealth_text = """
    I understand that my health and wellness provider Dr. Shumard, DC wishes me to have a tele-health consultation.<br/><br/>
    This means that through an interactive video connection, I will be able to consult with the above named provider about my health and wellness concerns.<br/><br/>
    <b>I understand there are potential risks with this technology:</b><br/>
    - The video connection may not work or it may stop working during the consultation.<br/>
    - The video picture or information transmitted may not be clear enough to be useful for the consultation.<br/><br/>
    <b>The benefits of a tele-health consultation are:</b><br/>
    - I do not need to travel to the consult location.<br/>
    - I have access to a specialist through this consultation.<br/><br/>
    I also understand other individuals may need to use Practice Better tele-health platform and that they will take reasonable steps to maintain confidentiality of the information obtained. I also understand that this may be recorded for training purposes.<br/><br/>
    I understand that I am paying for an initial consultation with Dr. Shumard or one of his director of admissions. I will be allowed to reschedule this appointment one time with no additional charge. If I reschedule this appointment I agree to put a credit card on file for my follow up visit. If I do not inform or cancel with Dr. Shumard at least 24 hrs prior to my rescheduled appointment I will then be charged an additional $97 that is non-refundable.<br/><br/>
    <b>I understand all cancellations must be received 24 hrs prior to my scheduled appointment, otherwise the paid consultation fee of $97.00 will be forfeited and nonrefundable.</b><br/><br/>
    I have read this document and understand the risk and benefits of the tele-health consultation and have had my questions regarding the procedure explained and I hereby consent to participate in tele-health sessions under the conditions described in this document.<br/><br/>
    <b>Client:</b> I have read, understand, and accept the information and conditions specified in this agreement.
    """
    story.append(Paragraph(telehealth_text, small_style))
    story.append(Spacer(1, 10))
    
    # Telehealth Signature
    story.append(Paragraph(f"<b>Printed Name:</b> {form_data.get('telehealthPrintName', 'N/A')}", normal_style))
    telehealth_sig = form_data.get('telehealthSignature')
    if telehealth_sig and telehealth_sig.startswith('data:image'):
        try:
            sig_data = telehealth_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=2.5*inch, height=0.8*inch)
            story.append(Paragraph("<b>Signature:</b>", label_style))
            story.append(sig_image)
        except Exception:
            story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    else:
        story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    story.append(Paragraph(f"<b>Date Signed:</b> {form_data.get('telehealthSignedAt', '')[:10] if form_data.get('telehealthSignedAt') else datetime.now().strftime('%Y-%m-%d')}", normal_style))
    
    # Build PDF
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
