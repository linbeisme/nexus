import fs from 'node:fs';
const doc=JSON.parse(fs.readFileSync('data/state-nexus.json','utf8'));
const byState=new Map(doc.states.map(r=>[r.state,r]));
const findings=[];
const expectedNoStateTax=new Set(['Delaware','Montana','New Hampshire','Oregon']);
const expectedTransactionProng=new Set(['Arkansas','Connecticut','District of Columbia','Georgia','Hawaii','Maryland','Michigan','Minnesota','Nebraska','Nevada','New Jersey','New York','Ohio','Rhode Island','Vermont','Virginia','West Virginia']);

const expectedAmount={};
for(const r of doc.states){ if(!expectedNoStateTax.has(r.state)) expectedAmount[r.state]=100000; }
Object.assign(expectedAmount,{Alabama:250000,California:500000,Mississippi:250000,'New York':500000,Texas:500000});

// Measurement-period regression map. Primary/current state guidance overrides the independent secondary chart where noted.
const expectedMeasurement={};
for(const r of doc.states){ if(!expectedNoStateTax.has(r.state)) expectedMeasurement[r.state]='CY_OR_PRIOR_CY'; }
for(const s of ['Alabama','Florida','Michigan','New Mexico','Pennsylvania','Rhode Island']) expectedMeasurement[s]='PRIOR_CY';
for(const s of ['Minnesota','Mississippi','Tennessee','Vermont']) expectedMeasurement[s]='ROLLING_12_MONTHS';
for(const s of ['Illinois','Missouri']) expectedMeasurement[s]='QUARTER_END_TRAILING_12';
expectedMeasurement['New York']='NY_FOUR_SALES_TAX_QUARTERS';
expectedMeasurement['Connecticut']='CT_SEP30_YEAR';
expectedMeasurement['Texas']='PRIOR_12_COMPLETE_CAL_MONTHS';
for(const s of expectedNoStateTax) expectedMeasurement[s]='NA';

const expectedScope={
  'Alabama':'Retail sales only (excludes resale)','Alaska':'All / gross sales','Arizona':'All / gross sales','Arkansas':'Taxable sales only','California':'All / gross sales of TPP','Colorado':'Retail sales only (excludes resale)','Connecticut':'Retail sales only (excludes resale)','Delaware':'No statewide sales tax','District of Columbia':'Retail sales only (excludes resale)','Florida':'Taxable sales only','Georgia':'Retail sales only (excludes resale)','Hawaii':'All / gross sales','Idaho':'All / gross sales','Illinois':'Retail sales only (excludes resale)','Indiana':'All / gross sales','Iowa':'All / gross sales','Kansas':'All / gross sales','Kentucky':'All / gross sales','Louisiana':'All / gross sales','Maine':'All / gross sales','Maryland':'All / gross sales','Massachusetts':'All / gross sales','Michigan':'All / gross sales','Minnesota':'Retail sales only (excludes resale)','Mississippi':'All / gross sales','Missouri':'Taxable sales only','Montana':'No statewide sales tax','Nebraska':'Retail sales only (excludes resale)','Nevada':'Retail sales only (excludes resale)','New Hampshire':'No statewide sales tax','New Jersey':'All / gross sales','New Mexico':'Taxable sales only','New York':'All / gross sales of TPP','North Carolina':'All / gross sales','North Dakota':'Taxable sales only','Ohio':'Retail sales only (excludes resale)','Oklahoma':'Taxable sales only','Oregon':'No statewide sales tax','Pennsylvania':'All / gross sales','Rhode Island':'All / gross sales','South Carolina':'All / gross sales','South Dakota':'All / gross sales','Tennessee':'Retail sales only (excludes resale)','Texas':'All / gross sales','Utah':'All / gross sales','Vermont':'All / gross sales','Virginia':'Retail sales only (excludes resale)','Washington':'All / gross sales','West Virginia':'All / gross sales','Wisconsin':'All / gross sales','Wyoming':'All / gross sales'
};

