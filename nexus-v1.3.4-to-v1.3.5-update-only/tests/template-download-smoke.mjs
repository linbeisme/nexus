#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const app = fs.readFileSync(path.join(ROOT, 'assets', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const staticXlsx = fs.readFileSync(path.join(ROOT, 'templates', 'Nexus_Transaction_Threshold_Monitor_Simplified.xlsx'));
const staticCsv = fs.readFileSync(path.join(ROOT, 'templates', 'Nexus_Transaction_Threshold_Monitor_Simplified.csv'), 'utf8');

const b64 = app.match(/const TRANSACTION_TEMPLATE_XLSX_BASE64='([^']+)'/);
if (!b64) throw new Error('Embedded Section 3 XLSX template not found in app.js');
const embeddedXlsx = Buffer.from(b64[1], 'base64');
if (!embeddedXlsx.equals(staticXlsx)) throw new Error('Embedded XLSX differs from packaged templates/XLSX file');
if (embeddedXlsx.length < 1000 || embeddedXlsx[0] !== 0x50 || embeddedXlsx[1] !== 0x4b) throw new Error('Embedded XLSX is not a ZIP/XLSX package');

const csvMatch = app.match(/const TRANSACTION_TEMPLATE_CSV='([^']+)'/);
if (!csvMatch) throw new Error('Embedded Section 3 CSV template not found in app.js');
const embeddedCsv = csvMatch[1].replace(/\\n/g, '\n');
if (embeddedCsv !== staticCsv) throw new Error('Embedded CSV differs from packaged templates/CSV file');
if (!embeddedCsv.startsWith('Document Date,Document #,Customer,Ship-to State,Sales $ Before Taxes,Customer Type')) throw new Error('CSV header is incorrect');

if (!html.includes('id="downloadTransactionTemplateXlsx"') || !html.includes('id="downloadTransactionTemplateCsv"')) throw new Error('Template download buttons are missing');
if (html.includes('href="./templates/Nexus_Transaction_Threshold_Monitor_Simplified.xlsx"') || html.includes('href="./templates/Nexus_Transaction_Threshold_Monitor_Simplified.csv"')) throw new Error('Section 3 still depends on static template hrefs');
if (!app.includes("getElementById('downloadTransactionTemplateXlsx').addEventListener('click',downloadTransactionTemplateXlsx)")) throw new Error('XLSX template button is not wired');
if (!app.includes("getElementById('downloadTransactionTemplateCsv').addEventListener('click',downloadTransactionTemplateCsv)")) throw new Error('CSV template button is not wired');

// Execute the actual app functions in a browser-like VM so this test proves the
// controls create downloadable Blobs, not merely that matching source text exists.
let capturedBlob = null;
let capturedName = '';
const noopElement = () => ({
  addEventListener() {}, appendChild() {}, remove() {}, select() {},
  click() { capturedName = this.download || capturedName; },
  classList: { add() {}, remove() {}, toggle() {} },
  style: {}, dataset: {}, value: '', checked: false, textContent: '', innerHTML: '', download: '', href: '',
});
const context = vm.createContext({
  console, Blob, TextEncoder, Uint8Array,
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, Date, Math, JSON,
  encodeURIComponent, decodeURIComponent, confirm: () => true, alert() {},
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: {
    addEventListener() {}, getElementById() { return noopElement(); }, querySelectorAll() { return []; },
    createElement() { return noopElement(); }, body: { appendChild() {} }, execCommand() { return true; },
  },
  window: { open() {} },
  URL: { createObjectURL(blob) { capturedBlob = blob; return 'blob:template-smoke'; }, revokeObjectURL() {} },
  fetch: async () => { throw new Error('template download should not fetch a static asset'); },
});
vm.runInContext(app, context, { filename: 'assets/app.js' });

vm.runInContext('downloadTransactionTemplateXlsx()', context);
if (!capturedBlob || capturedName !== 'Nexus_Transaction_Threshold_Monitor_Simplified.xlsx') throw new Error('XLSX template download did not create the expected Blob/name');
const runtimeXlsx = Buffer.from(await capturedBlob.arrayBuffer());
if (!runtimeXlsx.equals(staticXlsx)) throw new Error('Runtime XLSX Blob differs from packaged template');

capturedBlob = null; capturedName = '';
vm.runInContext('downloadTransactionTemplateCsv()', context);
if (!capturedBlob || capturedName !== 'Nexus_Transaction_Threshold_Monitor_Simplified.csv') throw new Error('CSV template download did not create the expected Blob/name');
const runtimeCsv = Buffer.from(await capturedBlob.arrayBuffer()).toString('utf8');
if (runtimeCsv !== staticCsv) throw new Error('Runtime CSV Blob differs from packaged template');

console.log(`Section 3 template download smoke OK: runtime XLSX ${runtimeXlsx.length} bytes; runtime CSV ${Buffer.byteLength(runtimeCsv)} bytes; no static fetch dependency`);
