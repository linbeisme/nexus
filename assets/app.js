'use strict';

const DATA_URL = './data/state-nexus.json';
const HISTORY_URL = './updates/update-history.json';
const APP_VERSION = '1.3.2';
const LS_WORKING = 'salesTaxNexusWorkingV5';
const LS_PROPOSALS = 'salesTaxNexusProposalsV5';
const LS_HISTORY = 'salesTaxNexusHistoryV5';
const LS_THEME = 'salesTaxNexusThemeV1';
const LS_RESEARCH_STATES = 'salesTaxNexusResearchStatesV1';

const columns = [
  ['state','State / jurisdiction'],
  ['review_status','Review status'],
  ['status','Tax regime'],
  ['threshold','Economic nexus threshold'],
  ['transaction_test','Transaction test'],
  ['measurement_period','Measurement period'],
  ['nexus_sales_scope','Nexus threshold sales scope'],
  ['sales_basis','What sales count'],
  ['collection_timing','Collection / registration timing'],
  ['marketplace_note','Marketplace note'],
  ['rule_effective_date','Rule effective'],
  ['latest_change_date','Latest material change'],
  ['last_reviewed','Working-paper reviewed'],
  ['source_url','Primary source'],
  ['notes','Notes'],
  ['_actions','Actions']
];

const MULTI_FILTER_KEYS = new Set(['state','review_status','status','transaction_test','nexus_sales_scope']);
const structuredRuleKeys = ['dollar_threshold_amount','dollar_threshold_operator','dollar_review_floor','transaction_threshold_count','transaction_threshold_operator','threshold_logic','measurement_code','transaction_scope','transaction_review_floor'];
const MATERIAL_CHANGE_KEYS = new Set(['status','threshold','transaction_test','measurement_period','nexus_sales_scope','sales_basis','collection_timing','marketplace_note','rule_effective_date','latest_change_date',...structuredRuleKeys]);
const editableKeys = ['status','threshold','transaction_test','measurement_period','nexus_sales_scope','sales_basis','collection_timing','marketplace_note','rule_effective_date','latest_change_date','last_reviewed','source_title','source_url','notes'];
const patchKeys = [...editableKeys,...structuredRuleKeys];
const allowedPatchKeys = new Set(patchKeys);
const numericPatchKeys = new Set(['dollar_threshold_amount','dollar_review_floor','transaction_threshold_count','transaction_review_floor']);
let meta = {};
let baselineStates = [];
let data = [];
let baseHistory = {schema_version:1,entries:[]};
let localHistory = [];
let proposals = [];
let filters = makeBlankFilters();
let dollarThresholdOnly = false;
let selectedResearchStates = new Set(loadLocal(LS_RESEARCH_STATES,[]).slice(0,10));
let statePickerExpanded = false;
let scrollSyncBound = false;
let importedTransactions = [];
let normalizedDocuments = [];
let analysisResults = [];
let importedFileNames = [];

const STATE_CODE_TO_NAME = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
};
const STATE_NAME_TO_NAME = Object.fromEntries(Object.values(STATE_CODE_TO_NAME).map(v=>[v.toLowerCase(),v]));

const REQUIRED_TRANSACTION_HEADERS = ['Document Date','Document #','Customer','Ship-to State','Sales $ Before Taxes','Customer Type'];

const MEASUREMENT_METHOD_LABELS = {
  CY_OR_PRIOR_CY:'Current or prior calendar year',
  PRIOR_CY:'Prior calendar year',
  ROLLING_12_MONTHS:'Rolling 12 months',
  QUARTER_END_TRAILING_12:'Quarter-end trailing 12 months',
  NY_FOUR_SALES_TAX_QUARTERS:'New York four sales-tax quarters',
  CT_SEP30_YEAR:'Connecticut September-30 year',
  PRIOR_12_COMPLETE_CAL_MONTHS:'Prior 12 completed calendar months',
  NA:'No statewide general sales tax'
};
const QUARTER_BASED_CODES = new Set(['QUARTER_END_TRAILING_12','NY_FOUR_SALES_TAX_QUARTERS']);