for(const r of doc.states){
  const state=r.state;
  if(expectedAmount[state]!==undefined && Number(r.dollar_threshold_amount)!==expectedAmount[state]) findings.push(`${state}: expected dollar amount ${expectedAmount[state]}, got ${r.dollar_threshold_amount}`);
  if(expectedMeasurement[state] && r.measurement_code!==expectedMeasurement[state]) findings.push(`${state}: measurement_code expected ${expectedMeasurement[state]}, got ${r.measurement_code}`);
  if(expectedScope[state] && r.nexus_sales_scope!==expectedScope[state]) findings.push(`${state}: sales scope expected ${expectedScope[state]}, got ${r.nexus_sales_scope}`);
  const hasTxn=r.transaction_threshold_count!==null;
  if(!expectedNoStateTax.has(state) && expectedTransactionProng.has(state)!==hasTxn) findings.push(`${state}: transaction-prong classification mismatch (${r.transaction_test})`);
  if(expectedNoStateTax.has(state) && r.status!=='No statewide sales tax') findings.push(`${state}: expected no statewide sales tax status`);
}

const recent={
  'Illinois':['2026-01-01','None (removed 2026-01-01)'],
  'Kentucky':['2026-08-01','None (removed 2026-08-01)'],
  'Utah':['2025-07-01','None (removed 2025-07-01)'],
  'Alaska':['2025-01-01','None (repealed 2025-01-01)'],
  'North Carolina':['2026-07-02','None (removed 2024-07-01)'],
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

// Primary-authority / discrepancy controls added by the 2026-08-09 independent logic audit.
const primaryOverrides=[
  ['Minnesota','measurement_code','ROLLING_12_MONTHS'],
  ['Pennsylvania','measurement_code','PRIOR_CY'],
  ['Pennsylvania','dollar_threshold_operator','>='],
  ['Vermont','measurement_code','ROLLING_12_MONTHS'],
  ['District of Columbia','transaction_threshold_operator','>'],
  ['District of Columbia','transaction_review_floor',200],
  ['Texas','measurement_code','PRIOR_12_COMPLETE_CAL_MONTHS'],
  ['Texas','dollar_threshold_operator','>'],
  ['Texas','dollar_review_floor',500000],
  ['North Dakota','latest_change_date','2019-07-01'],
  ['Illinois','measurement_code','QUARTER_END_TRAILING_12'],
  ['Illinois','dollar_threshold_operator','>='],
  ['Missouri','measurement_code','QUARTER_END_TRAILING_12'],
  ['Connecticut','threshold_logic','AND'],
  ['New York','threshold_logic','AND']
];
for(const [state,key,expected] of primaryOverrides){
  const r=byState.get(state); if(!r) {findings.push(`Missing primary-override state ${state}`); continue;}
  if(r[key]!==expected) findings.push(`${state}: ${key} expected ${expected}, got ${r[key]}`);
}

if(doc.schema_version!==5) findings.push(`schema_version expected 5, got ${doc.schema_version}`);
if(doc.app_version!=='1.3.3') findings.push(`app_version expected 1.3.3, got ${doc.app_version}`);
if(doc.rules_logic_audit_date!=='2026-08-09' || doc.measurement_period_audit_date!=='2026-08-09') findings.push('rules/measurement audit metadata not dated 2026-08-09');

if(findings.length){console.error('Independent reconciliation findings:\n- '+findings.join('\n- '));process.exit(1);}
const dollarOnly=doc.states.filter(r=>r.threshold!=='N/A' && r.transaction_threshold_count===null).map(r=>r.state);
console.log(`Independent rules reconciliation OK: ${doc.states.length} jurisdictions; ${expectedTransactionProng.size} transaction-prong; ${dollarOnly.length} dollar-only; 51 measurement codes/scopes reconciled with documented primary-source overrides.`);
