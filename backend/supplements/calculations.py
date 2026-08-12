"""
Cost calculation engine for supplement protocol plans.
Handles rolling surplus tracking across months — bottles purchased in earlier
months carry forward, reducing what needs to be shipped in later months.
"""
import math
from typing import Optional


def days_in_period(month_number: float) -> int:
    """Return the number of days for a given month period.
    0.5 = 2 weeks (14 days), 1+ = 30 days per month."""
    if month_number == 0.5 or (isinstance(month_number, float) and month_number % 1 == 0.5):
        return 14
    return 30


def calculate_daily_dosage(quantity_per_dose: int, frequency_per_day: int) -> int:
    """Calculate total units consumed per day."""
    return max(0, (quantity_per_dose or 0) * (frequency_per_day or 0))


def calculate_bottles_needed_simple(daily_dosage: int, units_per_bottle: int,
                                     days: int = 30,
                                     override: Optional[float] = None) -> float:
    """Calculate bottles needed for a period WITHOUT surplus tracking.
    Used as fallback when override is set."""
    if override is not None and override > 0:
        return override
    if not units_per_bottle or units_per_bottle <= 0:
        return 0
    if daily_dosage <= 0:
        return 0
    total_units = daily_dosage * days
    return math.ceil(total_units / units_per_bottle)


def calculate_supplement_cost(bottles_needed: float, cost_per_bottle: float) -> float:
    """Calculate cost for a given number of bottles."""
    return round(max(0, bottles_needed) * max(0, cost_per_bottle), 2)


def recalculate_plan_costs(plan_data: dict, supplier_freight: dict = None) -> dict:
    """Recalculate all costs for a plan with rolling surplus tracking.
    
    Processes months in order. For each supplement, tracks how many units
    the patient already has from previous months' purchases. Only ships
    enough new bottles to cover the deficit.
    
    Args:
        plan_data: Plan dict with 'months' list
        supplier_freight: {supplier_name: freight_charge} for shipping costs
    
    Returns:
        Updated plan_data with calculated costs on each supplement and month.
    """
    supplier_freight = supplier_freight or {}
    months = plan_data.get("months", [])
    
    if not months:
        plan_data["total_program_cost"] = 0.0
        return plan_data
    
    # Sort months by month_number to ensure correct order
    months.sort(key=lambda m: m.get("month_number", 0))
    
    # Track surplus units per supplement across months
    # Key: supplement identifier (supplement_id or supplement_name)
    surplus = {}
    
    total_program_cost = 0.0
    
    for month in months:
        period_days = days_in_period(month.get("month_number", 1))
        month_supplement_cost = 0.0
        month_suppliers_shipping = set()  # Track which suppliers need to ship this month
        
        for supp in month.get("supplements", []):
            # Unique key for this supplement across months
            supp_key = supp.get("supplement_id") or supp.get("supplement_name", "")
            if not supp_key:
                continue
            
            daily = calculate_daily_dosage(
                supp.get("quantity_per_dose") or 0,
                supp.get("frequency_per_day") or 0
            )
            
            units_per_bottle = supp.get("units_per_bottle") or 0
            override = None  # Override removed — pure math-driven calculation
            cost_per_bottle = supp.get("cost_per_bottle", 0) or 0
            
            if override is not None and override > 0:
                # Manual override — use as-is, no surplus tracking
                bottles = override
                cost = calculate_supplement_cost(bottles, cost_per_bottle)
                supp["bottles_needed"] = bottles
                supp["calculated_cost"] = cost
                month_supplement_cost += cost
                if bottles > 0:
                    supplier = (supp.get("supplier") or "").strip()
                    if supplier:
                        month_suppliers_shipping.add(supplier)
                continue
            
            if daily <= 0 or units_per_bottle <= 0:
                supp["bottles_needed"] = 0
                supp["calculated_cost"] = 0.0
                continue
            
            # Units needed this period
            units_needed = daily * period_days
            
            # Get current surplus for this supplement
            current_surplus = surplus.get(supp_key, 0)
            
            # How many units we need to purchase (deficit after using surplus)
            units_to_buy = max(0, units_needed - current_surplus)
            
            # How many bottles to ship (round up)
            bottles_to_ship = math.ceil(units_to_buy / units_per_bottle) if units_to_buy > 0 else 0
            
            # Update surplus: what we had + what we bought - what we used
            units_purchased = bottles_to_ship * units_per_bottle
            new_surplus = current_surplus + units_purchased - units_needed
            surplus[supp_key] = max(0, new_surplus)  # Never go negative
            
            # Cost for this supplement this month
            cost = calculate_supplement_cost(bottles_to_ship, cost_per_bottle)
            
            supp["bottles_needed"] = bottles_to_ship
            supp["calculated_cost"] = cost
            month_supplement_cost += cost
            
            # Track supplier for freight
            if bottles_to_ship > 0:
                supplier = (supp.get("supplier") or "").strip()
                if supplier:
                    month_suppliers_shipping.add(supplier)
        
        # Calculate freight — one charge per supplier that ships this month
        freight_total = 0.0
        for supplier in month_suppliers_shipping:
            freight = supplier_freight.get(supplier, 0)
            if freight > 0:
                freight_total += freight
        
        month["supplement_cost"] = round(month_supplement_cost, 2)
        month["freight_total"] = round(freight_total, 2)
        month["monthly_total_cost"] = round(month_supplement_cost + freight_total, 2)
        total_program_cost += month_supplement_cost + freight_total
    
    plan_data["total_program_cost"] = round(total_program_cost, 2)
    return plan_data


def calculate_monthly_total(supplements: list) -> float:
    """Sum all supplement costs for a month."""
    return round(sum(s.get("calculated_cost", 0) or 0 for s in supplements), 2)