function makeBlankFilters(){return Object.fromEntries(columns.filter(([k])=>!k.startsWith('_')).map(([k])=>[k,MULTI_FILTER_KEYS.has(k)?[]:'']));}
function esc(v){return String(v ?? '').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function todayISO(){return new Date().toISOString().slice(0,10);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function dateValue(v){const d=new Date(`${v}T00:00:00Z`); return Number.isNaN(d.getTime()) ? null : d;}
function daysSince(v){const d=dateValue(v); if(!d) return Infinity; return Math.floor((Date.now()-d.getTime())/86400000);}
function addDays(v,n){const d=dateValue(v); if(!d) return '—'; d.setUTCDate(d.getUTCDate()+Number(n||0)); return d.toISOString().slice(0,10);}
function minReviewedDate(rows){const valid=rows.map(r=>r.last_reviewed).filter(v=>dateValue(v)).sort(); return valid.length===rows.length ? valid[0] : (meta.last_full_review || '');}
function regimeClass(v=''){return v.includes('No statewide')?'none':v.includes('Local sales')?'local':'sales';}
function proposalFor(state){return proposals.find(p=>p.state===state);}
function flagTrue(v){return v===true || v===1 || String(v).toLowerCase()==='true' || String(v).toLowerCase()==='yes';}
function reviewStatus(row){
  if(proposalFor(row.state)) return 'Proposed change';
  if(daysSince(row.last_reviewed) > Number(meta.review_due_days || 45)) return 'Review due';
  return 'Current';
}
function isDollarThresholdOnly(row){return row.threshold!=='N/A' && String(row.transaction_test||'').startsWith('None');}
function computedValue(row,key){return key==='review_status' ? reviewStatus(row) : (row[key] ?? '');}
function rowHasPublishedChange(row){return flagTrue(row.change_detected);}
function proposalIsMaterial(p){return !!p?.material_change;}
function stateHasMaterialAlert(state){const r=data.find(x=>x.state===state); return !!(proposalIsMaterial(proposalFor(state)) || (r && rowHasPublishedChange(r)));}
function recentChangeCutoffBase(){return meta.last_full_review || todayISO();}
function isRecentMaterialChange(row,days=365){const changed=row?.latest_change_date; const base=recentChangeCutoffBase(); const cd=dateValue(changed), bd=dateValue(base); if(!cd||!bd) return false; const diff=(bd.getTime()-cd.getTime())/86400000; return diff>=0 && diff<=days;}
function recentChangeTitle(row){return isRecentMaterialChange(row)?`Recent material update/change dated ${row.latest_change_date}`:'';}
function materialAlertStates(){return data.filter(r=>stateHasMaterialAlert(r.state)).map(r=>r.state);}

async function loadJson(url){const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`); return res.json();}
function loadLocal(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)); return x ?? fallback;}catch{return fallback;}}
function persistWorking(){localStorage.setItem(LS_WORKING,JSON.stringify({schema_version:meta.schema_version,source_last_full_review:meta.last_full_review,states:data}));}
function persistProposals(){localStorage.setItem(LS_PROPOSALS,JSON.stringify(proposals));}
function persistHistory(){localStorage.setItem(LS_HISTORY,JSON.stringify(localHistory));}
function persistResearchStates(){localStorage.setItem(LS_RESEARCH_STATES,JSON.stringify([...selectedResearchStates]));}

function isoDateFromValue(value){
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  if(typeof value==='number' && window.XLSX?.SSF?.parse_date_code){
    const d=XLSX.SSF.parse_date_code(value); if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s=String(value??'').trim(); if(!s) return '';
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){const [y,m,d]=s.split('-').map(Number);return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  const parsed=new Date(s); return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
}
function normalizeState(value){const s=String(value??'').trim();if(!s)return '';const up=s.toUpperCase();if(STATE_CODE_TO_NAME[up])return STATE_CODE_TO_NAME[up];return STATE_NAME_TO_NAME[s.toLowerCase()]||'';}
function parseSales(value){if(typeof value==='number')return Number.isFinite(value)?value:NaN;const s=String(value??'').replace(/[$,()\s]/g,m=>m==='('?'-':m===')'?'': '');const n=Number(s);return Number.isFinite(n)?n:NaN;}
function money(v){return Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});}
function dateLabel(iso){if(!iso)return '—';const d=dateValue(iso);return d?d.toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'}):iso;}
function ymd(d){return d.toISOString().slice(0,10);}
function utcDate(y,m,d){return new Date(Date.UTC(y,m-1,d));}
function endOfMonthUTC(y,m){return new Date(Date.UTC(y,m,0));}
function daysInMonthUTC(y,m){return endOfMonthUTC(y,m).getUTCDate();}
function clampedDateUTC(y,m,d){return utcDate(y,m,Math.min(d,daysInMonthUTC(y,m)));}
function oneYearEarlierClamped(d){return clampedDateUTC(d.getUTCFullYear()-1,d.getUTCMonth()+1,d.getUTCDate());}
function rolling12StartInclusive(end){const start=oneYearEarlierClamped(end);start.setUTCDate(start.getUTCDate()+1);return start;}
function quarterEndOnOrBefore(d){const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;const qEndMonth=Math.floor((m-1)/3)*3+3;let end=endOfMonthUTC(y,qEndMonth);if(end>d){const pm=qEndMonth-3;end=pm>0?endOfMonthUTC(y,pm):endOfMonthUTC(y-1,12);}return end;}
function nextQuarterEndAfter(d){const y=d.getUTCFullYear();for(const mm of [3,6,9,12]){const x=endOfMonthUTC(y,mm);if(x>d)return x;}return endOfMonthUTC(y+1,3);}
function quarterTrailingStart(end){return utcDate(end.getUTCFullYear()-1,end.getUTCMonth()+2,1);}
function periodObj(label,start,end,method=''){return {label,start:ymd(start),end:ymd(end),method};}
function lastNySalesQuarterEndOnOrBefore(d){
  const y=d.getUTCFullYear(); const candidates=[endOfMonthUTC(y,2),utcDate(y,5,31),utcDate(y,8,31),utcDate(y,11,30),utcDate(y-1,11,30)];
  return candidates.filter(x=>x<=d).sort((a,b)=>b-a)[0];
}
function nyFourQuarterStart(end){
  // NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb. Four completed quarters always start Mar 1, Jun 1, Sep 1, or Dec 1 one year before the end-quarter cycle.
  const m=end.getUTCMonth()+1,y=end.getUTCFullYear();
  if(m===2)return utcDate(y-1,3,1);
  if(m===5)return utcDate(y-1,6,1);
  if(m===8)return utcDate(y-1,9,1);
  return utcDate(y-1,12,1);
}
function legacyMeasurementCode(row){
  const p=row.measurement_period||'';
  if(p==='N/A')return 'NA';
  if(p==='Immediately preceding four sales-tax quarters')return 'NY_FOUR_SALES_TAX_QUARTERS';
  if(p==='12-month period ending September 30')return 'CT_SEP30_YEAR';
  if(p==='Preceding 12 calendar months')return 'PRIOR_12_COMPLETE_CAL_MONTHS';
  if(/Preceding 12 months; tested quarterly|Previous 12-month period, reviewed quarterly/i.test(p))return 'QUARTER_END_TRAILING_12';
  if(/Prior 12-month period \(rolling\)|Previous 12 months|Prior 12 months/i.test(p))return 'ROLLING_12_MONTHS';
  if(/^(Immediately preceding|Previous|Prior) calendar year$/i.test(p))return 'PRIOR_CY';
  if(/Current or (immediately )?(preceding|previous) calendar year|Preceding or current calendar year/i.test(p))return 'CY_OR_PRIOR_CY';
  return 'GENERIC_REVIEW';
}
function getMeasurementWindows(row,asOfIso){
  const asOf=dateValue(asOfIso)||new Date(); const y=asOf.getUTCFullYear(); const code=row.measurement_code||legacyMeasurementCode(row); const windows=[]; let nextTest='';
  if(code==='NA') return {windows:[],nextTest,code,explanation:'No statewide economic-nexus measurement period is stored for this jurisdiction.'};
  if(code==='CY_OR_PRIOR_CY'){
    windows.push(periodObj(`Current calendar year through ${dateLabel(ymd(asOf))}`,utcDate(y,1,1),asOf,'current calendar year'));
    windows.push(periodObj(`Immediately preceding calendar year ${y-1}`,utcDate(y-1,1,1),utcDate(y-1,12,31),'prior calendar year'));
  }else if(code==='PRIOR_CY'){
    windows.push(periodObj(`Immediately preceding calendar year ${y-1}`,utcDate(y-1,1,1),utcDate(y-1,12,31),'prior calendar year'));
  }else if(code==='PRIOR_12_COMPLETE_CAL_MONTHS'){
    const end=endOfMonthUTC(y,asOf.getUTCMonth()); const start=utcDate(end.getUTCFullYear()-1,end.getUTCMonth()+2,1);
    windows.push(periodObj('Preceding 12 completed calendar months',start,end,'12 completed calendar months'));
  }else if(code==='QUARTER_END_TRAILING_12'){
    const end=quarterEndOnOrBefore(asOf),start=quarterTrailingStart(end);
    windows.push(periodObj(`12 months ending ${dateLabel(ymd(end))}`,start,end,'quarter-end trailing 12 months'));
    nextTest=ymd(nextQuarterEndAfter(end));
  }else if(code==='NY_FOUR_SALES_TAX_QUARTERS'){
    const end=lastNySalesQuarterEndOnOrBefore(asOf),start=nyFourQuarterStart(end);
    windows.push(periodObj(`Immediately preceding four sales-tax quarters ending ${dateLabel(ymd(end))}`,start,end,'four sales-tax quarters'));
  }else if(code==='CT_SEP30_YEAR'){
    const endYear=(asOf.getUTCMonth()+1)>=10?y:y-1,end=utcDate(endYear,9,30),start=utcDate(endYear-1,10,1);
    windows.push(periodObj(`12 months ending Sep 30, ${endYear}`,start,end,'fixed September 30 year'));
  }else if(code==='ROLLING_12_MONTHS'){
    const start=rolling12StartInclusive(asOf);
    windows.push(periodObj(`Prior 12-month period through ${dateLabel(ymd(asOf))}`,start,asOf,'rolling 12-month period'));
  }else{
    // Unknown wording is intentionally not converted into a legal conclusion. A generic window is shown only to support human review.
    const start=rolling12StartInclusive(asOf);
    windows.push(periodObj(`${row.measurement_period||'Unclassified measurement period'} — review-only window`,start,asOf,'unclassified screening'));
  }
  return {windows,nextTest,code,explanation:row.measurement_period||code};
}
function uniqueMeasurementWindows(windows){
  const seen=new Set();
  return windows.filter(w=>{const k=`${w.start}|${w.end}`;if(seen.has(k))return false;seen.add(k);return true;});
}
function getAnalysisMeasurementWindows(row,asOfIso,stateDocs=[]){
  const latest=getMeasurementWindows(row,asOfIso),asOf=dateValue(asOfIso)||new Date(),code=latest.code;
  const cs=document.getElementById('coverageStart')?.value||'',ce=document.getElementById('coverageEnd')?.value||'';
  const coverageStart=dateValue(cs),coverageEnd=dateValue(ce),cutoff=coverageEnd&&coverageEnd<asOf?coverageEnd:asOf;
  let windows=latest.windows.map(w=>({...w,isLatest:true}));
  if(code==='NA'||!coverageStart||!cutoff)return {windows:uniqueMeasurementWindows(windows),latestKeys:new Set(latest.windows.map(w=>`${w.start}|${w.end}`)),code};
  const add=(w)=>{if(w.end<=ymd(asOf))windows.push({...w,isLatest:false});};
  const startYear=coverageStart.getUTCFullYear(),endYear=cutoff.getUTCFullYear();
  if(code==='CY_OR_PRIOR_CY'){
    // Current-year tests can create an obligation as soon as the threshold is crossed. Evaluate each transaction-date YTD checkpoint so a later credit/return does not erase an earlier screening signal.
    stateDocs.filter(d=>d.date&&d.date<=ymd(cutoff)).map(d=>d.date).sort().forEach(iso=>{
      const end=dateValue(iso); if(end)add(periodObj(`Calendar-year-to-date through ${dateLabel(iso)}`,utcDate(end.getUTCFullYear(),1,1),end,'historical current-year checkpoint'));
    });
    for(let y=startYear;y<=endYear;y++){
      const end=utcDate(y,12,31); if(end<=cutoff)add(periodObj(`Calendar year ${y}`,utcDate(y,1,1),end,'historical calendar year'));
    }
  }else if(code==='PRIOR_CY'){
    for(let y=startYear;y<=endYear;y++){
      const end=utcDate(y,12,31); if(end<=cutoff)add(periodObj(`Calendar year ${y}`,utcDate(y,1,1),end,'historical calendar year'));
    }
  }else if(code==='QUARTER_END_TRAILING_12'){
    for(let y=startYear-1;y<=endYear;y++)for(const m of [3,6,9,12]){const end=endOfMonthUTC(y,m);if(end<=cutoff)add(periodObj(`12 months ending ${dateLabel(ymd(end))}`,quarterTrailingStart(end),end,'quarter-end trailing 12 months'));}
  }else if(code==='NY_FOUR_SALES_TAX_QUARTERS'){
    for(let y=startYear-1;y<=endYear;y++)for(const end of [endOfMonthUTC(y,2),utcDate(y,5,31),utcDate(y,8,31),utcDate(y,11,30)]){if(end<=cutoff)add(periodObj(`Four sales-tax quarters ending ${dateLabel(ymd(end))}`,nyFourQuarterStart(end),end,'four sales-tax quarters'));}
  }else if(code==='CT_SEP30_YEAR'){
    for(let y=startYear-1;y<=endYear;y++){const end=utcDate(y,9,30);if(end<=cutoff)add(periodObj(`12 months ending Sep 30, ${y}`,utcDate(y-1,10,1),end,'fixed September 30 year'));}
  }else if(code==='PRIOR_12_COMPLETE_CAL_MONTHS'){
    let y=coverageStart.getUTCFullYear(),m=coverageStart.getUTCMonth()+1;
    const last=endOfMonthUTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth());
    while(true){const end=endOfMonthUTC(y,m);if(end>last)break;const start=utcDate(end.getUTCFullYear()-1,end.getUTCMonth()+2,1);add(periodObj(`12 completed calendar months ending ${dateLabel(ymd(end))}`,start,end,'12 completed calendar months'));m++;if(m>12){m=1;y++;}}
  }else if(code==='ROLLING_12_MONTHS'){
    const endpoints=new Set([ymd(asOf)]);stateDocs.forEach(d=>{if(d.date&&d.date<=ymd(asOf))endpoints.add(d.date);});
    [...endpoints].sort().forEach(iso=>{const end=dateValue(iso);if(end&&end<=cutoff)add(periodObj(`Prior 12 months through ${dateLabel(iso)}`,rolling12StartInclusive(end),end,'rolling 12-month screening checkpoint'));});
  }
  windows=uniqueMeasurementWindows(windows);
  const latestKeys=new Set(latest.windows.map(w=>`${w.start}|${w.end}`));
  windows=windows.map(w=>({...w,isLatest:latestKeys.has(`${w.start}|${w.end}`)}));
  return {windows,latestKeys,code};
}
function measurementGuidance(row,asOfIso){
  const asOf=asOfIso||document.getElementById('analysisAsOf')?.value||todayISO(),parsed=getMeasurementWindows(row,asOf),d=dateValue(asOf)||new Date(),month=d.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'}),code=parsed.code;
  let operational='';
  if(code==='CY_OR_PRIOR_CY') operational=`During ${month}, review January 1 through the selected analysis date for the current-year test and separately review the entire immediately preceding calendar year. Meeting the threshold in either applicable year requires nexus review.`;
  else if(code==='PRIOR_CY') operational=`During ${month}, use the complete immediately preceding calendar year. Current-year activity is useful for planning, but the stored nexus measurement period for this jurisdiction is the prior calendar year.`;
  else if(code==='QUARTER_END_TRAILING_12') operational=`This rule is tested at calendar-quarter checkpoints. At March 31, the modeled lookback is April 1 of the prior year through March 31. Before March 31 closes, the most recently completed checkpoint is December 31. The next modeled checkpoint is ${parsed.nextTest?dateLabel(parsed.nextTest):'the next quarter end'}.`;
  else if(code==='NY_FOUR_SALES_TAX_QUARTERS') operational='New York sales-tax quarters are March–May, June–August, September–November, and December–February. In March, review the four completed sales-tax quarters ending on the last day of February.';
  else if(code==='CT_SEP30_YEAR') operational='Connecticut uses the 12-month period ending September 30 immediately preceding the liability period. In March, the applicable threshold period is the 12 months ending the previous September 30; if both threshold tests were met, the collection obligation generally began October 1.';
  else if(code==='PRIOR_12_COMPLETE_CAL_MONTHS') operational='Use 12 completed calendar months. For a March 2026 analysis before March closes, the modeled period is March 1, 2025 through February 28, 2026.';
  else if(code==='ROLLING_12_MONTHS') operational=`Use the prior 12-month period ending on the selected analysis date. For example, on March 15, 2026, the model reviews March 16, 2025 through March 15, 2026. Confirm any state-specific checkpoint or registration timing before relying on the result.`;
  else if(code==='NA') operational='No statewide economic-nexus period is modeled. Local or special tax rules may still apply.';
  else operational='The measurement wording is not mapped to a verified engine code. Treat this as review-only and confirm the exact period against the linked primary authority.';
  const windows=parsed.windows.map(w=>`<li><strong>${esc(w.label)}:</strong> ${esc(dateLabel(w.start))} through ${esc(dateLabel(w.end))}</li>`).join('')||'<li>No statewide period modeled.</li>';
  return `<p><strong>Stored measurement period:</strong> ${esc(row.measurement_period||'—')}</p><p><strong>Audit code:</strong> ${esc(code)}</p><p>${esc(operational)}</p><p><strong>Modeled period(s) as of ${esc(dateLabel(asOf))}:</strong></p><ul>${windows}</ul><p><strong>Collection/registration timing stored for this state:</strong> ${esc(row.collection_timing||'—')}</p>${row.source_url?`<p class="source"><a href="${esc(row.source_url)}" target="_blank" rel="noopener noreferrer">Open ${esc(row.state)} primary source</a></p>`:''}<p class="small">This is a conservative screening explanation, not a filing-frequency determination. Primary authority controls if the state applies a different technical convention or facts create nexus independently of economic thresholds.</p>`;
}
function openMeasurementDialog(state){const row=data.find(r=>r.state===state);if(!row)return;document.getElementById('measurementTitle').textContent=`${row.state}: ${row.measurement_period}`;document.getElementById('measurementBody').innerHTML=measurementGuidance(row);document.getElementById('measurementDialog').showModal();}

function measurementMethodLabel(row){const code=row.measurement_code||legacyMeasurementCode(row);return MEASUREMENT_METHOD_LABELS[code]||`Unclassified (${code})`;}
function thresholdSummary(row){const dollar=parseDollarThreshold(row),tx=parseTransactionThreshold(row);if(!dollar&&!tx)return 'N/A';if(dollar&&tx)return `${dollar.operator} ${money(dollar.amount)} ${tx.logic} ${tx.operator} ${tx.amount} transactions`;if(dollar)return `${dollar.operator} ${money(dollar.amount)}`;return `${tx.operator} ${tx.amount} transactions`;}
function measurementDeterminationText(row){
  const code=row.measurement_code||legacyMeasurementCode(row);
  if(code==='CY_OR_PRIOR_CY') return 'Test two separate annual periods: current calendar-year activity and the immediately preceding completed calendar year. A threshold crossing in either applicable year is retained for review.';
  if(code==='PRIOR_CY') return 'Use the immediately preceding completed January 1-December 31 calendar year as the legal screening period. Current-year sales may be monitored operationally but are not substituted for the stored prior-year test.';
  if(code==='ROLLING_12_MONTHS') return 'Use a continuously moving 12-month lookback ending at the relevant checkpoint. The analyzer also checks historical transaction-date endpoints so an earlier crossing is not erased by later activity.';
  if(code==='QUARTER_END_TRAILING_12') return 'At each calendar-quarter checkpoint, total the preceding 12 months. The app evaluates completed quarter ends and preserves prior quarter-end crossings.';
  if(code==='NY_FOUR_SALES_TAX_QUARTERS') return 'Use the immediately preceding four New York sales-tax quarters: Mar-May, Jun-Aug, Sep-Nov, and Dec-Feb. Both New York dollar and sales-count tests must be satisfied.';
  if(code==='CT_SEP30_YEAR') return 'Use the fixed 12-month period ending September 30 immediately before the liability period. Connecticut requires both the dollar and retail-sales-count tests.';
  if(code==='PRIOR_12_COMPLETE_CAL_MONTHS') return 'Use the 12 completed calendar months immediately preceding the current month; do not use a partial current month as part of the threshold lookback.';
  if(code==='NA') return 'No statewide general sales-tax economic-nexus period is modeled. Local, special, physical-presence, or other obligations may still require review.';
  return 'Unclassified measurement wording. Confirm the exact period against current primary authority before relying on the screening result.';
}
function measurementExampleText(row,asOfIso){
  const parsed=getMeasurementWindows(row,asOfIso),code=parsed.code;
  if(code==='NA') return 'No statewide period modeled.';
  const modeled=parsed.windows.map(w=>`${w.start} through ${w.end}`).join(' | ');
  if(code==='CY_OR_PRIOR_CY') return `As of ${asOfIso}: test ${modeled}.`;
  if(code==='PRIOR_CY') return `As of ${asOfIso}: test ${modeled}.`;
  if(code==='ROLLING_12_MONTHS') return `Nonannual example as of ${asOfIso}: ${modeled}.`;
  if(code==='QUARTER_END_TRAILING_12') return `Quarter-based example as of ${asOfIso}: ${modeled}${parsed.nextTest?`; next checkpoint ${parsed.nextTest}`:''}.`;
  if(code==='NY_FOUR_SALES_TAX_QUARTERS') return `New York example as of ${asOfIso}: ${modeled}.`;
  if(code==='CT_SEP30_YEAR') return `Connecticut example as of ${asOfIso}: ${modeled}.`;
  if(code==='PRIOR_12_COMPLETE_CAL_MONTHS') return `Texas-style completed-month example as of ${asOfIso}: ${modeled}.`;
  return modeled||'Review primary authority.';
}
function measurementFilterMatches(row,value){const code=row.measurement_code||legacyMeasurementCode(row);return value==='all'||value===code||(value==='QUARTER_BASED'&&QUARTER_BASED_CODES.has(code));}
function renderMeasurementReference(){
  const body=document.getElementById('measurementReferenceBody');if(!body)return;
  const method=document.getElementById('measurementMethodFilter')?.value||'all',sort=document.getElementById('measurementSort')?.value||'state',q=(document.getElementById('measurementSearch')?.value||'').trim().toLowerCase(),asOf=document.getElementById('measurementReferenceDate')?.value||todayISO();
  let rows=data.filter(r=>measurementFilterMatches(r,method));
  if(q) rows=rows.filter(r=>[r.state,measurementMethodLabel(r),r.measurement_period,measurementDeterminationText(r),r.collection_timing,r.threshold,r.transaction_test,r.rule_effective_date,r.last_reviewed,r.latest_change_date].some(v=>String(v||'').toLowerCase().includes(q)));
  rows=[...rows].sort((a,b)=>sort==='method'?measurementMethodLabel(a).localeCompare(measurementMethodLabel(b))||a.state.localeCompare(b.state):a.state.localeCompare(b.state));
  body.innerHTML='';
  rows.forEach(r=>{const tr=document.createElement('tr');const code=r.measurement_code||legacyMeasurementCode(r);const recent=isRecentMaterialChange(r);tr.dataset.measurementCode=code;tr.innerHTML=`<td><span class="measurement-state-name">${esc(r.state)}</span>${recent?`<span class="recent-gold-star" title="${esc(recentChangeTitle(r))}" aria-label="${esc(recentChangeTitle(r))}">★</span>`:''}</td><td><span class="badge neutral">${esc(measurementMethodLabel(r))}</span><div class="small">${esc(code)}</div></td><td>${esc(r.measurement_period||'—')}</td><td>${esc(measurementDeterminationText(r))}</td><td>${esc(measurementExampleText(r,asOf))}</td><td>${esc(thresholdSummary(r))}</td><td>${esc(r.rule_effective_date||'—')}</td><td>${esc(r.last_reviewed||'—')}</td><td>${esc(r.collection_timing||'—')}</td><td class="source"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_title||'Official source')}</a></td>`;body.appendChild(tr);});
  const recentCount=data.filter(r=>isRecentMaterialChange(r)).length;
  const stats=document.getElementById('measurementStats');if(stats)stats.innerHTML=`<span class="chip">Showing ${rows.length} of ${data.length}</span><span class="chip">Calendar-year methods: ${data.filter(r=>['CY_OR_PRIOR_CY','PRIOR_CY'].includes(r.measurement_code)).length}</span><span class="chip">Rolling 12 months: ${data.filter(r=>r.measurement_code==='ROLLING_12_MONTHS').length}</span><span class="chip">Quarter-based: ${data.filter(r=>QUARTER_BASED_CODES.has(r.measurement_code)).length}</span><span class="chip">Special fixed/completed-month: ${data.filter(r=>['CT_SEP30_YEAR','PRIOR_12_COMPLETE_CAL_MONTHS'].includes(r.measurement_code)).length}</span><span class="chip">★ Recent material update/change within 12 months: ${recentCount}</span>`;
}
function clearMeasurementFilters(){const m=document.getElementById('measurementMethodFilter'),s=document.getElementById('measurementSort'),q=document.getElementById('measurementSearch'),d=document.getElementById('measurementReferenceDate');if(m)m.value='all';if(s)s.value='state';if(q)q.value='';if(d)d.value=todayISO();renderMeasurementReference();}

function setupAnalysisDefaults(){
  const asOf=document.getElementById('analysisAsOf'); if(asOf&&!asOf.value)asOf.value=todayISO();
  const ref=document.getElementById('measurementReferenceDate'); if(ref&&!ref.value)ref.value=asOf?.value||todayISO();
}
function headerLookup(obj,name){const key=Object.keys(obj).find(k=>k.trim().toLowerCase()===name.toLowerCase());return key?obj[key]:'';}
function normalizeImportedRow(raw,fileName,rowNumber){
  const date=isoDateFromValue(headerLookup(raw,'Document Date')); const doc=String(headerLookup(raw,'Document #')??'').trim(); const customer=String(headerLookup(raw,'Customer')??'').trim(); const state=normalizeState(headerLookup(raw,'Ship-to State')); const sales=parseSales(headerLookup(raw,'Sales $ Before Taxes')); const typeRaw=String(headerLookup(raw,'Customer Type')??'').trim(); const type=/^wholesale$/i.test(typeRaw)?'Wholesale':/^retail$/i.test(typeRaw)?'Retail':'';
  const issues=[]; if(!date)issues.push('Invalid/missing document date'); if(!doc)issues.push('Missing document #'); if(!customer)issues.push('Missing customer'); if(!state)issues.push('Invalid/missing ship-to state'); if(!Number.isFinite(sales))issues.push('Invalid sales amount'); if(!type)issues.push('Customer type must be Retail or Wholesale');
  return {date,document:doc,customer,state,sales:Number.isFinite(sales)?sales:0,customerType:type,sourceFile:fileName,rowNumber,issues};
}
function parseCsvFallback(text){
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(field);field='';if(row.some(x=>x!==''))rows.push(row);row=[];}else field+=ch;}
  if(field||row.length){row.push(field);rows.push(row);} if(!rows.length)return [];
  const headers=rows[0].map(x=>x.trim()); return rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
async function readTransactionFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(window.XLSX){const ab=await file.arrayBuffer(); const wb=XLSX.read(ab,{type:'array',cellDates:true}); const sheetName=wb.SheetNames.includes('Transactions')?'Transactions':wb.SheetNames[0]; if(!sheetName)throw new Error(`${file.name}: no worksheet found`); return XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:true});}
  if(ext==='csv'){return parseCsvFallback(await file.text());}
  throw new Error('Excel import library did not load. Refresh while online or use the CSV template.');
}
function buildDocumentGroups(rows){
  const valid=rows.filter(r=>!r.issues.length),map=new Map();
  valid.forEach((r,idx)=>{const key=`${r.state}||${r.document}`;if(!map.has(key))map.set(key,[]);map.get(key).push({...r,_idx:idx});});
  const docs=[];
  for(const [key,group] of map){
    const seen=new Set(),distinct=[];
    group.forEach(r=>{const sig=[r.date,r.document,r.customer,r.state,r.sales,r.customerType].join('||');if(!seen.has(sig)){seen.add(sig);distinct.push(r);}});
    const dates=[...new Set(distinct.map(r=>r.date))].sort(),types=[...new Set(distinct.map(r=>r.customerType))],customers=[...new Set(distinct.map(r=>r.customer))],sales=distinct.reduce((a,r)=>a+r.sales,0),notes=[];
    if(group.length>distinct.length)notes.push(`${group.length-distinct.length} exact duplicate row(s) removed from sales dollars`);
    if(distinct.length>1)notes.push(`${distinct.length} distinct imported row(s) consolidated to one transaction`);
    if(dates.length>1)notes.push('conflicting document dates');
    if(types.length>1)notes.push('conflicting customer types');
    if(customers.length>1)notes.push('conflicting customers / reused document number');
    docs.push({key,state:distinct[0].state,document:distinct[0].document,date:dates[0],dates,customer:customers.join(' / '),customers,customerType:types.length===1?types[0]:'Mixed',sales,rowsInGroup:group.length,distinctRows:distinct.length,dateConflict:dates.length>1,typeConflict:types.length>1,customerConflict:customers.length>1,note:notes.join('; ')});
  }
  return docs.sort((a,b)=>a.date.localeCompare(b.date)||a.state.localeCompare(b.state)||a.document.localeCompare(b.document));
}
function parseDollarThreshold(row){
  if(Number.isFinite(Number(row.dollar_threshold_amount)) && row.dollar_threshold_amount!==null){
    return {amount:Number(row.dollar_threshold_amount),operator:['>','>='].includes(row.dollar_threshold_operator)?row.dollar_threshold_operator:'>=',label:row.threshold||''};
  }
  const s=String(row.threshold||''),m=s.match(/\$\s*([\d,]+)/);if(!m)return null;const amount=Number(m[1].replaceAll(',',''));if(!Number.isFinite(amount))return null;return {amount,operator:s.trim().startsWith('>')?'>':'>=',label:s};
}
function parseTransactionThreshold(row){
  if(Number.isFinite(Number(row.transaction_threshold_count)) && row.transaction_threshold_count!==null){
    return {amount:Number(row.transaction_threshold_count),operator:['>','>='].includes(row.transaction_threshold_operator)?row.transaction_threshold_operator:'>=',logic:['AND','OR'].includes(row.threshold_logic)?row.threshold_logic:'OR',scope:['retail','taxable','all'].includes(row.transaction_scope)?row.transaction_scope:'all',label:row.transaction_test||''};
  }
  const s=String(row.transaction_test||'');if(!s||/^None|^N\/A/i.test(s))return null;const m=s.match(/(\d[\d,]*)/);if(!m)return null;const amount=Number(m[1].replaceAll(',','')),prefix=s.slice(0,s.indexOf(m[1])),operator=prefix.includes('>')?'>':'>=',logic=/^AND/i.test(s)?'AND':'OR',scope=/retail/i.test(`${s} ${row.threshold||''}`)?'retail':'all';return {amount,operator,logic,scope,label:s};
}
function meets(value,test){if(!test)return false;return test.operator==='>'?value>test.amount:value>=test.amount;}
function ratio(value,test){return test&&test.amount?value/test.amount:0;}
function inWindow(iso,w){return iso>=w.start&&iso<=w.end;}
function coverageComplete(w){const s=document.getElementById('coverageStart').value,e=document.getElementById('coverageEnd').value;return !!(s&&e&&s<=w.start&&e>=w.end);}
function thresholdSalesForDocs(row,docs){
  const scope=row.nexus_sales_scope||'';
  if(scope.startsWith('All / gross'))return docs.reduce((a,d)=>a+d.sales,0);
  if(scope.startsWith('Retail sales only'))return docs.filter(d=>d.customerType==='Retail').reduce((a,d)=>a+d.sales,0);
  if(scope.startsWith('Taxable sales only'))return docs.filter(d=>d.customerType==='Retail').reduce((a,d)=>a+d.sales,0);
  return 0;
}
function countTransactions(row,docs,txTest){
  if(!txTest)return 0; let eligible=docs;
  if(txTest.scope==='retail'||txTest.scope==='taxable')eligible=docs.filter(d=>d.customerType==='Retail');
  return eligible.filter(d=>d.sales>0).length;
}
function analyzeState(row,asOfIso,watchPct){
  if((row.measurement_code||legacyMeasurementCode(row))==='NA'||row.status.includes('No statewide')) return {state:row.state,category:'below',status:'No statewide sales tax',periodLabel:'N/A',thresholdSales:0,transactions:0,retailSales:0,wholesaleSales:0,note:'No statewide general sales tax economic-nexus test is modeled. Local, gross-receipts, physical-presence, or other tax obligations may still apply.',source_url:row.source_url,source_title:row.source_title,row};
  const stateDocs=normalizedDocuments.filter(d=>d.state===row.state),periodInfo=getAnalysisMeasurementWindows(row,asOfIso,stateDocs),dollarTest=parseDollarThreshold(row),txTest=parseTransactionThreshold(row);let best=null;const evaluated=[];
  for(const w of periodInfo.windows){
    const docs=stateDocs.filter(d=>inWindow(d.date,w)),thresholdSales=thresholdSalesForDocs(row,docs),tx=countTransactions(row,docs,txTest),retail=docs.filter(d=>d.customerType==='Retail').reduce((a,d)=>a+d.sales,0),wholesale=docs.filter(d=>d.customerType==='Wholesale').reduce((a,d)=>a+d.sales,0),dMeet=meets(thresholdSales,dollarTest),tMeet=meets(tx,txTest);let triggered=false;
    if(txTest)triggered=txTest.logic==='AND'?(dMeet&&tMeet):(dMeet||tMeet);else triggered=dMeet;
    const txFloor=Number(row.transaction_review_floor||0),dollarFloor=Number(row.dollar_review_floor||0),boundaryReview=!!((txFloor&&tx>=txFloor&&!tMeet)||(dollarFloor&&thresholdSales>=dollarFloor&&!dMeet));
    let potentialSales=thresholdSales,potentialTx=tx,potentialDMeet=dMeet,potentialTMeet=tMeet;
    if(wholesale>0 && ['Retail sales only (excludes resale)','Taxable sales only'].includes(row.nexus_sales_scope)){
      potentialSales=retail+wholesale; potentialDMeet=meets(potentialSales,dollarTest);
      if(txTest && (txTest.scope==='retail'||txTest.scope==='taxable')){potentialTx=docs.filter(d=>d.sales>0).length;potentialTMeet=meets(potentialTx,txTest);}
    }
    const potentialTriggered=txTest?(txTest.logic==='AND'?(potentialDMeet&&potentialTMeet):(potentialDMeet||potentialTMeet)):potentialDMeet;
    const classificationSensitive=!!(!triggered&&wholesale>0&&potentialTriggered),maxRatio=Math.max(ratio(thresholdSales,dollarTest),ratio(tx,txTest)),potentialRatio=Math.max(ratio(potentialSales,dollarTest),ratio(potentialTx,txTest)),result={window:w,docs,thresholdSales,transactions:tx,retailSales:retail,wholesaleSales:wholesale,dMeet,tMeet,triggered,boundaryReview,classificationSensitive,potentialSales,potentialTx,maxRatio,potentialRatio,complete:coverageComplete(w),isLatest:!!w.isLatest};evaluated.push(result);
    const rank=x=>x.triggered?3:x.boundaryReview?2:x.classificationSensitive?1:0;
    if(!best||rank(result)>rank(best)||(rank(result)===rank(best)&&Math.max(result.maxRatio,result.potentialRatio)>Math.max(best.maxRatio,best.potentialRatio||0)))best=result;
  }
  if(!best)best={window:{label:row.measurement_period,start:'',end:''},docs:[],thresholdSales:0,transactions:0,retailSales:0,wholesaleSales:0,dMeet:false,tMeet:false,triggered:false,boundaryReview:false,maxRatio:0,complete:false,isLatest:true};
  const latest=evaluated.filter(x=>x.isLatest),latestComplete=latest.length>0&&latest.every(x=>x.complete),relevantDocs=stateDocs.filter(d=>d.date<=asOfIso),hasDateConflict=relevantDocs.some(d=>d.dateConflict),hasTypeConflict=relevantDocs.some(d=>d.typeConflict),hasCustomerConflict=relevantDocs.some(d=>d.customerConflict),negativeDocs=relevantDocs.filter(d=>d.sales<0),historicalTrigger=best.triggered&&!best.isLatest; const notes=[];let category='below',status='Below modeled economic-nexus threshold — based on imported data';
  if(row.status.includes('Local sales')){category='review';status='Review local Alaska requirements';notes.push('Alaska has no statewide sales tax; this row represents participating local jurisdictions.');}
  else if(best.triggered){
    category='review';
    if(historicalTrigger){status='Review required — historical threshold crossing detected';notes.push('A complete or partially conclusive historical measurement window in the imported period met the screening threshold. Verify the original registration/collection start date, any trailing-nexus or termination rule, and current status.');}
    else if(txTest&&best.tMeet&&(!best.dMeet||txTest.logic==='OR'))status='Review required — transaction-count proxy reached';
    else if(row.nexus_sales_scope==='Taxable sales only')status='Review required — taxable-sales proxy reached';
    else if(row.nexus_sales_scope==='Retail sales only (excludes resale)')status='Review required — retail-sales screen reached';
    else status='Review required — sales threshold met';
  }else if(best.boundaryReview){category='review';status='Review required — threshold boundary ambiguity';notes.push('The audited rule has a known exact-boundary wording discrepancy between authoritative/independent materials. The analyzer conservatively flags the boundary for human review.');}
  else if(best.classificationSensitive){category='review';status='Review required — customer classification could change nexus result';notes.push(`Wholesale/resale classification excludes ${money(best.wholesaleSales)} from this state screen. If any excluded customer is not legally a resale/wholesale transaction, the state threshold could be met. Validate resale/exemption documentation before relying on the result.`);}
  else if(hasCustomerConflict){category='review';status='Review required — document number reused across customers';notes.push('At least one ship-to-state/document-number group contains more than one customer. The user-requested de-duplication rule still counts it as one transaction, but the source data should be resolved before reliance.');}
  else if(hasDateConflict){category='review';status='Review required — conflicting document dates';notes.push('At least one duplicate document group has more than one document date. The earliest date is shown for preview only; verify the correct transaction date before relying on a measurement-period result.');}
  else if(hasTypeConflict){category='review';status='Review required — conflicting customer types';notes.push('At least one document group contains both Retail and Wholesale classifications; resolve the classification before relying on retail/taxable threshold screening.');}
  else if(negativeDocs.length){category='review';status='Review required — returns/credits present';notes.push(`${negativeDocs.length} negative-sales document(s) occur in the imported period. State treatment of returns, credits, and allowances can differ; verify before relying on a below-modeled-threshold result.`);}
  else if(!latestComplete){category='review';status='Review required — incomplete measurement-period data';notes.push('Imported data coverage does not span every currently applicable modeled measurement period, so a below-modeled-threshold conclusion is not supported. Historical incomplete windows are not used to create a false below-modeled-threshold result.');}
  else if(best.maxRatio>=watchPct){category='watch';status=`Watch — ${Math.round(best.maxRatio*100)}% of modeled economic-nexus threshold`;}

  if(row.nexus_sales_scope==='Taxable sales only')notes.push('Taxable-sales-only threshold: Customer Type does not establish taxability. Retail sales are used only as a conservative screening proxy; product/service exemptions and exempt customers require separate review.');
  if(row.nexus_sales_scope==='Retail sales only (excludes resale)')notes.push('Retail-sales threshold: Customer Type is a screening classification and does not prove resale-certificate validity or legal resale status.');
  if(row.nexus_sales_scope==='All / gross sales of TPP')notes.push('TPP-only threshold: the six-field import does not identify product versus service revenue. Imported sales are conservatively screened as qualifying sales; review service/non-TPP amounts before a final conclusion.');
  if(/marketplace/i.test(`${row.marketplace_note||''} ${row.sales_basis||''}`))notes.push('Marketplace/facilitated channel is not identified in the six-field import; state-specific marketplace inclusion/exclusion can change the threshold calculation.');
  if(txTest)notes.push('Transaction count uses one unique positive-sales document number per ship-to state as a screening proxy. State law may define a sale/transaction by invoice, order, contract, or another unit; verify the state rule before concluding nexus.');
  notes.push('The six-field import does not test physical presence, related-entity aggregation, affiliate/click-through nexus, trailing nexus, product/service taxability, exemption documentation, or actual sales-tax return filing frequency/due dates.');
  if(category==='below')notes.push('Below modeled economic-nexus threshold means only that the imported data did not meet the modeled economic-nexus test. It is not an all-clear and is not a conclusion that the business has no nexus or no sales/use-tax obligation in the state.');
  const duplicateDocs=best.docs.filter(d=>d.rowsInGroup>1).length;if(duplicateDocs)notes.push(`${duplicateDocs} document group(s) contained duplicate/multiple imported rows and counted as one transaction each.`);
  return {state:row.state,category,status,periodLabel:best.window.label,periodStart:best.window.start,periodEnd:best.window.end,thresholdSales:best.thresholdSales,transactions:best.transactions,retailSales:best.retailSales,wholesaleSales:best.wholesaleSales,dollarTest,txTest,complete:latestComplete,historicalTrigger,note:notes.join(' '),source_url:row.source_url,source_title:row.source_title,row};
}
function transactionHeaderErrors(rows){if(!rows.length)return ['No transaction rows found'];const keys=Object.keys(rows[0]).map(k=>k.trim().toLowerCase());return REQUIRED_TRANSACTION_HEADERS.filter(h=>!keys.includes(h.toLowerCase())).map(h=>`Missing required column: ${h}`);}
async function importAndAnalyze(){
  const files=[...document.getElementById('transactionFiles').files]; const status=document.getElementById('transactionImportStatus'); if(!files.length){status.textContent='Choose at least one XLSX or CSV file first.';return;}
  status.textContent='Reading transaction files…'; const all=[]; const errors=[]; importedFileNames=[];
  for(const file of files){try{const rows=await readTransactionFile(file);const headErr=transactionHeaderErrors(rows);if(headErr.length){errors.push(`${file.name}: ${headErr.join('; ')}`);continue;}rows.forEach((r,i)=>{if(Object.values(r).every(v=>String(v??'').trim()===''))return;all.push(normalizeImportedRow(r,file.name,i+2));});importedFileNames.push(file.name);}catch(e){errors.push(`${file.name}: ${e.message}`);}}
  importedTransactions=all; normalizedDocuments=buildDocumentGroups(all); const valid=all.filter(r=>!r.issues.length); const dates=valid.map(r=>r.date).filter(Boolean).sort(); if(dates.length){const cs=document.getElementById('coverageStart'),ce=document.getElementById('coverageEnd'),as=document.getElementById('analysisAsOf');if(!cs.value||cs.dataset.auto==='true'){cs.value=dates[0];cs.dataset.auto='true';}if(!ce.value||ce.dataset.auto==='true'){ce.value=dates.at(-1);ce.dataset.auto='true';}if(as.value<dates.at(-1))as.value=dates.at(-1);}
  runTransactionAnalysis(); const invalid=all.length-valid.length; const dupGroups=normalizedDocuments.filter(d=>d.rowsInGroup>1).length; status.textContent=`Imported ${all.length} row(s) from ${importedFileNames.length} file(s); ${valid.length} valid row(s), ${invalid} invalid row(s), ${normalizedDocuments.length} unique state/document transaction(s), ${dupGroups} duplicate/multi-row document group(s).${errors.length?` File warning(s): ${errors.join(' | ')}`:''}`;
}
function runTransactionAnalysis(){
  if(!normalizedDocuments.length){document.getElementById('transactionSummary').classList.add('hidden');document.getElementById('analysisResultsArea').classList.add('hidden');document.getElementById('exportTransactionAnalysis').disabled=true;document.getElementById('downloadNormalizedCsv').disabled=true;return;}
  const asOf=document.getElementById('analysisAsOf').value||todayISO(),watch=Number(document.getElementById('watchPercent').value||0.9);analysisResults=data.map(r=>analyzeState(r,asOf,watch));renderTransactionAnalysis();
}
function renderTransactionAnalysis(){
  const valid=importedTransactions.filter(r=>!r.issues.length),invalid=importedTransactions.length-valid.length,dupGroups=normalizedDocuments.filter(d=>d.rowsInGroup>1).length,review=analysisResults.filter(r=>r.category==='review').length,watch=analysisResults.filter(r=>r.category==='watch').length;
  const summary=document.getElementById('transactionSummary');summary.classList.remove('hidden');summary.innerHTML=`<article><span>Imported rows</span><strong>${importedTransactions.length}</strong></article><article><span>Unique state/document transactions</span><strong>${normalizedDocuments.length}</strong></article><article><span>Duplicate/multi-row document groups</span><strong>${dupGroups}</strong></article><article><span>States requiring review</span><strong>${review}</strong></article><article><span>Watch states</span><strong>${watch}</strong></article><article><span>Invalid rows</span><strong>${invalid}</strong></article>`;
  document.getElementById('analysisResultsArea').classList.remove('hidden');document.getElementById('exportTransactionAnalysis').disabled=false;document.getElementById('downloadNormalizedCsv').disabled=false;renderAnalysisTable();renderTransactionPreview();
}
function renderAnalysisTable(){
  const mode=document.getElementById('analysisResultFilter').value;const rows=analysisResults.filter(r=>mode==='all'||r.category===mode);const tb=document.getElementById('analysisTbody');tb.innerHTML='';
  rows.forEach(r=>{const tr=document.createElement('tr');tr.className=`analysis-${r.category}`;const resultClass=r.category==='review'?'review':r.category==='watch'?'watch':'below';tr.innerHTML=`<td><strong>${esc(r.state)}</strong></td><td><span class="analysis-result ${resultClass}">${esc(r.status)}</span></td><td>${esc(r.row.measurement_period)}</td><td>${esc(r.periodLabel||'—')}</td><td>${money(r.thresholdSales)}</td><td>${r.transactions}</td><td>${esc(r.dollarTest?.label||r.row.threshold||'N/A')}</td><td>${esc(r.txTest?.label||r.row.transaction_test||'N/A')}</td><td>${money(r.retailSales)}</td><td>${money(r.wholesaleSales)}</td><td>${esc(r.note||'—')}</td><td class="source"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_title||'Official source')}</a></td>`;tb.appendChild(tr);});
}
function renderTransactionPreview(){const tb=document.getElementById('transactionPreviewBody');tb.innerHTML='';normalizedDocuments.slice(0,500).forEach(d=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(d.date)}</td><td>${esc(d.document)}</td><td>${esc(d.customer)}</td><td>${esc(d.state)}</td><td>${money(d.sales)}</td><td>${esc(d.customerType)}</td><td>${d.rowsInGroup}</td><td>${esc(d.note||'—')}</td>`;tb.appendChild(tr);});}
function clearTransactionAnalysis(){importedTransactions=[];normalizedDocuments=[];analysisResults=[];importedFileNames=[];const input=document.getElementById('transactionFiles');input.value='';document.getElementById('transactionImportStatus').textContent='No transaction files imported.';document.getElementById('transactionSummary').classList.add('hidden');document.getElementById('analysisResultsArea').classList.add('hidden');document.getElementById('exportTransactionAnalysis').disabled=true;document.getElementById('downloadNormalizedCsv').disabled=true;}
function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function downloadNormalizedTransactionsCsv(){const head=['Document Date','Document #','Customer','Ship-to State','Sales $ Before Taxes','Customer Type','Rows in Document Group','Data Note'];const lines=[head.join(','),...normalizedDocuments.map(d=>[d.date,d.document,d.customer,d.state,d.sales,d.customerType,d.rowsInGroup,d.note].map(csvEscape).join(','))];downloadBlob(`nexus_normalized_transactions_${todayISO()}.csv`,lines.join('\n')+'\n','text/csv');}
function exportTransactionAnalysis(){
  if(!analysisResults.length)return;if(window.XLSX){const reviewRows=analysisResults.map(r=>({'State':r.state,'Screening Result':r.status,'Measurement Period':r.row.measurement_period,'Period Evaluated':r.periodLabel,'Threshold Sales':r.thresholdSales,'Unique Transactions':r.transactions,'Dollar Threshold':r.dollarTest?.label||r.row.threshold,'Transaction Test':r.txTest?.label||r.row.transaction_test,'Retail Sales':r.retailSales,'Wholesale Sales':r.wholesaleSales,'Data / Method Note':r.note,'Primary Source':r.source_url}));const txRows=normalizedDocuments.map(d=>({'Document Date':d.date,'Document #':d.document,'Customer':d.customer,'Ship-to State':d.state,'Sales $ Before Taxes':d.sales,'Customer Type':d.customerType,'Rows in Document Group':d.rowsInGroup,'Data Note':d.note}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(reviewRows),'State Review');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(txRows),'Normalized Transactions');XLSX.writeFile(wb,`nexus_transaction_analysis_${todayISO()}.xlsx`);return;}const head=['State','Screening Result','Measurement Period','Period Evaluated','Threshold Sales','Unique Transactions','Dollar Threshold','Transaction Test','Retail Sales','Wholesale Sales','Data / Method Note','Primary Source'];const lines=[head.join(','),...analysisResults.map(r=>[r.state,r.status,r.row.measurement_period,r.periodLabel,r.thresholdSales,r.transactions,r.dollarTest?.label||r.row.threshold,r.txTest?.label||r.row.transaction_test,r.retailSales,r.wholesaleSales,r.note,r.source_url].map(csvEscape).join(','))];downloadBlob(`nexus_transaction_analysis_${todayISO()}.csv`,lines.join('\n')+'\n','text/csv');}


