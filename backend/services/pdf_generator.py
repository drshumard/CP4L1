import io
import base64
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# Brand colors matching the form
TEAL_PRIMARY = colors.HexColor('#0D9488')
TEAL_DARK = colors.HexColor('#155E75')
TEAL_LIGHT = colors.HexColor('#CCFBF1')
GRAY_BG = colors.HexColor('#F9FAFB')
GRAY_BORDER = colors.HexColor('#E5E7EB')

def create_intake_form_pdf(form_data: dict, user_name: str, user_email: str) -> bytes:
    """
    Generate a professionally styled PDF from intake form data.
    """
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
    
    # Custom styles matching the form design
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=TEAL_PRIMARY,
        spaceAfter=5,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.gray,
        alignment=TA_CENTER,
        spaceAfter=20
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=TEAL_PRIMARY,
        spaceBefore=15,
        spaceAfter=8,
        fontName='Helvetica-Bold',
        borderWidth=0,
        borderPadding=0,
        leftIndent=0
    )
    
    subsection_style = ParagraphStyle(
        'SubsectionHeader',
        parent=styles['Heading3'],
        fontSize=11,
        textColor=TEAL_DARK,
        spaceBefore=10,
        spaceAfter=5,
        fontName='Helvetica-Bold'
    )
    
    label_style = ParagraphStyle(
        'Label',
        parent=styles['Normal'],
        fontSize=9,
        textColor=TEAL_DARK,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=4
    )
    
    small_style = ParagraphStyle(
        'SmallText',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.gray
    )
    
    story = []
    profile = form_data.get('profileData', {})
    
    # ===== HEADER =====
    story.append(Paragraph("INTAKE FORMS: DIABETES", title_style))
    story.append(Paragraph(f"Patient: {user_name} | Email: {user_email}", subtitle_style))
    story.append(Paragraph(f"Submitted: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", small_style))
    story.append(Spacer(1, 15))
    
    # Helper function for creating styled field tables
    def create_field_table(data, col_widths=None):
        if col_widths is None:
            col_widths = [1.5*inch, 2*inch, 1.5*inch, 2*inch]
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (0, -1), TEAL_DARK),
            ('TEXTCOLOR', (2, 0), (2, -1), TEAL_DARK),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
            ('BACKGROUND', (0, 0), (-1, -1), GRAY_BG),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        return t
    
    # ===== GENERAL INFORMATION =====
    story.append(Paragraph("GENERAL INFORMATION", section_style))
    
    dob = profile.get('dateOfBirth', '')
    if dob:
        try:
            dob = dob[:10]
        except:
            pass
    
    current_date = profile.get('currentDate', '')
    if current_date:
        try:
            current_date = current_date[:10]
        except:
            pass
    
    general_data = [
        ['Legal First Name:', profile.get('legalFirstName', 'N/A'), 'Legal Last Name:', profile.get('legalLastName', 'N/A')],
        ['Preferred Name:', profile.get('preferredFirstName', 'N/A'), 'Email:', profile.get('email', user_email)],
        ['Phone:', profile.get('phone', 'N/A'), 'Date of Birth:', dob or 'N/A'],
        ['Gender:', profile.get('gender', 'N/A'), 'Relationship:', profile.get('relationshipStatus', 'N/A')],
        ['Weight:', profile.get('weight', 'N/A'), 'Form Date:', current_date or 'N/A'],
    ]
    story.append(create_field_table(general_data))
    story.append(Spacer(1, 10))
    
    # Address
    story.append(Paragraph("Address", subsection_style))
    address_parts = [
        profile.get('street', ''),
        profile.get('unit', ''),
        profile.get('town', ''),
        profile.get('postalCode', ''),
        profile.get('country', '')
    ]
    full_address = ', '.join([p for p in address_parts if p])
    story.append(Paragraph(full_address or 'N/A', normal_style))
    story.append(Spacer(1, 10))
    
    # Contact Information
    story.append(Paragraph("Contact Information", subsection_style))
    contact_data = [
        ['Occupation:', profile.get('occupation', 'N/A'), 'Referred By:', profile.get('referredBy', 'N/A')],
    ]
    story.append(create_field_table(contact_data))
    story.append(Spacer(1, 15))
    
    # ===== GOALS AND CONCERNS =====
    story.append(Paragraph("GOALS AND CONCERNS", section_style))
    
    def add_text_field(label, value):
        story.append(Paragraph(f"<b>{label}:</b>", label_style))
        story.append(Paragraph(str(value) if value else 'N/A', normal_style))
        story.append(Spacer(1, 8))
    
    add_text_field("Main Problems", profile.get('mainProblems'))
    add_text_field("Hoped Outcome from Consultation", profile.get('hopedOutcome'))
    add_text_field("If No Solution Found", profile.get('noSolutionOutcome'))
    add_text_field("Previous Interventions That Did NOT Work", profile.get('previousInterventions'))
    
    severity_motivation = [
        ['Severity Level:', profile.get('severityLevel', 'N/A'), 'Motivation Level:', profile.get('motivationLevel', 'N/A')],
    ]
    story.append(create_field_table(severity_motivation))
    story.append(Spacer(1, 15))
    
    # ===== PRIOR MEDICAL HISTORY =====
    story.append(Paragraph("PRIOR MEDICAL HISTORY", section_style))
    add_text_field("Previous Diagnosis and Dates", profile.get('priorMedicalHistory'))
    
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
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BACKGROUND', (0, 0), (-1, 0), TEAL_PRIMARY),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('BACKGROUND', (0, 1), (-1, -1), GRAY_BG),
            ]))
            story.append(t)
    else:
        story.append(Paragraph("None listed", normal_style))
    story.append(Spacer(1, 15))
    
    # ===== REVIEW OF SYMPTOMS =====
    story.append(Paragraph("REVIEW OF SYMPTOMS", section_style))
    symptoms = profile.get('symptoms', {})
    
    symptom_categories = [
        'CONSTITUTIONAL', 'EYES', 'EAR/NOSE/MOUTH/THROAT', 'PSYCHIATRIC',
        'GENITOURINARY', 'GASTROINTESTINAL', 'ENDOCRINE', 'MUSCULOSKELETAL',
        'INTEGUMENTARY', 'NEUROLOGICAL', 'HEMATOLOGIC/LYMPHATIC'
    ]
    
    has_symptoms = False
    for category in symptom_categories:
        category_symptoms = symptoms.get(category, [])
        if category_symptoms:
            has_symptoms = True
            story.append(Paragraph(f"<b>{category}:</b> {', '.join(category_symptoms)}", normal_style))
    
    if not has_symptoms:
        story.append(Paragraph("No symptoms reported", normal_style))
    
    # Allergies
    allergies = profile.get('allergies', '')
    if allergies:
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"<b>ALLERGIES/OTHER:</b> {allergies}", normal_style))
    
    # Recent Tests
    recent_tests = profile.get('recentTests', [])
    if recent_tests:
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"<b>RECENT TESTS:</b> {', '.join(recent_tests)}", normal_style))
    
    # Other Providers
    other_providers = profile.get('otherProviders', '')
    if other_providers:
        story.append(Spacer(1, 8))
        story.append(Paragraph(f"<b>OTHER PROVIDERS:</b> {other_providers}", normal_style))
    
    story.append(PageBreak())
    
    # ===== HIPAA CONSENT =====
    story.append(Paragraph("HIPAA - NOTICE OF PRIVACY", title_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("Patient has read, understood, and agreed to the HIPAA Notice of Privacy Practices.", normal_style))
    story.append(Spacer(1, 15))
    
    # Print Name for HIPAA
    hipaa_print_name = form_data.get('hipaaPrintName', '')
    story.append(Paragraph(f"<b>Printed Name:</b> {hipaa_print_name or 'N/A'}", normal_style))
    story.append(Spacer(1, 10))
    
    # HIPAA Signature
    hipaa_sig = form_data.get('hipaaSignature')
    if hipaa_sig and hipaa_sig.startswith('data:image'):
        try:
            sig_data = hipaa_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=3*inch, height=1*inch)
            story.append(Paragraph("<b>HIPAA Consent Signature:</b>", label_style))
            story.append(sig_image)
        except:
            story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    else:
        story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    
    hipaa_date = form_data.get('hipaaSignedAt', '')
    story.append(Paragraph(f"<b>Date Signed:</b> {hipaa_date[:10] if hipaa_date else datetime.now().strftime('%Y-%m-%d')}", normal_style))
    story.append(Spacer(1, 30))
    
    # ===== TELEHEALTH CONSENT =====
    story.append(Paragraph("TELEHEALTH CONSENT", title_style))
    story.append(Spacer(1, 10))
    
    # Doctor info - plain text
    story.append(Paragraph("Dr. Shumard", normal_style))
    story.append(Paragraph("740 Nordahl Rd, Suite 294", normal_style))
    story.append(Paragraph("San Marcos CA 92069", normal_style))
    story.append(Paragraph("858-564-7081", normal_style))
    story.append(Paragraph("drjason@drshumard.com", normal_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("Patient has read, understood, and accepted the telehealth consultation terms and conditions, including the cancellation policy.", normal_style))
    story.append(Spacer(1, 15))
    
    # Print Name
    print_name = form_data.get('telehealthPrintName', 'N/A')
    story.append(Paragraph(f"<b>Printed Name:</b> {print_name}", normal_style))
    story.append(Spacer(1, 10))
    
    # Telehealth Signature
    telehealth_sig = form_data.get('telehealthSignature')
    if telehealth_sig and telehealth_sig.startswith('data:image'):
        try:
            sig_data = telehealth_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=3*inch, height=1*inch)
            story.append(Paragraph("<b>Telehealth Consent Signature:</b>", label_style))
            story.append(sig_image)
        except:
            story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    else:
        story.append(Paragraph("<b>Signature:</b> [On file]", normal_style))
    
    telehealth_date = form_data.get('telehealthSignedAt', '')
    story.append(Paragraph(f"<b>Date Signed:</b> {telehealth_date[:10] if telehealth_date else datetime.now().strftime('%Y-%m-%d')}", normal_style))
    
    # Build PDF
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
