import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'data', 'state-nexus.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

const requiredMeta = [
  'schema_version','dataset_name','last_full_review','baseline_cross_check','audit_date',
  'review_cycle_days','review_due_days','app_version','source_url_audit_date',
  'source_url_audit_count','source_url_audit_status','rules_logic_audit_date',
  'measurement_period_audit_date','rules_logic_audit_note'
];
const requiredFields = [
  'state','status','threshold','transaction_test','measurement_period','nexus_sales_scope',
  'sales_basis','collection_timing','marketplace_note','rule_effective_date',
  'latest_change_date','last_reviewed','source_title','source_url','notes',
  'measurement_code','dollar_threshold_amount','dollar_threshold_operator',
  'transaction_threshold_count','transaction_threshold_operator','threshold_logic',
  'transaction_scope','logic_audit_date'
];
const allowedScopes = new Set([
  'All / gross sales','All / gross sales of TPP','Retail sales only (excludes resale)',
  'Taxable sales only','No statewide sales tax'
]);
const allowedMeasurementCodes = new Set([
  'CY_OR_PRIOR_CY','PRIOR_CY','ROLLING_12_MONTHS','QUARTER_END_TRAILING_12',
  'PRIOR_12_COMPLETE_CAL_MONTHS','NY_FOUR_SALES_TAX_QUARTERS','CT_SEP30_YEAR','NA'
]);
const allowedOps = new Set(['>','>=','N/A']);
const allowedLogic = new Set(['NONE','OR','AND']);
const allowedTxnScope = new Set(['none','retail','taxable','all']);
const errors=[];

for(const k of requiredMeta){
  if(doc[k]===undefined || doc[k]===null || doc[k]==='') errors.push(`Missing metadata: ${k}`);
}
for(const k of ['last_full_review','baseline_cross_check','audit_date','source_url_audit_date','rules_logic_audit_date','measurement_period_audit_date']){
  if(doc[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(doc[k]))) errors.push(`${k} must be YYYY-MM-DD`);
}
if(doc.schema_version!==5) errors.push(`Expected schema_version 5, found ${doc.schema_version}`);
if(doc.app_version!=='1.3.4') errors.push(`Expected app_version 1.3.4, found ${doc.app_version}`);
if(doc.source_url_audit_count!==51) errors.push(`Expected source_url_audit_count 51, found ${doc.source_url_audit_count}`);

