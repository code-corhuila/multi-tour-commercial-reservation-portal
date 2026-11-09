import { readFileSync, statSync } from 'node:fs';

// Pillar 13: the files the container mounts must stay inside scripts/bundle-budget.json.
// Measured 2026-10-15: portal.js 573,725 B (module) / 629,698 B (demo), portal.css 97,754 B; limits leave about 11% to 12% of room.
// Raise a limit only in a PR that says why the module grew.
let limits;
try {
  limits = JSON.parse(readFileSync('scripts/bundle-budget.json', 'utf8'));
} catch (error) {
  console.error(`Size budget unreadable: ${error.message}`);
  process.exit(1);
}
const files = Object.entries(limits);
if (files.length === 0) {
  console.error('Size budget is empty: there is no limit to check.');
  process.exit(1);
}
let failed = false;
for (const [file, { maxBytes }] of files) {
  let size;
  try {
    size = statSync(file).size;
  } catch {
    console.error(`${file}: not built.`);
    failed = true;
    continue;
  }
  const over = size > maxBytes;
  console.log(`${over ? 'FAIL' : 'ok  '} ${file}: ${size} of ${maxBytes} bytes`);
  failed ||= over;
}
process.exit(failed ? 1 : 0);
