#!/usr/bin/env node
// Executes the app's actual dependency-free XLSX export function in a VM context
// and writes the resulting workbook for package-level inspection.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const appCode = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'state-nexus.json'), 'utf8'));
const outPath = process.argv[2] || '/tmp/state-sales-tax-nexus-export-smoke.xlsx';
let capturedBlob = null;

const noopElement = () => ({
  addEventListener() {}, appendChild() {}, remove() {}, click() {}, select() {},
  classList: { add() {}, remove() {}, toggle() {} },
  style: {}, dataset: {}, value: '', checked: false, textContent: '', innerHTML: '',
});

const context = vm.createContext({
  console,
  Blob,
  TextEncoder,
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout() {},
  Date,
  Math,
  JSON,
  encodeURIComponent,
  decodeURIComponent,
  confirm: () => true,
  alert() {},
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    addEventListener() {},
    getElementById() { return noopElement(); },
    querySelectorAll() { return []; },
    createElement() { return noopElement(); },
    body: { appendChild() {} },
    execCommand() { return true; },
  },
  window: { open() {} },
  URL: {
    createObjectURL(blob) { capturedBlob = blob; return 'blob:audit'; },
    revokeObjectURL() {},
  },
  fetch: async () => { throw new Error('fetch should not be called by export smoke test'); },
});

vm.runInContext(appCode, context, { filename: 'assets/app.js' });
context.__STATES__ = dataset.states;
context.__META__ = dataset;
vm.runInContext('data = __STATES__; meta = __META__; proposals = []; exportXlsx(data, "all_states_audit");', context);
if (!capturedBlob) throw new Error('XLSX export did not create a Blob');
const bytes = Buffer.from(await capturedBlob.arrayBuffer());
if (bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Generated file is not a valid ZIP/XLSX package');
fs.writeFileSync(outPath, bytes);
console.log(`XLSX export smoke OK: ${bytes.length} bytes -> ${outPath}`);
