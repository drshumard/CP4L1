import { humanizeEvent, eventFamily } from './events';

describe('humanizeEvent', () => {
  test('hand-tuned overrides', () => {
    expect(humanizeEvent('SMS_OTP_LOGIN_SUCCESS')).toBe('SMS login');
    expect(humanizeEvent('SMS_OTP_SENT')).toBe('SMS code sent');
    expect(humanizeEvent('WELCOME_EMAIL_RESENT')).toBe('Welcome email resent');
    expect(humanizeEvent('USER_STEP_CHANGED')).toBe('Step changed');
    expect(humanizeEvent('SETTINGS_UPDATED')).toBe('Settings updated');
  });

  test('fallback sentence-cases unknown events and keeps acronyms', () => {
    expect(humanizeEvent('FOO_BAR_BAZ')).toBe('Foo bar baz');
    expect(humanizeEvent('PB_SYNC_DONE')).toBe('PB sync done');
    expect(humanizeEvent('USER_IP_BLOCKED')).toBe('User IP blocked');
  });

  test('no underscores survive', () => {
    for (const t of ['SETTINGS_UPDATED', 'USER_STEP_CHANGED', 'SMS_OTP_LOGIN_SUCCESS', 'SMS_OTP_SENT', 'WELCOME_EMAIL_RESENT']) {
      expect(humanizeEvent(t)).not.toMatch(/_/);
    }
  });

  test('empty input', () => {
    expect(humanizeEvent(null)).toBe('—');
    expect(humanizeEvent('')).toBe('—');
  });
});

describe('eventFamily', () => {
  test('the listed events map to distinct families (distinct icons)', () => {
    expect(eventFamily('SETTINGS_UPDATED')).toBe('settings');
    expect(eventFamily('USER_STEP_CHANGED')).toBe('step');
    expect(eventFamily('SMS_OTP_LOGIN_SUCCESS')).toBe('sms');
    expect(eventFamily('SMS_OTP_SENT')).toBe('sms');
    expect(eventFamily('WELCOME_EMAIL_RESENT')).toBe('email');
    // the 5 the user flagged now span 4 families -> no longer all the same glyph
    const fams = new Set(['SETTINGS_UPDATED', 'USER_STEP_CHANGED', 'SMS_OTP_LOGIN_SUCCESS', 'SMS_OTP_SENT', 'WELCOME_EMAIL_RESENT'].map(eventFamily));
    expect(fams.size).toBe(4);
  });
});
