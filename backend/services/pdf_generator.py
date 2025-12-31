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

Dr. Shumard Chiropractic Inc. is committed to providing you with the highest quality of care in an environment that protects a health participant's privacy and the confidentiality of your health information.

Terms of Use: 1) Health information transmitted electronically via secure connection. 2) Written consent obtained one time for all subsequent coaching. 3) Records secured with appropriate precautions. 4) Refusal to sign may result in refusal of services. 5) Cyber-security measures in place including password protection. 6) Consultations via phone or video conferencing.

Your Rights: Get copies of medical records, request corrections, request confidential communications, get privacy notice copies, choose representatives, file complaints.

How We Use Information: Treatment, Payment, Healthcare operations.

EFFECTIVE DATE: February 2021"""
    
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
    story.append(Spacer(1, 6))
    
    story.append(create_two_column_row('Provider', 'Dr. Shumard, DC', 'Phone', '858-564-7081'))
    story.append(create_row('Address', '740 Nordahl Rd, Suite 294, San Marcos CA 92069'))
    story.append(Spacer(1, 6))
    
    telehealth_text = """I understand that my health and wellness provider wishes me to have a tele-health consultation through an interactive video connection.<br/><br/>
<b>Potential Risks:</b> Video connection may not work or stop during consultation. Video quality may not be sufficient.<br/><br/>
<b>Benefits:</b> No travel required. Access to specialist consultation.<br/><br/>
<b>Cancellation Policy:</b> Cancellations must be received 24 hours prior to appointment. Consultation fee of $97.00 will be forfeited if not cancelled in time. One reschedule allowed without charge.<br/><br/>
I have read this document and understand the risks and benefits of tele-health consultation."""
    
    story.append(Paragraph(telehealth_text, small_style))
    story.append(Spacer(1, 10))
    
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
