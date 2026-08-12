"""
MongoDB data models for the Supplement Protocol App.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId


# ─── Helpers ────────────────────────────────────────────────────────────

def serialize_doc(doc):
    """Convert MongoDB document to JSON-safe dict."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    result = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, list):
            result[k] = [serialize_doc(i) if isinstance(i, dict) else (str(i) if isinstance(i, ObjectId) else i) for i in v]
        elif isinstance(v, dict):
            result[k] = serialize_doc(v)
        else:
            result[k] = v
    return result


# ─── Supplement Models ──────────────────────────────────────────────────

class SupplementCreate(BaseModel):
    supplement_name: str
    company: str = ""
    manufacturer: str = ""
    supplier: str = ""
    units_per_bottle: Optional[int] = None
    unit_type: str = "caps"  # caps, ml, scoops, etc.
    default_quantity_per_dose: Optional[int] = None
    default_frequency_per_day: Optional[int] = None
    default_dosage_display: str = ""
    cost_per_bottle: float = 0.0
    default_instructions: str = ""
    refrigerate: bool = False
    notes: str = ""
    bottles_per_month: Optional[float] = None  # manual override
    active: bool = True


class SupplementUpdate(BaseModel):
    supplement_name: Optional[str] = None
    company: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier: Optional[str] = None
    units_per_bottle: Optional[int] = None
    unit_type: Optional[str] = None
    default_quantity_per_dose: Optional[int] = None
    default_frequency_per_day: Optional[int] = None
    default_dosage_display: Optional[str] = None
    cost_per_bottle: Optional[float] = None
    default_instructions: Optional[str] = None
    refrigerate: Optional[bool] = None
    notes: Optional[str] = None
    bottles_per_month: Optional[float] = None
    active: Optional[bool] = None


# ─── Template Models ────────────────────────────────────────────────────

class TemplateSupplementEntry(BaseModel):
    supplement_id: str
    supplement_name: str
    company: str = ""
    quantity_per_dose: Optional[int] = None
    frequency_per_day: Optional[int] = None
    dosage_display: str = ""
    instructions: str = ""
    units_per_bottle: Optional[int] = None
    cost_per_bottle: float = 0.0
    refrigerate: bool = False


class TemplateCreate(BaseModel):
    program_name: str
    step_number: int
    default_months: float = 1
    supplements: list[TemplateSupplementEntry] = []


class TemplateUpdate(BaseModel):
    program_name: Optional[str] = None
    step_number: Optional[int] = None
    default_months: Optional[float] = None
    supplements: Optional[list[TemplateSupplementEntry]] = None


# ─── Plan Models ────────────────────────────────────────────────────────

class PlanSupplementEntry(BaseModel):
    supplement_id: str = ""
    supplement_name: str
    company: str = ""
    manufacturer: str = ""
    supplier: str = ""
    quantity_per_dose: Optional[int] = None
    frequency_per_day: Optional[int] = None
    dosage_display: str = ""
    instructions: str = ""
    with_food: bool = True
    time_of_day: str = "AM"  # Legacy single field
    times: list = ["AM"]  # Active time slots: AM, Afternoon, PM
    hc_notes: str = ""
    units_per_bottle: Optional[int] = None
    cost_per_bottle: float = 0.0
    refrigerate: bool = False
    bottles_needed: Optional[float] = None
    calculated_cost: Optional[float] = None
    bottles_per_month_override: Optional[float] = None


class PlanMonth(BaseModel):
    month_number: float
    supplements: list[PlanSupplementEntry] = []
    monthly_total_cost: float = 0.0
    supplement_cost: float = 0.0
    freight_total: float = 0.0


class PlanCreate(BaseModel):
    patient_name: str
    patient_id: Optional[str] = None
    date: str = ""
    program_name: str
    step_label: str = ""
    step_number: int = 1
    months: list[PlanMonth] = []
    template_id: Optional[str] = None


class PlanUpdate(BaseModel):
    patient_name: Optional[str] = None
    date: Optional[str] = None
    program_name: Optional[str] = None
    step_label: Optional[str] = None
    step_number: Optional[int] = None
    months: Optional[list[PlanMonth]] = None
    status: Optional[str] = None


# ─── Auth Models ────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "hc"  # "hc" or "admin"


class UserLogin(BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


# ─── Patient Models ─────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    date_of_birth: str = ""
    notes: str = ""


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    notes: Optional[str] = None



# ─── Supplier Models ──────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    freight_charge: float = 0.0
    notes: str = ""


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    freight_charge: Optional[float] = None
    notes: Optional[str] = None