async function init(){
  try{
    const [dataset,hist] = await Promise.all([loadJson(DATA_URL),loadJson(HISTORY_URL).catch(()=>({schema_version:1,entries:[]}))]);
    meta = {...dataset}; delete meta.states;
    baselineStates = clone(dataset.states || []);
    baseHistory = hist;
    const saved = loadLocal(LS_WORKING,null);
    if(saved && saved.schema_version===meta.schema_version && saved.source_last_full_review===meta.last_full_review && Array.isArray(saved.states) && saved.states.length===baselineStates.length){
      data = saved.states;
    }else{
      data = clone(baselineStates);
      localStorage.removeItem(LS_WORKING);
      localStorage.removeItem(LS_PROPOSALS);
      localStorage.removeItem(LS_HISTORY);
    }
    proposals = loadLocal(LS_PROPOSALS,[]);
    localHistory = loadLocal(LS_HISTORY,[]);
    selectedResearchStates = new Set([...selectedResearchStates].filter(s=>data.some(r=>r.state===s)).slice(0,10));
    applyTheme(document.documentElement.dataset.theme==='night'?'night':'day',false);
    buildHeader(); bindEvents(); setupAnalysisDefaults(); renderStatePicker(); updateResearchScopeUI(); render(); renderMeasurementReference(); renderProposals(); renderMeta(); setupTableScrollSync();
  }catch(err){
    document.getElementById('versionBaselineLine').textContent='Dataset failed to load';
    document.getElementById('auditLine').textContent='Independent audit: —';
    document.getElementById('sourceAuditLine').textContent='Source links: —';
    document.getElementById('tbody').innerHTML=`<tr><td style="padding:20px;max-width:900px"><strong>Unable to load ${esc(DATA_URL)}.</strong><br>${esc(err.message)}<br><br>This GitHub-ready version must be served over HTTP/HTTPS (such as GitHub Pages). If you opened index.html directly from your filesystem, use a local web server or publish the repository to GitHub Pages.</td></tr>`;
  }
}

