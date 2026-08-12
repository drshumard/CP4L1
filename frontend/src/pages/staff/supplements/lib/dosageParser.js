/**
 * Parse free-text dosage into structured qty + frequency.
 * Handles patterns like:
 *   "2 caps 3x/day" → { qty: 2, freq: 3 }
 *   "1 cap per day"  → { qty: 1, freq: 1 }
 *   "2 pumps 2x/day" → { qty: 2, freq: 2 }
 *   "3 caps per day"  → { qty: 3, freq: 1 }
 *   "1 scoop"         → { qty: 1, freq: 1 }
 *   "2 caps"          → { qty: 2, freq: 1 }
 *   "2-2-2"           → { qty: 2, freq: 3 }
 *   "2 packets AM / 2 packets PM" → { qty: 2, freq: 2 }
 * Returns null if can't parse.
 */
export function parseDosage(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim().toLowerCase();

  // Pattern: "2-2-2" (qty taken N times per day)
  const dashMatch = s.match(/^(\d+)(?:-(\d+))+$/);
  if (dashMatch) {
    const parts = s.split('-').map(Number);
    return { qty: parts[0], freq: parts.length };
  }

  // Pattern: "N [unit] Nx/day" or "N [unit] N x/day" or "N [unit], Nx per day" or "N [unit]/ Nx per day"
  const fullMatch = s.match(/^(\d+)\s*\w+[\s,\/]+(\d+)\s*x\s*(?:\/|per\s*)?\s*day/);
  if (fullMatch) {
    return { qty: parseInt(fullMatch[1]), freq: parseInt(fullMatch[2]) };
  }

  // Pattern: "N [unit] per day" or "N per day" or "N pills per day"
  const perDayMatch = s.match(/^(\d+)\s*\w*\s*per\s*day/);
  if (perDayMatch) {
    return { qty: parseInt(perDayMatch[1]), freq: 1 };
  }

  // Pattern: "N [unit] AM / N [unit] PM" → qty=N, freq=2
  const amPmMatch = s.match(/^(\d+)\s*\w+\s*am\s*[\/&,]\s*(\d+)\s*\w+\s*pm/);
  if (amPmMatch) {
    return { qty: parseInt(amPmMatch[1]), freq: 2 };
  }

  // Pattern: "N before each meal" → qty=N, freq=3
  const mealMatch = s.match(/^(\d+)\s*(?:before|with|after)\s*each\s*meal/);
  if (mealMatch) {
    return { qty: parseInt(mealMatch[1]), freq: 3 };
  }

  // Pattern: just "N [unit]" with no frequency → assume 1x/day
  const simpleMatch = s.match(/^(\d+)\s*\w+$/);
  if (simpleMatch) {
    return { qty: parseInt(simpleMatch[1]), freq: 1 };
  }

  // Pattern: just a number
  const numMatch = s.match(/^(\d+)$/);
  if (numMatch) {
    return { qty: parseInt(numMatch[1]), freq: 1 };
  }

  return null;
}

/**
 * Build dosage display text from qty, freq, and unit type.
 */
export function buildDosageText(qty, freq, unitType) {
  if (!qty || qty <= 0) return '';
  const unit = unitType || 'caps';
  // Handle singular/plural
  let unitLabel = unit;
  if (qty === 1) {
    // Singularize: caps→cap, pumps→pump, scoops→scoop
    unitLabel = unit.replace(/s$/, '');
  } else {
    // Pluralize: cap→caps, pump→pumps (add s if not already there)
    if (!unit.endsWith('s') && !unit.endsWith('ml') && !unit.endsWith('g')) {
      unitLabel = unit + 's';
    }
  }
  if (!freq || freq <= 0 || freq === 1) {
    return `${qty} ${unitLabel} per day`;
  }
  return `${qty} ${unitLabel} ${freq}x/day`;
}
