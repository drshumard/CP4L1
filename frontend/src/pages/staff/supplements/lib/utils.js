import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function daysInPeriod(monthNumber) {
  if (monthNumber === 0.5 || (typeof monthNumber === 'number' && monthNumber % 1 === 0.5)) {
    return 14;
  }
  return 30;
}

function calculateDailyDosage(qty, freq) {
  return Math.max(0, (qty || 0) * (freq || 0));
}

/**
 * Recalculate costs for ALL months in a plan with rolling surplus tracking.
 * Processes months in order — surplus from earlier months reduces bottles needed in later months.
 * 
 * @param {Array} months - Array of month objects with supplements
 * @param {Object} supplierFreight - {supplier_name: freight_charge}
 * @returns {Object} {months, total_program_cost}
 */
export function recalculatePlanCosts(months, supplierFreight = {}) {
  if (!months || months.length === 0) return { months: [], total_program_cost: 0 };

  // Sort months by month_number
  const sorted = [...months].sort((a, b) => (a.month_number || 0) - (b.month_number || 0));

  // Track surplus units per supplement (by supplement_id or name)
  const surplus = {};
  let totalProgramCost = 0;

  for (const month of sorted) {
    const periodDays = daysInPeriod(month.month_number);
    let monthSuppCost = 0;
    const shippingSuppliers = new Set();

    for (const supp of (month.supplements || [])) {
      const key = supp.supplement_id || supp.supplement_name || '';
      if (!key) continue;

      const daily = calculateDailyDosage(supp.quantity_per_dose, supp.frequency_per_day);
      const unitsPerBottle = supp.units_per_bottle || 0;
      const override = null; // Override removed — pure math-driven calculation
      const costPerBottle = supp.cost_per_bottle || 0;

      if (override != null && override > 0) {
        // Manual override — no surplus tracking
        supp.bottles_needed = override;
        supp.calculated_cost = Math.round(override * costPerBottle * 100) / 100;
        monthSuppCost += supp.calculated_cost;
        if (override > 0) {
          const supplier = (supp.supplier || '').trim();
          if (supplier) shippingSuppliers.add(supplier);
        }
        continue;
      }

      if (daily <= 0 || unitsPerBottle <= 0) {
        supp.bottles_needed = 0;
        supp.calculated_cost = 0;
        continue;
      }

      const unitsNeeded = daily * periodDays;
      const currentSurplus = surplus[key] || 0;
      const unitsToBuy = Math.max(0, unitsNeeded - currentSurplus);
      const bottlesToShip = unitsToBuy > 0 ? Math.ceil(unitsToBuy / unitsPerBottle) : 0;

      // Update surplus
      const unitsPurchased = bottlesToShip * unitsPerBottle;
      surplus[key] = Math.max(0, currentSurplus + unitsPurchased - unitsNeeded);

      const cost = Math.round(bottlesToShip * costPerBottle * 100) / 100;
      supp.bottles_needed = bottlesToShip;
      supp.calculated_cost = cost;
      monthSuppCost += cost;

      if (bottlesToShip > 0) {
        const supplier = (supp.supplier || '').trim();
        if (supplier) shippingSuppliers.add(supplier);
      }
    }

    // Freight — one charge per supplier shipping this month
    let freightTotal = 0;
    for (const supplier of shippingSuppliers) {
      const freight = supplierFreight[supplier] || 0;
      if (freight > 0) freightTotal += freight;
    }

    month.supplement_cost = Math.round(monthSuppCost * 100) / 100;
    month.freight_total = Math.round(freightTotal * 100) / 100;
    month.monthly_total_cost = Math.round((monthSuppCost + freightTotal) * 100) / 100;
    totalProgramCost += monthSuppCost + freightTotal;
  }

  return {
    months: sorted,
    total_program_cost: Math.round(totalProgramCost * 100) / 100,
  };
}

// Legacy wrapper for single-month (still used in some places)
export function recalculateMonthCosts(month, supplierFreight = {}) {
  const result = recalculatePlanCosts([month], supplierFreight);
  return result.months[0] || month;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