function applyTheme(theme,persist=true){
  const mode=theme==='night'?'night':'day';
  document.documentElement.dataset.theme=mode;
  const b=document.getElementById('themeToggle');
  if(b){
    b.setAttribute('aria-pressed',String(mode==='night'));
    b.querySelector('.theme-icon').textContent=mode==='night'?'☀':'☾';
    b.querySelector('.theme-label').textContent=mode==='night'?'Day':'Night';
  }
  const mc=document.getElementById('themeColor'); if(mc) mc.content=mode==='night'?'#111827':'#f5f7fb';
  if(persist){try{localStorage.setItem(LS_THEME,mode);}catch{}}
}
function toggleTheme(){applyTheme(document.documentElement.dataset.theme==='night'?'day':'night');}

function renderMeta(){
  const full = minReviewedDate(data) || meta.last_full_review || '—';
  const next = addDays(full,meta.review_cycle_days || 31);
  const due = data.filter(r=>reviewStatus(r)==='Review due').length;
  const alertStates=materialAlertStates();
  document.getElementById('lastFullReview').textContent=full;
  document.getElementById('nextReview').textContent=next;
  document.getElementById('reviewDueCount').textContent=String(due);
  document.getElementById('approvedChangeCount').textContent=String(new Set(localHistory.filter(x=>['approved_update','manual_edit'].includes(x.type) && x.state).map(x=>x.state)).size);
  document.getElementById('proposalCount').textContent=String(proposals.length);
  document.getElementById('versionBaselineLine').textContent=`Version ${meta.app_version || APP_VERSION} · Published baseline: ${meta.last_full_review || '—'}`;
  document.getElementById('auditLine').textContent=`Independent audit: ${meta.audit_date || '—'}`;
  document.getElementById('sourceAuditLine').textContent=meta.source_url_audit_date?`Source links: ${meta.source_url_audit_count || 51}/51 verified ${meta.source_url_audit_date}`:'Source links: —';
  document.getElementById('footerMeta').textContent=`App v${meta.app_version || APP_VERSION} · Independent audit: ${meta.audit_date || '—'} · Benchmark cross-check: ${meta.baseline_cross_check || '—'} · Source-link audit: ${meta.source_url_audit_date || '—'} · Review-due interval: ${meta.review_due_days || 45} days · ${data.length} jurisdictions.`;
  const alert=document.getElementById('changeAlert');
  if(alertStates.length){
    alert.classList.remove('hidden');
    alert.querySelector('span').textContent=`${alertStates.length} material change${alertStates.length===1?'':'s'} — update required`;
    alert.title=`Review/update: ${alertStates.join(', ')}`;
  }else{
    alert.classList.add('hidden'); alert.title='No staged or published material-change alert';
  }
}

