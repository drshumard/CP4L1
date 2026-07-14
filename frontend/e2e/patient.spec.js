const { test } = require('@playwright/test');
const path = require('path');
const { audit } = require('./helpers');

const A = (role) => path.join(__dirname, '.auth', `${role}.json`);

// Each patient page tested as the right journey-step user so it renders (not redirected).
const PAGES = [
  { path: '/dashboard', role: 'patient-complete' },
  { path: '/book', role: 'patient-step1' },
  { path: '/forms', role: 'patient-step2' },
  { path: '/ready', role: 'patient-step3' },
  { path: '/outcome', role: 'patient-complete' },
];

for (const { path: p, role } of PAGES) {
  test.describe(`patient ${p}`, () => {
    test.use({ storageState: A(role) });
    test(`audit ${p}`, async ({ page }) => { await audit(page, p); });
  });
}
