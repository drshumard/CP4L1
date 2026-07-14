const { test } = require('@playwright/test');
const { audit } = require('./helpers');

// Unauthenticated pages. /signup without ?email= is an invalid GHL link BY DESIGN and
// bounces to /login — audit it as that flow rather than pretending it renders.
test.describe('public', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('audit /login', async ({ page }) => { await audit(page, '/login'); });
  test('audit /signup (invalid-link redirect)', async ({ page }) => {
    await audit(page, '/signup', { expectPath: '/login' });
  });
});
