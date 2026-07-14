// One-off: dump the specific axe serious/critical nodes for representative pages so we know
// exactly what to fix. Run: node e2e/a11y-detail.js
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('path');

const TARGETS = [['/login', null],['/signup', null],['/admin','admin'],['/admin/automations','admin'],['/admin/scheduling/bookings','admin'],
  ['/admin/scheduling/events', 'admin'],
  ['/admin/logs', 'admin'],
  ['/admin', 'admin'],
  ['/forms', 'patient-step2'],
  ['/dashboard', 'patient-complete'],
  ['/book', 'patient-step1'],
  ['/login', null],
];

(async () => {
  const browser = await chromium.launch();
  for (const [url, role] of TARGETS) {
    const ctx = await browser.newContext({
      baseURL: 'http://localhost:3000',
      storageState: role ? path.join(__dirname, '.auth', `${role}.json`) : undefined,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const sc = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    console.log(`\n===== ${url} =====`);
    for (const v of sc) {
      console.log(`\n## ${v.id} (${v.impact}) — ${v.nodes.length} nodes`);
      for (const n of v.nodes.slice(0, 5)) {
        console.log(`  target: ${JSON.stringify(n.target)}`);
        console.log(`  why: ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
