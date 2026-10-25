import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked public files; stage the intended files before this check');
const failures = [];
const privatePath = /(?:[A-Za-z]:[\\/]Users[\\/]|\/(?:Users|home)\/[A-Za-z0-9_.-]+\/|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b198\.19\.247\.\d{1,3}\b)/;
const credential = /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/;

for (const name of files) {
  if (/^(?:dist|node_modules|\.artifacts|\.cache|Studio)\//i.test(name)
      || /\.(?:mmpkg|gmp|enc|zip)$/i.test(name)
      || /(?:^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example')
      || name === 'vendor/gm-plugin-web-sdk.esm.js') {
    failures.push(`${name}: excluded platform, installation or private file`);
  }
  const file = resolve(root, name);
  if (!existsSync(file)) {
    failures.push(`${name}: tracked file is missing`);
    continue;
  }
  // UTF-8 decoding also exposes printable diagnostic strings embedded in WASM.
  const text = readFileSync(file).toString('utf8');
  if (privatePath.test(text)) failures.push(`${name}: contains a local path or private installation address`);
  if (credential.test(text)) failures.push(`${name}: contains a credential-shaped value`);
  if (/^(?:src|tools|tests)\/.*\.(?:js|mjs)$/.test(name)) {
    try {
      execFileSync(process.execPath, ['--check', '--input-type=module'], { input: text, stdio: 'pipe' });
    } catch {
      failures.push(`${name}: JavaScript syntax check failed`);
    }
  }

  const projectMarkdown = name.endsWith('.md') && !name.startsWith('engine/vendor/');
  if (!projectMarkdown) continue;
  for (const [, raw] of text.matchAll(/\]\(([^)]+)\)/g)) {
    const link = raw.trim().replace(/^<|>$/g, '').split(/\s+"/)[0];
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
    const path = decodeURIComponent(link.split('#')[0]);
    const target = resolve(dirname(file), path);
    const inside = relative(root, target);
    if (isAbsolute(path) || inside === '..' || inside.startsWith(`..${sep}`)) {
      failures.push(`${name}: local link leaves the repository`);
    } else if (!existsSync(target)) {
      failures.push(`${name}: missing local link target ${link}`);
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public files, local-path patterns, JavaScript syntax and Markdown links checked: ${files.length} tracked files`);
}
