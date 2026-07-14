const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Console noise that isn't an app bug (network status surfaced as console.error, dev tooling, etc.)
const NOISE = [
  /ResizeObserver loop/i,
  /Failed to load resource/i, // 4xx/5xx network responses surface here; not a render bug
  /\[intlGuard\]/i,
  /Download the React DevTools/i,
  /rrweb/i,
  /favicon/i,
];

// Audit one route: capture uncaught errors + filtered console errors, measure horizontal
// overflow, run axe (serious/critical), screenshot. Hard-fails on uncaught JS exceptions and
// real horizontal overflow; annotates console errors + a11y for review.
async function audit(page, pathname, { expectPath } = {}) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.some((r) => r.test(m.text()))) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

  await page.goto(pathname, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000); // let async data + animations settle

  // The journey guard redirects users who aren't on a page's step. Every audit is set up
  // with a fixture user at the RIGHT step, so ending anywhere else means we silently
  // audited the wrong page (or gating regressed) — fail loudly instead. Pages whose
  // DESIGNED behavior is a redirect declare it via expectPath.
  const want = expectPath || pathname;
  const landed = new URL(page.url()).pathname;
  expect(landed, `expected to land on ${want} but landed on ${landed}`).toBe(want);

  const overflow = await page.evaluate(
    () => Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  );

  let a11y = [];
  try {
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    a11y = res.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}(${v.impact}×${v.nodes.length})`);
  } catch { /* axe unavailable on this page */ }

  const proj = test.info().project.name;
  // eslint-disable-next-line no-console
  console.log(`[AUDIT] ${proj} ${pathname} | overflow=${overflow}px console=${consoleErrors.length} pageErr=${pageErrors.length} a11y=${a11y.length}`);
  await test.info().attach('audit', {
    contentType: 'application/json',
    body: JSON.stringify({ proj, pathname, overflow, consoleErrors, pageErrors, a11y }, null, 2),
  });
  if (consoleErrors.length) test.info().annotations.push({ type: 'console-error', description: `${pathname}: ${consoleErrors.join(' | ')}` });
  if (a11y.length) test.info().annotations.push({ type: 'a11y', description: `${pathname}: ${a11y.join(', ')}` });

  // Hard fails — clear bugs:
  expect(pageErrors, `Uncaught JS on ${pathname}: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(overflow, `Horizontal overflow on ${pathname} (${proj})`).toBeLessThanOrEqual(8);
}

module.exports = { audit };
