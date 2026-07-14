const { test } = require('@playwright/test');
const path = require('path');
const { audit } = require('./helpers');

test.describe('admin', () => {
  test.use({ storageState: path.join(__dirname, '.auth', 'admin.json') });
  const PAGES = [
    '/admin',
    '/admin/analytics',
    '/admin/logs',
    '/admin/automations',
    '/admin/scheduling/bookings',
    '/admin/scheduling/directors',
    '/admin/scheduling/coordinators',
    '/admin/scheduling/events',
    '/admin/scheduling/settings',
  ];
  for (const p of PAGES) {
    test(`audit ${p}`, async ({ page }) => { await audit(page, p); });
  }
});