function filterOptions(key){
  const values = key==='review_status' ? data.map(reviewStatus) : data.map(r=>computedValue(r,key));
  return [...new Set(values.map(v=>String(v)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
function multiSummary(key){const n=(filters[key]||[]).length; return n?`${n} selected`:'All';}
function positionMultiFilterMenu(details,menu){
  const summary=details.querySelector('summary'); if(!summary) return;
  const r=summary.getBoundingClientRect();
  const key=details.dataset.key || '';
  const preferred = key==='transaction_test' ? 390 : (key==='state' ? 300 : 360);
  const width=Math.min(preferred,Math.max(280,window.innerWidth-24));
  let left=Math.max(12,r.left);
  if(left+width>window.innerWidth-12) left=Math.max(12,window.innerWidth-width-12);
  let top=r.bottom+5;
  const estimated=Math.min(420,window.innerHeight-24);
  if(top+estimated>window.innerHeight-12 && r.top>estimated+12) top=Math.max(12,r.top-estimated-5);
  menu.style.width=`${width}px`; menu.style.left=`${left}px`; menu.style.top=`${Math.max(12,top)}px`;
}
function buildMultiFilter(key){
  const details=document.createElement('details'); details.className='multi-filter'; details.dataset.key=key;
  const summary=document.createElement('summary'); summary.textContent=multiSummary(key); details.appendChild(summary);
  const menu=document.createElement('div'); menu.className='multi-filter-menu';
  const search=document.createElement('input'); search.type='search'; search.placeholder='Find criteria…'; search.setAttribute('aria-label',`Search ${key} filter options`); menu.appendChild(search);
  const toolbar=document.createElement('div'); toolbar.className='multi-filter-toolbar';
  const selectVisible=document.createElement('button'); selectVisible.type='button'; selectVisible.textContent='Select visible';
  const clearVisible=document.createElement('button'); clearVisible.type='button'; clearVisible.textContent='Clear visible';
  const count=document.createElement('span'); count.className='count';
  toolbar.append(selectVisible,clearVisible,count); menu.appendChild(toolbar);
  const opts=document.createElement('div'); opts.className='multi-filter-options';
  filterOptions(key).forEach(value=>{
    const label=document.createElement('label'); label.className='multi-option'; label.dataset.search=value.toLowerCase();
    const cb=document.createElement('input'); cb.type='checkbox'; cb.value=value; cb.checked=(filters[key]||[]).includes(value);
    cb.addEventListener('change',()=>{
      const s=new Set(filters[key]||[]); if(cb.checked)s.add(value); else s.delete(value); filters[key]=[...s]; summary.textContent=multiSummary(key); updateVisibleCount(); render();
    });
    const span=document.createElement('span'); span.textContent=value; label.append(cb,span); opts.appendChild(label);
  });
  menu.appendChild(opts);
  const visibleCheckboxes=()=>[...opts.querySelectorAll('.multi-option:not(.hidden) input[type="checkbox"]')];
  const updateVisibleCount=()=>{const visible=visibleCheckboxes(); const checked=visible.filter(x=>x.checked).length; count.textContent=`${checked}/${visible.length} visible selected`;};
  const applySelection=(checked)=>{const set=new Set(filters[key]||[]); visibleCheckboxes().forEach(cb=>{cb.checked=checked; if(checked)set.add(cb.value); else set.delete(cb.value);}); filters[key]=[...set]; summary.textContent=multiSummary(key); updateVisibleCount(); render();};
  selectVisible.addEventListener('click',()=>applySelection(true));
  clearVisible.addEventListener('click',()=>applySelection(false));
  const actions=document.createElement('div'); actions.className='multi-filter-actions';
  const clear=document.createElement('button'); clear.type='button'; clear.textContent='Clear all'; clear.addEventListener('click',()=>{filters[key]=[]; opts.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false); summary.textContent='All'; updateVisibleCount(); render();});
  const close=document.createElement('button'); close.type='button'; close.textContent='Close'; close.addEventListener('click',()=>details.removeAttribute('open'));
  actions.append(clear,close); menu.appendChild(actions);
  search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase(); opts.querySelectorAll('.multi-option').forEach(el=>el.classList.toggle('hidden',!!q&&!el.dataset.search.includes(q))); updateVisibleCount();});
  details.addEventListener('toggle',()=>{
    if(details.open){
      document.querySelectorAll('.multi-filter[open]').forEach(other=>{if(other!==details)other.removeAttribute('open');});
      requestAnimationFrame(()=>positionMultiFilterMenu(details,menu));
      updateVisibleCount();
      search.focus({preventScroll:true});
    }
  });
  details.appendChild(menu);
  return details;
}
function buildHeader(){
  const hr=document.getElementById('headerRow'), fr=document.getElementById('filterRow'); hr.innerHTML=''; fr.innerHTML='';
  columns.forEach(([key,label],i)=>{
    const th=document.createElement('th'); th.textContent=label; if(i===0) th.className='state-cell'; hr.appendChild(th);
    const fth=document.createElement('th'); if(i===0) fth.className='state-cell';
    if(!key.startsWith('_')){
      if(MULTI_FILTER_KEYS.has(key)) fth.appendChild(buildMultiFilter(key));
      else{
        const inp=document.createElement('input'); inp.placeholder='Filter…'; inp.dataset.key=key; inp.value=filters[key] || '';
        inp.addEventListener('input',()=>{filters[key]=inp.value.toLowerCase(); render();}); fth.appendChild(inp);
      }
    }
    fr.appendChild(fth);
  });
}
function filterPass(row,key,value){
  if(MULTI_FILTER_KEYS.has(key)) return !value.length || value.includes(String(computedValue(row,key)));
  return !value || String(computedValue(row,key)).toLowerCase().includes(value);
}
function visibleRows(){
  const q=document.getElementById('globalSearch').value.trim().toLowerCase();
  return data.filter(r=>{
    if(dollarThresholdOnly && !isDollarThresholdOnly(r)) return false;
    if(!Object.entries(filters).every(([k,v])=>filterPass(r,k,v))) return false;
    if(!q) return true;
    return columns.filter(([k])=>!k.startsWith('_')).some(([k])=>String(computedValue(r,k)).toLowerCase().includes(q));
  });
}

function render(){
  const rows=visibleRows(), tb=document.getElementById('tbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    columns.forEach(([key],i)=>{
      const td=document.createElement('td'); if(i===0) td.className='state-cell';
      if(key==='state'){
        const alert=stateHasMaterialAlert(r.state); const p=proposalFor(r.state); const note=p?.change_note || r.change_note || 'Material collection/filing requirement change detected. Review and update this state.';
        td.innerHTML=`${esc(r.state)}${alert?`<span class="state-change-star" title="${esc(note)}" aria-label="Change detected: ${esc(note)}">★</span>`:''}`;
      }
      else if(key==='status') td.innerHTML=`<span class="status ${regimeClass(r.status)}">${esc(r.status)}</span>`;
      else if(key==='review_status'){
        const s=reviewStatus(r), c=s==='Current'?'review-current':s==='Review due'?'review-due':'review-proposed';
        td.innerHTML=`<span class="status ${c}">${esc(s)}</span>`;
      }
      else if(key==='measurement_period'){
        td.innerHTML=`<div class="measurement-cell"><span>${esc(r.measurement_period||'')}</span><button type="button" class="info-button" data-measurement-state="${esc(r.state)}" title="Explain how this measurement period works" aria-label="Explain ${esc(r.state)} measurement period">i</button></div>`;
      }
      else if(key==='source_url'){
        td.className='source';
        td.innerHTML=`<a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">${esc(r.source_title || 'Official source')}</a><div class="small">${esc(r.source_url)}</div>`;
      }
      else if(key==='_actions') td.innerHTML=`<button data-edit="${esc(r.state)}">Edit</button>`;
      else td.textContent=r[key] ?? '';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  tb.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.edit)));
  tb.querySelectorAll('[data-measurement-state]').forEach(b=>b.addEventListener('click',()=>openMeasurementDialog(b.dataset.measurementState)));
  const sales=data.filter(x=>!x.status.includes('No statewide') && !x.status.includes('Local sales')).length;
  const noTax=data.filter(x=>x.status.includes('No statewide')).length;
  const dollarOnly=data.filter(isDollarThresholdOnly).length;
  const alerts=materialAlertStates().length;
  document.getElementById('stats').innerHTML=`<span class="chip">Showing ${rows.length} of ${data.length}</span><span class="chip">Dollar-threshold-only: ${dollarOnly}</span><span class="chip">Sales-tax / equivalent: ${sales}</span><span class="chip">No statewide sales tax: ${noTax}</span>${alerts?`<span class="chip alert-chip">🚨 ${alerts} update${alerts===1?'':'s'} required</span>`:''}`;
  renderMeta(); renderMeasurementReference(); requestAnimationFrame(syncTableScrollWidth);
}

