import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const dataset=JSON.parse(fs.readFileSync(new URL('../data/state-nexus.json',import.meta.url),'utf8'));
const byState=Object.fromEntries(dataset.states.map(r=>[r.state,r]));
const fields={
  coverageStart:{value:'2024-01-01'},
  coverageEnd:{value:'2026-12-31'},
  analysisAsOf:{value:'2026-03-15'},
  watchPercent:{value:'0.90'}
};
const dummy={value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return null}};
const context=vm.createContext({
  console,
  window:{},
  document:{addEventListener(){},getElementById(id){return fields[id]||dummy;}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  navigator:{},Blob:class{},URL:{createObjectURL(){return ''},revokeObjectURL(){}},
  setTimeout,clearTimeout,requestAnimationFrame:(fn)=>fn(),confirm:()=>true,alert:()=>{}
});
vm.runInContext(fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8'),context);
const run=(code)=>vm.runInContext(code,context);
const setDocs=(docs)=>run(`normalizedDocuments=${JSON.stringify(docs)}`);
const analyze=(state,asOf='2026-03-15',watch=.9)=>{
  const row=JSON.stringify(byState[state]);
  return run(`analyzeState(${row},${JSON.stringify(asOf)},${watch})`);
};
const doc=(state,date,document,sales,type='Retail',customer='Customer')=>({state,date,document,sales,customerType:type,customer,rowsInGroup:1,distinctRows:1,dateConflict:false,typeConflict:false,customerConflict:false,note:''});

// Measurement engines / leap-year handling.
let x=run(`getMeasurementWindows(${JSON.stringify(byState.Illinois)},'2026-03-15')`);
assert.equal(x.code,'QUARTER_END_TRAILING_12');
assert.equal(x.windows[0].start,'2025-01-01');
assert.equal(x.windows[0].end,'2025-12-31');
assert.equal(x.nextTest,'2026-03-31');

x=run(`getMeasurementWindows(${JSON.stringify(byState.Texas)},'2024-03-15')`);
assert.equal(x.windows[0].start,'2023-03-01');
assert.equal(x.windows[0].end,'2024-02-29');

x=run(`getMeasurementWindows(${JSON.stringify(byState['New York'])},'2024-03-15')`);
assert.equal(x.windows[0].start,'2023-03-01');
assert.equal(x.windows[0].end,'2024-02-29');

x=run(`getMeasurementWindows(${JSON.stringify(byState.Connecticut)},'2026-03-15')`);
assert.equal(x.windows[0].start,'2024-10-01');
assert.equal(x.windows[0].end,'2025-09-30');

x=run(`getMeasurementWindows(${JSON.stringify(byState.Pennsylvania)},'2026-03-15')`);
assert.equal(x.code,'PRIOR_CY');
assert.equal(x.windows[0].start,'2025-01-01');
assert.equal(x.windows[0].end,'2025-12-31');

x=run(`getMeasurementWindows(${JSON.stringify(byState.Minnesota)},'2026-03-15')`);
assert.equal(x.code,'ROLLING_12_MONTHS');
assert.equal(x.windows[0].start,'2025-03-16');
assert.equal(x.windows[0].end,'2026-03-15');

x=run(`getMeasurementWindows(${JSON.stringify(byState.Vermont)},'2026-03-15')`);
assert.equal(x.code,'ROLLING_12_MONTHS');
assert.equal(x.windows[0].start,'2025-03-16');

// Duplicate logic: exact duplicates removed from dollars; distinct invoice lines are summed but remain one transaction.
let groups=run(`buildDocumentGroups(${JSON.stringify([
  {date:'2026-01-10',document:'INV-1',customer:'A',state:'California',sales:100,customerType:'Retail',issues:[]},
  {date:'2026-01-10',document:'INV-1',customer:'A',state:'California',sales:100,customerType:'Retail',issues:[]},
  {date:'2026-01-10',document:'INV-1',customer:'A',state:'California',sales:50,customerType:'Retail',issues:[]}
])})`);
assert.equal(groups.length,1);assert.equal(groups[0].rowsInGroup,3);assert.equal(groups[0].distinctRows,2);assert.equal(groups[0].sales,150);

// Reused document number across customers is still one transaction, but forces review.
groups=run(`buildDocumentGroups(${JSON.stringify([
  {date:'2026-01-10',document:'INV-X',customer:'A',state:'Arizona',sales:1000,customerType:'Retail',issues:[]},
  {date:'2026-01-10',document:'INV-X',customer:'B',state:'Arizona',sales:1000,customerType:'Retail',issues:[]}
])})`);
assert.equal(groups.length,1);assert.equal(groups[0].customerConflict,true);setDocs(groups);
fields.coverageStart.value='2025-01-01';fields.coverageEnd.value='2026-03-15';
let result=analyze('Arizona');
assert.equal(result.category,'review');assert.match(result.status,/document number reused across customers/i);

// California includes both retail and wholesale in the gross-TPP screen.
setDocs([doc('California','2026-01-10','A',300000,'Retail'),doc('California','2026-02-10','B',250001,'Wholesale')]);
result=analyze('California');assert.equal(result.category,'review');assert.equal(result.thresholdSales,550001);

// Current/prior calendar-year engine must preserve a prior current-year crossing even if a later credit lowers year-end total.
setDocs([doc('Arizona','2025-02-01','A',110000,'Retail'),doc('Arizona','2025-12-20','CREDIT',-20000,'Retail')]);
fields.coverageStart.value='2025-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('Arizona');assert.equal(result.category,'review');assert.equal(result.historicalTrigger,true);assert.match(result.status,/historical threshold crossing/i);

// Illinois historical quarter-end crossing is retained even if the latest quarter-end lookback is below threshold.
setDocs([doc('Illinois','2024-04-15','I1',60000),doc('Illinois','2024-05-15','I2',50000)]);
fields.coverageStart.value='2024-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('Illinois');assert.equal(result.category,'review');assert.equal(result.historicalTrigger,true);

// Minnesota rolling 12-month historical crossing can be found at transaction-date checkpoints.
setDocs([doc('Minnesota','2025-01-15','M1',60000),doc('Minnesota','2025-02-15','M2',50000)]);
fields.coverageStart.value='2024-01-01';fields.coverageEnd.value='2026-12-31';
result=analyze('Minnesota','2026-12-31');assert.equal(result.category,'review');assert.equal(result.historicalTrigger,true);

// Texas exact $500k is conservatively flagged because current Comptroller materials use inconsistent boundary wording.
setDocs([doc('Texas','2026-02-15','T1',500000)]);fields.coverageStart.value='2025-03-01';fields.coverageEnd.value='2026-02-28';
result=analyze('Texas','2026-03-15');assert.equal(result.category,'review');assert.match(result.status,/boundary ambiguity/i);

// D.C. exact 200 retail documents is boundary-review, while official rule principal operator is >200.
setDocs(Array.from({length:200},(_,i)=>doc('District of Columbia','2026-02-01',`D${i+1}`,1,'Retail')));fields.coverageStart.value='2025-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('District of Columbia');assert.equal(result.transactions,200);assert.equal(result.category,'review');assert.match(result.status,/boundary ambiguity/i);

// Connecticut requires BOTH tests.
setDocs(Array.from({length:200},(_,i)=>doc('Connecticut','2025-06-01',`CT${i+1}`,250,'Retail')));fields.coverageStart.value='2024-10-01';fields.coverageEnd.value='2025-09-30';
result=analyze('Connecticut','2026-03-15');assert.equal(result.transactions,200);assert.equal(result.thresholdSales,50000);assert.notEqual(result.status,'Review required — transaction-count proxy reached');
setDocs(Array.from({length:200},(_,i)=>doc('Connecticut','2025-06-01',`CTX${i+1}`,500,'Retail')));
result=analyze('Connecticut','2026-03-15');assert.equal(result.thresholdSales,100000);assert.equal(result.category,'review');

// Ohio transaction scope is retail. Wholesale documents are excluded from the legal proxy, but if reclassification would reach the threshold the workpaper conservatively requires review.
setDocs([
  ...Array.from({length:199},(_,i)=>doc('Ohio','2026-02-01',`OR${i+1}`,1,'Retail')),
  ...Array.from({length:50},(_,i)=>doc('Ohio','2026-02-01',`OW${i+1}`,1,'Wholesale'))
]);fields.coverageStart.value='2025-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('Ohio');assert.equal(result.transactions,199);assert.equal(result.category,'review');assert.match(result.status,/customer classification could change nexus result/i);

// Taxable-sales-only state uses retail as a screening proxy and states the limitation.
setDocs([doc('Arkansas','2026-01-15','AR1',100001,'Retail')]);
result=analyze('Arkansas');assert.equal(result.category,'review');assert.match(result.note,/does not establish taxability/i);

// Incomplete currently applicable measurement period cannot yield a below-threshold conclusion.
setDocs([doc('Arizona','2026-01-10','AZ1',50000)]);fields.coverageStart.value='2026-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('Arizona');assert.equal(result.category,'review');assert.match(result.status,/incomplete measurement-period data/i);

// Negative sales/returns force review when no threshold has already triggered.
setDocs([doc('Arizona','2026-01-10','AZ2',50000),doc('Arizona','2026-02-10','AZC',-1000)]);fields.coverageStart.value='2025-01-01';fields.coverageEnd.value='2026-03-15';
result=analyze('Arizona');assert.equal(result.category,'review');assert.match(result.status,/returns\/credits/i);

console.log('Transaction analysis smoke test PASS — measurement windows, historical crossings, structured threshold logic, duplicate handling, boundary controls, and proxy safeguards verified.');
