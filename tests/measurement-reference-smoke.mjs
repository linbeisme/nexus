import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dataset=JSON.parse(fs.readFileSync(new URL('../data/state-nexus.json',import.meta.url),'utf8'));
const fields={analysisAsOf:{value:'2026-08-09'},measurementReferenceDate:{value:'2026-08-09'},coverageStart:{value:'2024-01-01'},coverageEnd:{value:'2026-08-09'},watchPercent:{value:'0.90'}};
const dummy={value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return null}};
const context=vm.createContext({console,window:{},document:{addEventListener(){},getElementById(id){return fields[id]||dummy;}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},Blob:class{},URL:{createObjectURL(){return ''},revokeObjectURL(){}},setTimeout,clearTimeout,requestAnimationFrame:(fn)=>fn(),confirm:()=>true,alert:()=>{}});
vm.runInContext(fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8'),context);
const run=(code)=>vm.runInContext(code,context);
const codes=new Set(['CY_OR_PRIOR_CY','PRIOR_CY','ROLLING_12_MONTHS','QUARTER_END_TRAILING_12','NY_FOUR_SALES_TAX_QUARTERS','CT_SEP30_YEAR','PRIOR_12_COMPLETE_CAL_MONTHS','NA']);
for(const row of dataset.states){
  assert.ok(codes.has(row.measurement_code),`${row.state}: recognized code`);
  const label=run(`measurementMethodLabel(${JSON.stringify(row)})`);assert.ok(label&&!/Unclassified/.test(label),`${row.state}: label`);
  const how=run(`measurementDeterminationText(${JSON.stringify(row)})`);assert.ok(how.length>45,`${row.state}: determination explanation`);
  const example=run(`measurementExampleText(${JSON.stringify(row)},'2026-08-09')`);assert.ok(example.length>12,`${row.state}: example`);
}
const byState=Object.fromEntries(dataset.states.map(r=>[r.state,r]));
assert.match(run(`measurementExampleText(${JSON.stringify(byState.Minnesota)},'2026-03-15')`),/2025-03-16 through 2026-03-15/);
assert.match(run(`measurementExampleText(${JSON.stringify(byState.Illinois)},'2026-03-15')`),/2025-01-01 through 2025-12-31/);
assert.match(run(`measurementExampleText(${JSON.stringify(byState['New York'])},'2026-03-15')`),/2025-03-01 through 2026-02-28/);
assert.match(run(`measurementExampleText(${JSON.stringify(byState.Connecticut)},'2026-03-15')`),/2024-10-01 through 2025-09-30/);
assert.match(run(`measurementExampleText(${JSON.stringify(byState.Texas)},'2026-03-15')`),/2025-03-01 through 2026-02-28/);
console.log(`Measurement reference smoke PASS - ${dataset.states.length} jurisdictions have mapped method labels, determination text, and modeled examples.`);