function clearFilters(){
  filters=makeBlankFilters(); document.getElementById('globalSearch').value=''; dollarThresholdOnly=false;
  const toggle=document.getElementById('dollarThresholdOnly'); if(toggle) toggle.checked=false;
  buildHeader(); render();
}

function setupTableScrollSync(){
  if(scrollSyncBound) return; scrollSyncBound=true;
  const top=document.getElementById('tableScrollTop'), wrap=document.getElementById('tableWrap'); let syncing=false;
  top.addEventListener('scroll',()=>{if(syncing)return;syncing=true;wrap.scrollLeft=top.scrollLeft;requestAnimationFrame(()=>syncing=false);});
  wrap.addEventListener('scroll',()=>{document.querySelectorAll('.multi-filter[open]').forEach(d=>d.removeAttribute('open'));if(syncing)return;syncing=true;top.scrollLeft=wrap.scrollLeft;requestAnimationFrame(()=>syncing=false);});
  if('ResizeObserver' in window){new ResizeObserver(syncTableScrollWidth).observe(document.getElementById('nexusTable'));}
  window.addEventListener('resize',syncTableScrollWidth); syncTableScrollWidth();
}
function syncTableScrollWidth(){const table=document.getElementById('nexusTable'), spacer=document.getElementById('tableScrollTopSpacer'); if(table&&spacer) spacer.style.width=`${table.scrollWidth}px`;}

