import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'data', 'state-nexus.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const requiredMeta = ['schema_version','dataset_name','last_full_review','baseline_cross_check','audit_date','review_cycle_days','review_due_days'];
const requiredFields = ['state','status','threshold','transaction_test','measurement_period','nexus_sales_scope','sales_basis','collection_timing','marketplace_note','rule_effective_date','latest_change_date','last_reviewed','source_title','source_url','notes'];
const allowedScopes = new Set(['All / gross sales','All / gross sales of TPP','Retail sales only (excludes resale)','Taxable sales only','No statewide sales tax']);
const errors=[];
for(const k of requiredMeta){if(doc[k]===undefined || doc[k]===null || doc[k]==='') errors.push(`Missing metadata: ${k}`);}
for(const k of ['last_full_review','baseline_cross_check','audit_date']){if(doc[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(doc[k]))) errors.push(`${k} must be YYYY-MM-DD`);}
if(!Array.isArray(doc.states)) errors.push('states must be an array');
else{
  if(doc.states.length!==51) errors.push(`Expected 51 jurisdictions, found ${doc.states.length}`);
  const seen=new Set();
  for(const [i,row] of doc.states.entries()){
    for(const k of requiredFields){if(row[k]===undefined || row[k]===null || row[k]==='') errors.push(`Row ${i+1} ${row.state||'(unknown)'} missing ${k}`);}
    if(seen.has(row.state)) errors.push(`Duplicate state: ${row.state}`); seen.add(row.state);
    if(!allowedScopes.has(row.nexus_sales_scope)) errors.push(`${row.state}: invalid nexus_sales_scope ${row.nexus_sales_scope}`);
    if(!/^https:\/\//.test(row.source_url||'')) errors.push(`${row.state}: source_url must be https`);
    for(const k of ['rule_effective_date','latest_change_date','last_reviewed']){
      if(row[k]!=='N/A' && !/^\d{4}-\d{2}-\d{2}$/.test(row[k]||'')) errors.push(`${row.state}: ${k} must be YYYY-MM-DD or N/A`);
    }
  }
}
if(errors.length){console.error(`Dataset validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);process.exit(1);}
const dollarOnly=doc.states.filter(r=>r.threshold!=='N/A' && String(r.transaction_test).startsWith('None')).length;
console.log(`Dataset OK: ${doc.states.length} unique jurisdictions; ${dollarOnly} dollar-threshold-only jurisdictions; all required fields and URLs present.`);
