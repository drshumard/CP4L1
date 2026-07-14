const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Mints a real JWT per role (via the backend mint script, which reads JWT_SECRET_KEY from
// its own env) and writes a Playwright storageState with the access_token in localStorage.
// These are local test sessions only; the .auth dir is gitignored.
const USERS = {
  admin: 'raymond@fireside360.co.uk',
  'patient-step1': 'james.carter@example.com',
  'patient-step2': 'raymond+web@controlswitch.io',
  'patient-step3': 'aisha.khan@example.com',
  'patient-complete': 'robert.nguyen@example.com',
};

module.exports = async () => {
  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  const backend = path.join(__dirname, '..', '..', 'backend');

  for (const [role, email] of Object.entries(USERS)) {
    let token;
    try {
      token = execSync(`venv/bin/python scripts/mint_test_token.py ${email}`, { cwd: backend }).toString().trim();
    } catch (e) {
      throw new Error(`Failed to mint token for ${role} (${email}): ${e.stderr?.toString() || e.message}`);
    }
    if (!token || token.startsWith('ERROR')) throw new Error(`Bad token for ${role}: ${token}`);
    const state = {
      cookies: [],
      origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'access_token', value: token }] }],
    };
    fs.writeFileSync(path.join(authDir, `${role}.json`), JSON.stringify(state, null, 2));
  }
  console.log(`[global-setup] minted ${Object.keys(USERS).length} role tokens`);
};
