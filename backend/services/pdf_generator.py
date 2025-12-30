import io
import base64
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, ListFlowable, ListItem
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

def create_intake_form_pdf(form_data: dict, user_name: str, user_email: str) -> bytes:
    """
    Generate a professional PDF from intake form data.
    
    Args:
        form_data: The complete form data including all 3 parts
        user_name: User's name
        user_email: User's email
    
    Returns:
        PDF as bytes
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
    
    # Get styles
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#0D9488'),
        spaceAfter=20,
        alignment=TA_CENTER
    )
    
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#0D9488'),
        spaceBefore=15,
        spaceAfter=10,
        borderWidth=1,
        borderColor=colors.HexColor('#0D9488'),
        borderPadding=5
    )
    
    subsection_style = ParagraphStyle(
        'SubsectionHeader',
        parent=styles['Heading3'],
        fontSize=11,
        textColor=colors.HexColor('#155E75'),
        spaceBefore=10,
        spaceAfter=5
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=5
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
    story.append(Paragraph(f"Patient: {user_name} | Email: {user_email}", small_style))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}", small_style))
    story.append(Spacer(1, 20))
    
    # ===== GENERAL INFORMATION =====
    story.append(Paragraph("GENERAL INFORMATION", section_style))
    
    general_data = [
        ['Legal First Name:', profile.get('legalFirstName', 'N/A'), 'Legal Last Name:', profile.get('legalLastName', 'N/A')],
        ['Preferred First Name:', profile.get('preferredFirstName', 'N/A'), 'Email:', profile.get('email', user_email)],
        ['Phone:', profile.get('phone', 'N/A'), 'Date of Birth:', profile.get('dateOfBirth', 'N/A')[:10] if profile.get('dateOfBirth') else 'N/A'],
        ['Gender:', profile.get('gender', 'N/A'), 'Relationship Status:', profile.get('relationshipStatus', 'N/A')],
        ['Weight:', profile.get('weight', 'N/A'), 'Current Date:', profile.get('currentDate', 'N/A')[:10] if profile.get('currentDate') else 'N/A'],
    ]
    
    t = Table(general_data, colWidths=[1.3*inch, 2.2*inch, 1.3*inch, 2.2*inch])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#155E75')),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#155E75')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F9FAFB')),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))
    
    # Address
    story.append(Paragraph("Address", subsection_style))
    address_data = [
        ['Street:', profile.get('street', 'N/A'), 'Unit:', profile.get('unit', 'N/A')],
        ['Town:', profile.get('town', 'N/A'), 'Postal Code:', profile.get('postalCode', 'N/A')],
        ['Country:', profile.get('country', 'N/A'), '', ''],
    ]
    t = Table(address_data, colWidths=[1*inch, 2.5*inch, 1*inch, 2.5*inch])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#155E75')),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#155E75')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))
    
    # Contact Information
    story.append(Paragraph("Contact Information", subsection_style))
    contact_data = [
        ['Occupation:', profile.get('occupation', 'N/A')],
        ['Referred By:', profile.get('referredBy', 'N/A')],
    ]
    t = Table(contact_data, colWidths=[1.3*inch, 5.7*inch])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#155E75')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
    ]))
    story.append(t)
    story.append(Spacer(1, 15))
    
    # ===== GOALS AND CONCERNS =====
    story.append(Paragraph("GOALS AND CONCERNS", section_style))
    
    def add_field(label, value, story):
        story.append(Paragraph(f"<b>{label}:</b>", normal_style))
        story.append(Paragraph(str(value) if value else 'N/A', normal_style))
        story.append(Spacer(1, 5))
    
    add_field("Main Problems", profile.get('mainProblems'), story)
    add_field("What are you hoping happens today as a result of your consultation?", profile.get('hopedOutcome'), story)
    add_field("If you cannot find a solution to your problem what do you think will happen?", profile.get('noSolutionOutcome'), story)
    add_field("Previous interventions that have NOT succeeded", profile.get('previousInterventions'), story)
    add_field("Severity of Problem", profile.get('severityLevel'), story)
    add_field("Motivation Level", profile.get('motivationLevel'), story)
    story.append(Spacer(1, 10))
    
    # ===== PRIOR MEDICAL HISTORY =====
    story.append(Paragraph("PRIOR MEDICAL HISTORY", section_style))
    add_field("Previous Diagnosis and Dates", profile.get('priorMedicalHistory'), story)
    story.append(Spacer(1, 10))
    
    # ===== MEDICATIONS AND SUPPLEMENTS =====
    story.append(Paragraph("MEDICATIONS AND SUPPLEMENTS", section_style))
    medications = profile.get('medications', [])
    if medications and len(medications) > 0:
        med_data = [['Name', 'Dosage']]
        for med in medications:
            if med.get('name') or med.get('dosage'):
                med_data.append([med.get('name', 'N/A'), med.get('dosage', 'N/A')])
        
        if len(med_data) > 1:
            t = Table(med_data, colWidths=[3.5*inch, 3.5*inch])
            t.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0D9488')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ]))
            story.append(t)
        else:
            story.append(Paragraph("None listed", normal_style))
    else:
        story.append(Paragraph("None listed", normal_style))
    story.append(Spacer(1, 15))
    
    # ===== REVIEW OF SYMPTOMS =====
    story.append(Paragraph("REVIEW OF SYMPTOMS", section_style))
    symptoms = profile.get('symptoms', {})
    
    symptom_categories = [
        ('CONSTITUTIONAL', ['Fatigue', 'Recent weight change', 'Fever']),
        ('EYES', ['Blurred/Double vision', 'Glasses/contacts', 'Eye disease or injury']),
        ('EAR/NOSE/MOUTH/THROAT', ['Swollen glands in neck', 'Hearing loss or ringing', 'Earaches or drainage', 'Chronic sinus problems', 'Nose bleeds', 'Mouth sores/Bleeding gums', 'Bad breath/Bad taste', 'Sore throat or voice changes']),
        ('PSYCHIATRIC', ['Insomnia', 'Memory loss or confusion', 'Nervousness', 'Depression']),
        ('GENITOURINARY', ['Frequent urination', 'Burning or painful urination', 'Blood in urine', 'Change in force of urinating', 'Kidney stones', 'Sexual difficulty', 'Male: testicle pain', 'Female: pain/irregular periods', 'Bladder infections', 'Kidney disease', 'Hemorrhoids']),
        ('GASTROINTESTINAL', ['Abdominal pain', 'Nausea or vomiting', 'Rectal bleeding/Blood in stool', 'Painful burn/Constipation', 'Ulcer', 'Change in bowel movement', 'Frequent diarrhea', 'Loss of appetite']),
        ('ENDOCRINE', ['Glandular or hormone problem', 'Excessive thirst or urination', 'Heat or cold intolerance', 'Skin becoming dryer', 'Change in hat or glove size', 'Diabetes', 'Thyroid disease']),
        ('MUSCULOSKELETAL', ['Back Pain', 'Joint Pain', 'Joint stiffness and swelling', 'Muscle pain or cramps', 'Muscle or joint weakness', 'Difficulty walking', 'Cold extremities']),
        ('INTEGUMENTARY', ['Change in skin color', 'Change in hair or nails', 'Varicose veins', 'Breast pain/discharge', 'Breast lump', 'Hives or eczema', 'Rash or itching']),
        ('NEUROLOGICAL', ['Freq/Recurring headaches', 'Migraine headache', 'Convulsions or seizures', 'Numbness or tingling', 'Tremors', 'Paralysis', 'Head injury', 'Light headed or dizzy', 'Stroke']),
        ('HEMATOLOGIC/LYMPHATIC', ['Slow to heal after cuts', 'Easy bleeding or bruising', 'Anemia', 'Phlebitis', 'Enlarged glands', 'Blood or plasma transfusion', 'Hepatitis', 'Cancer']),
    ]
    
    for category, symptom_list in symptom_categories:
        category_symptoms = symptoms.get(category, [])
        if category_symptoms and len(category_symptoms) > 0:
            story.append(Paragraph(f"<b>{category}:</b> {', '.join(category_symptoms)}", normal_style))
    
    # Allergies
    allergies = profile.get('allergies', '')
    if allergies:
        story.append(Spacer(1, 5))
        story.append(Paragraph(f"<b>ALLERGIES/OTHER:</b> {allergies}", normal_style))
    
    # Recent Tests
    recent_tests = profile.get('recentTests', [])
    if recent_tests and len(recent_tests) > 0:
        story.append(Spacer(1, 5))
        story.append(Paragraph(f"<b>RECENT TESTS:</b> {', '.join(recent_tests)}", normal_style))
    
    # Other Providers
    other_providers = profile.get('otherProviders', '')
    if other_providers:
        story.append(Spacer(1, 5))
        story.append(Paragraph(f"<b>OTHER PROVIDERS:</b> {other_providers}", normal_style))
    
    story.append(PageBreak())
    
    # ===== HIPAA CONSENT =====
    story.append(Paragraph("HIPAA - NOTICE OF PRIVACY", title_style))
    story.append(Paragraph("Patient has read, understood, and agreed to the HIPAA Notice of Privacy Practices.", normal_style))
    story.append(Spacer(1, 10))
    
    # HIPAA Signature
    hipaa_sig = form_data.get('hipaaSignature')
    if hipaa_sig and hipaa_sig.startswith('data:image'):
        try:
            sig_data = hipaa_sig.split(',')[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_image = Image(io.BytesIO(sig_bytes), width=3*inch, height=1*inch)
            story.append(Paragraph("<b>HIPAA Consent Signature:</b>", normal_style))
            story.append(sig_image)
        except:
            story.append(Paragraph("[Signature on file]", normal_style))
    else:
        story.append(Paragraph("[Signature on file]", normal_style))
    
    hipaa_date = form_data.get('hipaaSignedAt', '')
    story.append(Paragraph(f"<b>Date Signed:</b> {hipaa_date[:10] if hipaa_date else 'N/A'}", normal_style))
    story.append(Spacer(1, 30))
    
    # ===== TELEHEALTH CONSENT =====
    story.append(Paragraph("TELEHEALTH CONSENT", title_style))
    story.append(Spacer(1, 5))
    
    # Doctor info
    doctor_info = """
    <b>Dr. Shumard</b><br/>
    740 Nordahl Rd, Suite 294<br/>
    San Marcos CA 92069<br/>
    858-564-7081<br/>
    drjason@drshumard.com
    """
    story.append(Paragraph(doctor_info, normal_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("Patient has read, understood, and accepted the telehealth consultation terms and conditions, including the cancellation policy.", normal_style))
    story.append(Spacer(1, 10))
    
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
            story.append(Paragraph("<b>Telehealth Consent Signature:</b>", normal_style))
            story.append(sig_image)
        except:
            story.append(Paragraph("[Signature on file]", normal_style))
    else:
        story.append(Paragraph("[Signature on file]", normal_style))
    
    telehealth_date = form_data.get('telehealthSignedAt', '')
    story.append(Paragraph(f"<b>Date Signed:</b> {telehealth_date[:10] if telehealth_date else 'N/A'}", normal_style))
    
    # Build PDF
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes
