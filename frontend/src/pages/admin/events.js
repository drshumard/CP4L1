// Human-readable activity-log event names. Raw events are SCREAMING_SNAKE_CASE;
// admins shouldn't read machine constants. Acronyms stay uppercased; common events
// get hand-tuned phrasings, everything else falls back to sentence case.

const ACRONYMS = new Set(['SMS', 'OTP', 'IP', 'ID', 'PB', 'GHL', 'CSV', 'URL', 'API', 'UTC']);

const OVERRIDES = {
  SMS_OTP_SENT: 'SMS code sent',
  SMS_OTP_LOGIN_SUCCESS: 'SMS login',
  SMS_OTP_LOGIN_FAILED: 'SMS login failed',
  SMS_OTP_VERIFY_FAILED: 'SMS code rejected',
  WELCOME_EMAIL_RESENT: 'Welcome email resent',
  USER_STEP_CHANGED: 'Step changed',
  USER_STEP_CHANGED_BY_ADMIN: 'Step changed by admin',
  USER_PROGRESS_RESET: 'Progress reset',
  STEP_ADVANCED_VIA_WEBHOOK: 'Step advanced (webhook)',
  SETTINGS_UPDATED: 'Settings updated',
  ADMIN_BOOKING_UPDATE: 'Booking updated',
  ADMIN_BOOKING_DELETED: 'Booking removed',
  SECONDARY_EMAIL_ADDED: 'Secondary email added',
  USER_CREATED: 'User created',
  DIRECTOR_CREATED: 'Director created',
  DIRECTOR_UPDATED: 'Director updated',
  DIRECTOR_DEACTIVATED: 'Director deactivated',
  LOGIN_SUCCESS: 'Login',
  LOGIN_FAILED: 'Login failed',
  SIGNUP_SUCCESS: 'Signup',
  SIGNUP_FAILED: 'Signup failed',
  EMAIL_SENT: 'Email sent',
  EMAIL_FAILED: 'Email failed',
};

/** "SMS_OTP_LOGIN_SUCCESS" -> "SMS login"; "FOO_BAR" -> "Foo bar". */
export function humanizeEvent(type) {
  if (!type) return '—';
  if (OVERRIDES[type]) return OVERRIDES[type];
  const words = String(type).split('_').filter(Boolean);
  return words
    .map((w, i) => {
      if (ACRONYMS.has(w)) return w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/** Coarse event family for icon selection. */
export function eventFamily(type) {
  const t = String(type || '');
  if (t.startsWith('SMS')) return 'sms';
  if (t.includes('EMAIL') || t.includes('WELCOME')) return 'email';
  if (t.startsWith('SETTINGS')) return 'settings';
  if (t.includes('STEP') || t.includes('PROGRESS') || t.includes('ADVANCED')) return 'step';
  if (t.includes('BOOKING') || t.includes('DIRECTOR')) return 'schedule';
  if (t.includes('LOGIN')) return 'login';
  if (t.includes('SIGNUP') || t === 'USER_CREATED') return 'signup';
  return 'other';
}
