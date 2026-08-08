import fs from 'node:fs';
const doc=JSON.parse(fs.readFileSync('data/state-nexus.json','utf8'));
const byState=new Map(doc.states.map(r=>[r.state,r]));
const findings=[];
const expectedNoStateTax=new Set(['Delaware','Montana','New Hampshire','Oregon']);
const expectedTransactionProng=new Set(['Arkansas','Connecticut','District of Columbia','Georgia','Hawaii','Maryland','Michigan','Minnesota','Nebraska','Nevada','New Jersey','New York','Ohio','Rhode Island','Vermont','Virginia','West Virginia']);

const expectedDollarThreshold={};
for(const r of doc.states){
  if(!expectedNoStateTax.has(r.state)) expectedDollarThreshold[r.state]='$100,000';
}
Object.assign(expectedDollarThreshold,{
  'Alabama':'$250,000','California':'$500,000','Mississippi':'$250,000','New York':'$500,000','Texas':'$500,000'
});

const expectedScope={
  'Alabama':'Retail sales only (excludes resale)','Alaska':'All / gross sales','Arizona':'All / gross sales','Arkansas':'Taxable sales only','California':'All / gross sales of TPP','Colorado':'Retail sales only (excludes resale)','Connecticut':'Retail sales only (excludes resale)','Delaware':'No statewide sales tax','District of Columbia':'Retail sales only (excludes resale)','Florida':'Taxable sales only','Georgia':'Retail sales only (excludes resale)','Hawaii':'All / gross sales','Idaho':'All / gross sales','Illinois':'Retail sales only (excludes resale)','Indiana':'All / gross sales','Iowa':'All / gross sales','Kansas':'All / gross sales','Kentucky':'All / gross sales','Louisiana':'All / gross sales','Maine':'All / gross sales','Maryland':'All / gross sales','Massachusetts':'All / gross sales','Michigan':'All / gross sales','Minnesota':'Retail sales only (excludes resale)','Mississippi':'All / gross sales','Missouri':'Taxable sales only','Montana':'No statewide sales tax','Nebraska':'Retail sales only (excludes resale)','Nevada':'Retail sales only (excludes resale)','New Hampshire':'No statewide sales tax','New Jersey':'All / gross sales','New Mexico':'Taxable sales only','New York':'All / gross sales of TPP','North Carolina':'All / gross sales','North Dakota':'Taxable sales only','Ohio':'Retail sales only (excludes resale)','Oklahoma':'Taxable sales only','Oregon':'No statewide sales tax','Pennsylvania':'All / gross sales','Rhode Island':'All / gross sales','South Carolina':'All / gross sales','South Dakota':'All / gross sales','Tennessee':'Retail sales only (excludes resale)','Texas':'All / gross sales','Utah':'All / gross sales','Vermont':'All / gross sales','Virginia':'Retail sales only (excludes resale)','Washington':'All / gross sales','West Virginia':'All / gross sales','Wisconsin':'All / gross sales','Wyoming':'All / gross sales'
};
for(const [state,scope] of Object.entries(expectedScope)){
  const r=byState.get(state); if(!r){findings.push(`Missing jurisdiction: ${state}`);continue;}
  if(r.nexus_sales_scope!==scope) findings.push(`${state}: sales-scope mismatch; expected ${scope}, got ${r.nexus_sales_scope}`);
}
for(const r of doc.states){
  const expectedAmount=expectedDollarThreshold[r.state];
  if(expectedAmount && !String(r.threshold).includes(expectedAmount)) findings.push(`${r.state}: dollar-threshold mismatch; expected ${expectedAmount}, got ${r.threshold}`);
  if(!expectedNoStateTax.has(r.state) && (!r.measurement_period || r.measurement_period==='N/A')) findings.push(`${r.state}: missing measurement period`);
  if(!expectedNoStateTax.has(r.state) && (!r.collection_timing || r.collection_timing==='N/A')) findings.push(`${r.state}: missing collection/registration timing`);
  if(!expectedNoStateTax.has(r.state) && (!r.sales_basis || r.sales_basis==='N/A')) findings.push(`${r.state}: missing sales-basis detail`);
  const hasTx=r.threshold!=='N/A' && !String(r.transaction_test).startsWith('None');
  if(expectedTransactionProng.has(r.state)!==hasTx && !expectedNoStateTax.has(r.state)) findings.push(`${r.state}: transaction-prong classification mismatch (${r.transaction_test})`);
  if(expectedNoStateTax.has(r.state) && r.status!=='No statewide sales tax') findings.push(`${r.state}: expected no statewide sales tax status`);
}
const recent={
  'Illinois':['2026-01-01','None (removed 2026-01-01)'],
  'Kentucky':['2026-08-01','None (removed 2026-08-01)'],
  'Utah':['2025-07-01','None (removed 2025-07-01)'],
  'Alaska':['2025-01-01','None (repealed 2025-01-01)'],
  'North Carolina':['2024-07-01','None (removed 2024-07-01)'],
  'Wyoming':['2024-07-01','None (removed 2024-07-01)'],
  'Indiana':['2024-01-01','None (removed 2024-01-01)'],
  'Louisiana':['2023-08-01','None (removed 2023-08-01)'],
  'South Dakota':['2023-07-01','None (removed 2023-07-01)'],
  'Maine':['2022-01-01','None (removed 2022-01-01)'],
  'Wisconsin':['2021-02-20','None (removed 2021-02-20)'],
  'North Dakota':['2019-07-01','None (removed 2019-07-01)']
};
for(const [state,[date,tx]] of Object.entries(recent)){
  const r=byState.get(state); if(!r) continue;
  if(r.latest_change_date!==date) findings.push(`${state}: expected latest material change ${date}, got ${r.latest_change_date}`);
  if(r.transaction_test!==tx) findings.push(`${state}: expected transaction test '${tx}', got '${r.transaction_test}'`);
}
if(findings.length){console.error('Independent reconciliation findings:\n- '+findings.join('\n- '));process.exit(1);}
const dollarOnly=doc.states.filter(r=>r.threshold!=='N/A' && String(r.transaction_test).startsWith('None')).map(r=>r.state);
console.log(`Independent reconciliation OK as of benchmark 2026-08-01: ${doc.states.length} jurisdictions; ${expectedTransactionProng.size} transaction-prong jurisdictions; ${dollarOnly.length} dollar-threshold-only jurisdictions; scope categories match benchmark.`);