if(!Array.isArray(doc.states)) errors.push('states must be an array');
else{
  if(doc.states.length!==51) errors.push(`Expected 51 jurisdictions, found ${doc.states.length}`);
  const seen=new Set();
  for(const [i,row] of doc.states.entries()){
    for(const k of requiredFields){
      if(row[k]===undefined || row[k]===null || row[k]===''){
        // Numeric threshold fields are permitted to be null only in N/A jurisdictions / no transaction test.
        if((k==='dollar_threshold_amount' || k==='transaction_threshold_count') && row[k]===null) continue;
        errors.push(`Row ${i+1} ${row.state||'(unknown)'} missing ${k}`);
      }
    }
    if(seen.has(row.state)) errors.push(`Duplicate state: ${row.state}`);
    seen.add(row.state);
    if(!allowedScopes.has(row.nexus_sales_scope)) errors.push(`${row.state}: invalid nexus_sales_scope ${row.nexus_sales_scope}`);
    if(!allowedMeasurementCodes.has(row.measurement_code)) errors.push(`${row.state}: invalid measurement_code ${row.measurement_code}`);
    if(!allowedOps.has(row.dollar_threshold_operator)) errors.push(`${row.state}: invalid dollar_threshold_operator ${row.dollar_threshold_operator}`);
    if(!allowedOps.has(row.transaction_threshold_operator)) errors.push(`${row.state}: invalid transaction_threshold_operator ${row.transaction_threshold_operator}`);
    if(!allowedLogic.has(row.threshold_logic)) errors.push(`${row.state}: invalid threshold_logic ${row.threshold_logic}`);
    if(!allowedTxnScope.has(row.transaction_scope)) errors.push(`${row.state}: invalid transaction_scope ${row.transaction_scope}`);
    if(!/^https:\/\//.test(row.source_url||'')) errors.push(`${row.state}: source_url must be https`);
    for(const k of ['rule_effective_date','latest_change_date','last_reviewed','logic_audit_date']){
      if(row[k]!=='N/A' && !/^\d{4}-\d{2}-\d{2}$/.test(row[k]||'')) errors.push(`${row.state}: ${k} must be YYYY-MM-DD or N/A`);
    }

    const noStateTax = row.nexus_sales_scope==='No statewide sales tax';
    if(noStateTax){
      if(row.measurement_code!=='NA') errors.push(`${row.state}: no-state-tax row must use measurement_code NA`);
      if(row.dollar_threshold_amount!==null) errors.push(`${row.state}: no-state-tax row dollar_threshold_amount must be null`);
      if(row.dollar_threshold_operator!=='N/A') errors.push(`${row.state}: no-state-tax row dollar_threshold_operator must be N/A`);
      if(row.transaction_threshold_count!==null) errors.push(`${row.state}: no-state-tax row transaction_threshold_count must be null`);
      if(row.transaction_threshold_operator!=='N/A') errors.push(`${row.state}: no-state-tax row transaction_threshold_operator must be N/A`);
      if(row.threshold_logic!=='NONE') errors.push(`${row.state}: no-state-tax row threshold_logic must be NONE`);
    }else{
      if(!Number.isFinite(Number(row.dollar_threshold_amount)) || Number(row.dollar_threshold_amount)<=0) errors.push(`${row.state}: dollar_threshold_amount must be a positive number`);
      if(!['>','>='].includes(row.dollar_threshold_operator)) errors.push(`${row.state}: taxable jurisdiction needs > or >= dollar operator`);
      if(row.measurement_code==='NA') errors.push(`${row.state}: taxable jurisdiction cannot use measurement_code NA`);
    }

    const hasTxn = row.transaction_threshold_count!==null;
    if(hasTxn){
      if(!Number.isFinite(Number(row.transaction_threshold_count)) || Number(row.transaction_threshold_count)<=0) errors.push(`${row.state}: transaction_threshold_count must be positive or null`);
      if(!['>','>='].includes(row.transaction_threshold_operator)) errors.push(`${row.state}: transaction threshold needs > or >= operator`);
      if(!['AND','OR'].includes(row.threshold_logic)) errors.push(`${row.state}: transaction threshold requires AND/OR threshold_logic`);
      if(row.transaction_scope==='none') errors.push(`${row.state}: transaction threshold requires non-none transaction_scope`);
    }else{
      if(row.transaction_threshold_operator!=='N/A') errors.push(`${row.state}: no transaction test must use N/A transaction operator`);
      if(row.threshold_logic!=='NONE') errors.push(`${row.state}: no transaction test must use threshold_logic NONE`);
      if(row.transaction_scope!=='none') errors.push(`${row.state}: no transaction test must use transaction_scope none`);
    }

    for(const k of ['transaction_review_floor','dollar_review_floor']){
      if(row[k]!==undefined && row[k]!==null && (!Number.isFinite(Number(row[k])) || Number(row[k])<0)) errors.push(`${row.state}: ${k} must be a non-negative number when present`);
    }
  }
}

if(errors.length){
  console.error(`Dataset validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
const dollarOnly=doc.states.filter(r=>r.threshold!=='N/A' && r.transaction_threshold_count===null).length;
console.log(`Dataset OK v${doc.app_version}/schema ${doc.schema_version}: ${doc.states.length} unique jurisdictions; ${dollarOnly} dollar-threshold-only jurisdictions; structured rule/measurement fields valid.`);
