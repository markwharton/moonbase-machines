// Every package of the release published to npm, one at a time in the workspaces' order (package.json), each that the
// registry does not yet have at its version, and the first that fails stops the rest. So a run can be repeated: what
// is published is passed over, and a release is never left with one package missing and the others needing it.
// (npm publish --workspaces goes on past a package that fails, and refuses the whole run again once one is published.)
//
//   npm run publish-packages                      after pk ship: npm signed in (npm login)
//   npm run publish-packages -- --otp=123456      with npm's one-time code, where the account asks for one
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const pass = process.argv.slice(2);
const npm = (args, opts = {}) => execFileSync('npm', args, { cwd: root, encoding: 'utf8', ...opts });

// (who npm is signed in as: a publish signed out is refused as a 404, which says nothing of why)
try { console.log('npm: signed in as ' + npm(['whoami'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim()); }
catch { console.error('npm is not signed in: npm login, then run this again'); process.exit(1); }

for (const folder of JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces) {
  const { name, version } = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'));
  // (the registry asked afresh, never npm's cache, which can say a version is not there that is)
  let there = false;
  try { there = npm(['view', `${name}@${version}`, 'version', '--prefer-online'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version; } catch {}
  if (there) { console.log(`${name}@${version}: on npm already, passed over`); continue; }
  console.log(`${name}@${version}: publishing`);
  try { npm(['publish', '-w', folder, ...pass], { stdio: 'inherit' }); }
  catch { console.error(`${name}@${version}: not published; the rest wait. Run this again once it is put right`); process.exit(1); }
}
console.log('every package is on npm at its version');