function openEdit(state){
  const r=data.find(x=>x.state===state); if(!r) return;
  const labels=Object.fromEntries(columns); const wrap=document.getElementById('editFields'); wrap.innerHTML='';
  const sl=document.createElement('label'); sl.textContent='State'; const si=document.createElement('input'); si.value=r.state; si.disabled=true; wrap.append(sl,si);
  editableKeys.forEach(key=>{
    const lab=document.createElement('label'); lab.textContent=labels[key] || key.replaceAll('_',' '); wrap.appendChild(lab);
    const large=['sales_basis','collection_timing','marketplace_note','notes'].includes(key);
    const el=large?document.createElement('textarea'):document.createElement('input'); el.name=key; el.value=r[key] ?? ''; if(large)el.style.minHeight='65px'; wrap.appendChild(el);
  });
  const dlg=document.getElementById('editDialog'); dlg.dataset.state=state; dlg.showModal();
}
function saveEdit(e){
  e.preventDefault(); const dlg=document.getElementById('editDialog'), r=data.find(x=>x.state===dlg.dataset.state); if(!r) return;
  const before=clone(r); document.querySelectorAll('#editFields [name]').forEach(el=>r[el.name]=el.value.trim()); if(!r.last_reviewed) r.last_reviewed=todayISO();
  const changed=editableKeys.filter(k=>String(before[k]??'')!==String(r[k]??''));
  if(changed.length){localHistory.push({date:todayISO(),type:'manual_edit',state:r.state,fields_changed:changed,summary:'Manual working-copy edit in browser.',source_url:r.source_url||''}); persistHistory();}
  persistWorking(); buildHeader(); render(); dlg.close();
}

