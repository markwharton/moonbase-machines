// Publishes every package of the release to npm, one at a time, in the order of the workspaces in package.json. A
// package that the registry already has at its version is skipped. The first package that fails to publish stops the
// rest. So a run can be repeated after a failure: it skips what is published and goes on from the one that failed. A
// release is never left with one package missing while the others need it.
// This replaces `npm publish --workspaces`, which goes on past a package that fails, and refuses the whole run when it
// is repeated, because one package is already published.
//
//   npm run publish-packages                      after pk ship, with npm signed in (npm login)
//   npm run publish-packages -- --otp=123456      with npm's one-time code, if the account asks for one
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const pass = process.argv.slice(2);
const npm = (args, opts = {}) => execFileSync('npm', args, { cwd: root, encoding: 'utf8', ...opts });

// Check who npm is signed in as first. A publish while signed out is refused with a 404, which does not say why.
try { console.log('npm: signed in as ' + npm(['whoami'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim()); }
catch { console.error('npm is not signed in, or the registry cannot be reached: npm login, then run this again'); process.exit(1); }

for (const folder of JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces) {
  const { name, version } = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'));
  // Ask the registry itself (--prefer-online). npm's cache can say a version is missing when it has been published.
  // Only "not found" (E404) means it is missing; any other failure stops the run, as the answer is not known.
  let there = false;
  try { there = npm(['view', `${name}@${version}`, 'version', '--prefer-online'], { stdio: ['ignore', 'pipe', 'pipe'] }).trim() === version; }
  catch (err) {
    if (!/E404/.test(String(err.stderr))) { console.error(`${name}@${version}: npm could not say whether it is published:\n${err.stderr}`); process.exit(1); }
  }
  if (there) { console.log(`${name}@${version}: on npm already, passed over`); continue; }
  console.log(`${name}@${version}: publishing`);
  try { npm(['publish', '-w', folder, ...pass], { stdio: 'inherit' }); }
  catch { console.error(`${name}@${version}: not published; the rest wait. Run this again once it is put right`); process.exit(1); }
}
console.log('every package is on npm at its version');