function researchRows(){
  const scope=document.getElementById('updateScope').value;
  if(scope==='all') return data;
  if(scope==='visible') return visibleRows();
  return data.filter(r=>selectedResearchStates.has(r.state));
}
function updateResearchScopeUI(){
  const selected=document.getElementById('updateScope').value==='selected';
  const controls=document.getElementById('statePickerControls'), picker=document.getElementById('statePicker'), toggle=document.getElementById('statePickerToggle');
  controls.classList.toggle('hidden',!selected);
  picker.classList.toggle('hidden',!selected || !statePickerExpanded);
  toggle.setAttribute('aria-expanded',String(selected && statePickerExpanded));
  toggle.textContent=statePickerExpanded?'Hide state selector':`Show state selector (${selectedResearchStates.size}/10)`;
}
function toggleStatePicker(){statePickerExpanded=!statePickerExpanded;updateResearchScopeUI();if(statePickerExpanded)setTimeout(()=>document.getElementById('statePickerSearch').focus(),0);}
function renderStatePicker(){
  const list=document.getElementById('stateSelectionList'); if(!list) return; const q=(document.getElementById('statePickerSearch')?.value||'').trim().toLowerCase(); list.innerHTML='';
  data.filter(r=>!q||r.state.toLowerCase().includes(q)).forEach(r=>{
    const label=document.createElement('label'); label.className='state-choice';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=selectedResearchStates.has(r.state); cb.value=r.state;
    cb.addEventListener('change',()=>{
      if(cb.checked && selectedResearchStates.size>=10){cb.checked=false; document.getElementById('stateSelectionCount').classList.add('selection-limit'); setTimeout(()=>document.getElementById('stateSelectionCount').classList.remove('selection-limit'),1200); return;}
      if(cb.checked)selectedResearchStates.add(r.state); else selectedResearchStates.delete(r.state); persistResearchStates(); renderStatePicker();
    });
    const span=document.createElement('span'); span.textContent=r.state; label.append(cb,span); list.appendChild(label);
  });
  const count=document.getElementById('stateSelectionCount'); count.textContent=`${selectedResearchStates.size} / 10 selected`; count.classList.toggle('selection-limit',selectedResearchStates.size>=10);
  const names=[...selectedResearchStates].sort((a,b)=>a.localeCompare(b));
  const summary=document.getElementById('selectedStateSummary');
  if(summary) summary.textContent=names.length?`Selected: ${names.slice(0,4).join(', ')}${names.length>4?` +${names.length-4} more`:''}`:'No states selected';
  updateResearchScopeUI();
}
function buildUpdatePrompt(){
  const scope=researchRows(); const out=document.getElementById('updatePrompt');
  if(!scope.length){out.value='Select at least one state (up to 10), or choose Visible / filtered rows or All jurisdictions.'; return;}
  const compact=scope.map(r=>({state:r.state,status:r.status,current_threshold:r.threshold,dollar_threshold_amount:r.dollar_threshold_amount,dollar_threshold_operator:r.dollar_threshold_operator,dollar_review_floor:r.dollar_review_floor,transaction_test:r.transaction_test,transaction_threshold_count:r.transaction_threshold_count,transaction_threshold_operator:r.transaction_threshold_operator,threshold_logic:r.threshold_logic,transaction_scope:r.transaction_scope,measurement_period:r.measurement_period,measurement_code:r.measurement_code,nexus_sales_scope:r.nexus_sales_scope,sales_basis:r.sales_basis,collection_timing:r.collection_timing,marketplace_note:r.marketplace_note,rule_effective_date:r.rule_effective_date,latest_change_date:r.latest_change_date,last_reviewed:r.last_reviewed,primary_source:r.source_url}));
  const secondaries=(meta.secondary_sources||[]).map(s=>s.url).join(' and ');
  out.value=`Act as a senior U.S. state-and-local-tax researcher supporting a CPA. Check for changes to remote-seller sales/use tax economic nexus and seller collection/remittance requirements since the later of each jurisdiction's latest_change_date or last_reviewed date.

RESEARCH STANDARD
- Use primary authority first: enacted statutes/bills, regulations, official revenue-department notices, FAQs, and tax-agency pages.
- Verify and refresh, where applicable, the dollar threshold and exact > / >= boundary, transaction-count threshold and exact boundary, AND/OR logic, legal transaction-count scope, measurement period text, measurement_code, nexus threshold sales scope (gross/all vs retail-only vs taxable-only), which sales count, registration/collection timing, marketplace-facilitator interaction, and any enacted future change.
- Distinguish a rule's effective date from the date an agency webpage was reviewed or updated. Record the legal rule_effective_date and latest_change_date separately.
- Validate that each proposed source_url resolves to a current official state or state-authorized source.
- IMPORTANT: when a material rule changes, update every dependent field so all affected sections remain synchronized. That includes Section 1 thresholds/notes, Section 2 measurement-period explanations, and Section 3 transaction-analysis inputs. If one field changes, also update any related threshold text, measurement_period, measurement_code, transaction_test, threshold_logic, sales scope/basis, collection_timing, marketplace_note, and date fields that are affected.
- Set change_detected=true ONLY when a material collection, filing, threshold, sales-base, timing, or marketplace requirement changed since the stored record. Include a short change_note. Otherwise set change_detected=false.
- If there is no material change, preserve the existing rule text and set last_reviewed to today's date.

OUTPUT
Return ONLY a JSON array, one object per jurisdiction reviewed. Use keys: state, status, threshold, dollar_threshold_amount, dollar_threshold_operator, dollar_review_floor, transaction_test, transaction_threshold_count, transaction_threshold_operator, threshold_logic, transaction_scope, measurement_period, measurement_code, nexus_sales_scope, sales_basis, collection_timing, marketplace_note, rule_effective_date, latest_change_date, last_reviewed, source_title, source_url, notes, change_detected, change_note. measurement_code must be one of CY_OR_PRIOR_CY, PRIOR_CY, ROLLING_12_MONTHS, QUARTER_END_TRAILING_12, PRIOR_12_COMPLETE_CAL_MONTHS, NY_FOUR_SALES_TAX_QUARTERS, CT_SEP30_YEAR, or NA. Use null for a nonexistent numeric transaction threshold. Existing wording may be preserved when verified and unchanged.

CURRENT RECORDS
${JSON.stringify(compact,null,2)}

Secondary cross-checks only: ${secondaries}.`;
}
function openSearches(){
  const rows=researchRows().slice(0,10); if(!rows.length){alert('Select at least one state or choose another research scope first.');return;}
  rows.forEach((r,i)=>setTimeout(()=>{let host=''; try{host=new URL(r.source_url).hostname.replace(/^www\./,'');}catch{} const q=`${r.state} remote seller economic nexus sales tax threshold collection filing update ${new Date().getFullYear()} ${host?`site:${host}`:''}`; window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank','noopener,noreferrer');},i*140));
  const total=researchRows().length; if(total>10) alert('Opened searches for the first 10 jurisdictions to avoid browser popup limits. Use Selected states (up to 10) for controlled review batches.');
}

function stagePatch(){
  const out=document.getElementById('patchStatus');
  try{
    const p=JSON.parse(document.getElementById('jsonPatch').value); if(!Array.isArray(p)) throw new Error('JSON must be an array');
    let staged=0; const missing=[];
    p.forEach(u=>{
      const r=data.find(x=>x.state===u.state); if(!r){missing.push(u.state||'(missing state)'); return;}
      const changes={}; Object.entries(u).forEach(([k,v])=>{if(!allowedPatchKeys.has(k)||v===undefined)return;if(numericPatchKeys.has(k)){changes[k]=(v===null||v==='')?null:Number(v);if(changes[k]!==null&&!Number.isFinite(changes[k]))delete changes[k];}else changes[k]=(v===null?'N/A':String(v));});
      if(!changes.last_reviewed) changes.last_reviewed=todayISO();
      const diffs=Object.entries(changes).filter(([k,v])=>String(r[k]??'')!==String(v??'')).map(([k,v])=>({field:k,old:String(r[k]??''),new:String(v??'')}));
      if(!diffs.length) return;
      const inferredMaterial=diffs.some(d=>MATERIAL_CHANGE_KEYS.has(d.field));
      const proposal={id:`${r.state}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,state:r.state,changes,diffs,material_change:flagTrue(u.change_detected)||inferredMaterial,change_note:String(u.change_note||'').trim(),staged_at:new Date().toISOString()};
      proposals=proposals.filter(x=>x.state!==r.state); proposals.push(proposal); staged++;
    });
    persistProposals(); buildHeader(); renderProposals(); render(); out.textContent=`Staged ${staged} proposal(s)${missing.length?`; unmatched: ${missing.join(', ')}`:''}. Review before approval.`;
  }catch(e){out.textContent=`Could not stage: ${e.message}`;}
}
function renderProposals(){
  const area=document.getElementById('proposalArea'), list=document.getElementById('proposalList'); document.getElementById('proposalCount').textContent=String(proposals.length);
  if(!proposals.length){area.classList.add('hidden'); list.innerHTML=''; return;}
  area.classList.remove('hidden'); list.innerHTML='';
  proposals.sort((a,b)=>a.state.localeCompare(b.state)).forEach(p=>{
    const card=document.createElement('article'); card.className=`proposal${p.material_change?' material-change':''}`; const source=p.changes.source_url || data.find(r=>r.state===p.state)?.source_url || '';
    card.innerHTML=`<div class="proposal-head"><h4>${p.material_change?'🚨 ':''}${esc(p.state)}</h4><div class="toolbar-row compact"><button class="primary" data-approve="${esc(p.id)}">Approve</button><button data-reject="${esc(p.id)}">Reject</button></div></div>${p.material_change?`<div class="proposal-alert">Material requirement change detected. ${esc(p.change_note || 'Verify the cited authority and update this jurisdiction before publishing.')}</div>`:''}<table class="diff-table"><thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead><tbody>${p.diffs.map(d=>`<tr><td>${esc(d.field)}</td><td class="old">${esc(d.old)}</td><td class="new">${esc(d.new)}</td></tr>`).join('')}</tbody></table>${source?`<div class="source"><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Open cited source</a></div>`:''}`;
    list.appendChild(card);
  });
  list.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>approveProposal(b.dataset.approve)));
  list.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>rejectProposal(b.dataset.reject)));
}
function approveProposal(id,rerender=true){
  const p=proposals.find(x=>x.id===id); if(!p) return; const r=data.find(x=>x.state===p.state); if(!r) return;
  Object.entries(p.changes).forEach(([k,v])=>{if(allowedPatchKeys.has(k)) r[k]=v;}); delete r.change_detected; delete r.change_note;
  localHistory.push({date:todayISO(),type:'approved_update',state:r.state,fields_changed:p.diffs.map(d=>d.field),material_change:!!p.material_change,summary:p.material_change?`Approved staged material research update. ${p.change_note||''}`.trim():'Approved staged research update in browser working copy.',source_url:r.source_url||''});
  proposals=proposals.filter(x=>x.id!==id); persistWorking(); persistProposals(); persistHistory();
  if(rerender){buildHeader(); renderProposals(); render();}
}
function rejectProposal(id){proposals=proposals.filter(x=>x.id!==id); persistProposals(); buildHeader(); renderProposals(); render();}
function approveAll(){[...proposals].forEach(p=>approveProposal(p.id,false)); buildHeader(); renderProposals(); render();}

function markReviewed(){
  const rows=visibleRows(); const d=todayISO(); rows.forEach(r=>r.last_reviewed=d);
  localHistory.push({date:d,type:'review_confirmation',jurisdictions:rows.length,summary:'Visible jurisdictions marked reviewed; no automatic rule change was made.'}); persistWorking(); persistHistory(); buildHeader(); render();
}
function resetWorking(){
  if(!confirm('Discard browser working-copy edits, staged proposals, and local update history and reload the published GitHub dataset?')) return;
  [LS_WORKING,LS_PROPOSALS,LS_HISTORY].forEach(k=>localStorage.removeItem(k)); data=clone(baselineStates); proposals=[]; localHistory=[]; clearFilters(); renderProposals(); renderStatePicker(); render();
}
function downloadBlob(name,content,type='application/json'){
  const blob=new Blob([content],{type}),a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);
}
function downloadDataset(){const exported={...meta,app_version:APP_VERSION,last_full_review:minReviewedDate(data)||meta.last_full_review,generated_at:todayISO(),states:data}; downloadBlob('state-nexus.json',JSON.stringify(exported,null,2)+'\n');}
function downloadHistory(){const entries=[...(baseHistory.entries||[]),...localHistory]; downloadBlob('update-history.json',JSON.stringify({schema_version:1,entries},null,2)+'\n');}

// Dependency-free XLSX writer using ZIP store + Open XML.
const crcTable=(()=>{let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function u16(n){return [n&255,(n>>>8)&255]} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function zipStore(files){
  const enc=new TextEncoder(),chunks=[],central=[]; let offset=0;
  for(const f of files){const name=enc.encode(f.name),body=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(body); const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...name]); chunks.push(local,body); const cen=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]); central.push(cen); offset+=local.length+body.length;}
  const csize=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(csize),...u32(offset),...u16(0)]); const total=[...chunks,...central,end],len=total.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);let p=0;for(const c of total){out.set(c,p);p+=c.length;}return out;
}
function xmlEsc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function colName(n){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function exportXlsx(rows=visibleRows(),filenameSuffix='filtered'){
  const exportCols=columns.filter(([k])=>!k.startsWith('_'));
  const matrix=[exportCols.map(c=>c[1]),...rows.map(r=>exportCols.map(([k])=>computedValue(r,k)))]; let sheetRows='';
  matrix.forEach((row,ri)=>{let cells='';row.forEach((v,ci)=>{const ref=colName(ci+1)+(ri+1);cells+=`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;});sheetRows+=`<row r="${ri+1}">${cells}</row>`;});
  const widths=exportCols.map(([k,label])=>Math.min(60,Math.max(12,label.length+2,['nexus_sales_scope','sales_basis','collection_timing','notes','marketplace_note'].includes(k)?40:18))); const colsXml=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
  const worksheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${colsXml}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${colName(exportCols.length)}${matrix.length}"/></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nexus Requirements" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},{name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},{name:'xl/workbook.xml',data:workbook},{name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},{name:'xl/styles.xml',data:styles},{name:'xl/worksheets/sheet1.xml',data:worksheet}];
  const blob=new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`state_sales_tax_nexus_${filenameSuffix}_${todayISO()}.xlsx`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);
}

function bindEvents(){
  document.getElementById('themeToggle').addEventListener('click',toggleTheme);
  document.getElementById('measurementMethodFilter').addEventListener('change',renderMeasurementReference);
  document.getElementById('measurementReferenceDate').addEventListener('change',renderMeasurementReference);
  document.getElementById('measurementSort').addEventListener('change',renderMeasurementReference);
  document.getElementById('measurementSearch').addEventListener('input',renderMeasurementReference);
  document.getElementById('clearMeasurementFilters').addEventListener('click',clearMeasurementFilters);
  document.getElementById('globalSearch').addEventListener('input',render);
  document.getElementById('dollarThresholdOnly').addEventListener('change',e=>{dollarThresholdOnly=e.target.checked;render();});
  document.getElementById('clearFilters').addEventListener('click',clearFilters);
  document.getElementById('markReviewed').addEventListener('click',markReviewed);
  document.getElementById('exportExcel').addEventListener('click',()=>exportXlsx(visibleRows(),'filtered'));
  document.getElementById('exportAllExcel').addEventListener('click',()=>exportXlsx(data,'all_states'));
  document.getElementById('downloadDataset').addEventListener('click',downloadDataset);
  document.getElementById('resetWorkingCopy').addEventListener('click',resetWorking);
  document.getElementById('updateScope').addEventListener('change',updateResearchScopeUI);
  document.getElementById('statePickerToggle').addEventListener('click',toggleStatePicker);
  document.getElementById('statePickerSearch').addEventListener('input',renderStatePicker);
  document.getElementById('clearStateSelection').addEventListener('click',()=>{selectedResearchStates.clear();persistResearchStates();renderStatePicker();});
  document.getElementById('buildPrompt').addEventListener('click',buildUpdatePrompt);
  document.getElementById('copyPrompt').addEventListener('click',async()=>{if(!document.getElementById('updatePrompt').value)buildUpdatePrompt();try{await navigator.clipboard.writeText(document.getElementById('updatePrompt').value);}catch{document.getElementById('updatePrompt').select();document.execCommand('copy');}});
  document.getElementById('clearPrompt').addEventListener('click',()=>{const prompt=document.getElementById('updatePrompt');prompt.value='';prompt.focus();});
  document.getElementById('openSearch').addEventListener('click',openSearches);
  document.getElementById('stagePatch').addEventListener('click',stagePatch);
  document.getElementById('clearProposals').addEventListener('click',()=>{if(confirm('Clear all staged proposals?')){proposals=[];persistProposals();buildHeader();renderProposals();render();}});
  document.getElementById('approveAll').addEventListener('click',approveAll);
  document.getElementById('downloadHistory').addEventListener('click',downloadHistory);
  document.getElementById('analyzeTransactions').addEventListener('click',importAndAnalyze);
  document.getElementById('clearTransactionAnalysis').addEventListener('click',clearTransactionAnalysis);
  document.getElementById('exportTransactionAnalysis').addEventListener('click',exportTransactionAnalysis);
  document.getElementById('downloadNormalizedCsv').addEventListener('click',downloadNormalizedTransactionsCsv);
  document.getElementById('analysisResultFilter').addEventListener('change',renderAnalysisTable);
  document.getElementById('analysisAsOf').addEventListener('change',()=>{if(normalizedDocuments.length)runTransactionAnalysis();});
  document.getElementById('coverageStart').addEventListener('change',e=>{e.target.dataset.auto='false';if(normalizedDocuments.length)runTransactionAnalysis();});
  document.getElementById('coverageEnd').addEventListener('change',e=>{e.target.dataset.auto='false';if(normalizedDocuments.length)runTransactionAnalysis();});
  document.getElementById('watchPercent').addEventListener('change',()=>{if(normalizedDocuments.length)runTransactionAnalysis();});
  document.getElementById('saveEdit').addEventListener('click',saveEdit);
}

document.addEventListener('DOMContentLoaded',init);
