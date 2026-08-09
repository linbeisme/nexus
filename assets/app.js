'use strict';

const DATA_URL = './data/state-nexus.json';
const HISTORY_URL = './updates/update-history.json';
const APP_VERSION = '1.1';
const LS_WORKING = 'salesTaxNexusWorkingV4';
const LS_PROPOSALS = 'salesTaxNexusProposalsV4';
const LS_HISTORY = 'salesTaxNexusHistoryV4';
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
const MATERIAL_CHANGE_KEYS = new Set(['status','threshold','transaction_test','measurement_period','nexus_sales_scope','sales_basis','collection_timing','marketplace_note','rule_effective_date','latest_change_date']);
const editableKeys = ['status','threshold','transaction_test','measurement_period','nexus_sales_scope','sales_basis','collection_timing','marketplace_note','rule_effective_date','latest_change_date','last_reviewed','source_title','source_url','notes'];
const allowedPatchKeys = new Set(editableKeys);
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
function materialAlertStates(){return data.filter(r=>stateHasMaterialAlert(r.state)).map(r=>r.state);}

async function loadJson(url){const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`); return res.json();}
function loadLocal(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)); return x ?? fallback;}catch{return fallback;}}
function persistWorking(){localStorage.setItem(LS_WORKING,JSON.stringify({schema_version:meta.schema_version,source_last_full_review:meta.last_full_review,states:data}));}
function persistProposals(){localStorage.setItem(LS_PROPOSALS,JSON.stringify(proposals));}
function persistHistory(){localStorage.setItem(LS_HISTORY,JSON.stringify(localHistory));}
function persistResearchStates(){localStorage.setItem(LS_RESEARCH_STATES,JSON.stringify([...selectedResearchStates]));}

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
    buildHeader(); bindEvents(); renderStatePicker(); updateResearchScopeUI(); render(); renderProposals(); renderMeta(); setupTableScrollSync();
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
  const width=Math.min(360,Math.max(260,window.innerWidth-24));
  let left=Math.max(12,r.left);
  if(left+width>window.innerWidth-12) left=Math.max(12,window.innerWidth-width-12);
  let top=r.bottom+5;
  const estimated=Math.min(380,window.innerHeight-24);
  if(top+estimated>window.innerHeight-12 && r.top>estimated+12) top=Math.max(12,r.top-estimated-5);
  menu.style.width=`${width}px`; menu.style.left=`${left}px`; menu.style.top=`${Math.max(12,top)}px`;
}
function buildMultiFilter(key){
  const details=document.createElement('details'); details.className='multi-filter'; details.dataset.key=key;
  const summary=document.createElement('summary'); summary.textContent=multiSummary(key); details.appendChild(summary);
  const menu=document.createElement('div'); menu.className='multi-filter-menu';
  const search=document.createElement('input'); search.type='search'; search.placeholder='Find criteria…'; search.setAttribute('aria-label',`Search ${key} filter options`); menu.appendChild(search);
  const opts=document.createElement('div'); opts.className='multi-filter-options';
  filterOptions(key).forEach(value=>{
    const label=document.createElement('label'); label.className='multi-option'; label.dataset.search=value.toLowerCase();
    const cb=document.createElement('input'); cb.type='checkbox'; cb.value=value; cb.checked=(filters[key]||[]).includes(value);
    cb.addEventListener('change',()=>{
      const s=new Set(filters[key]||[]); if(cb.checked)s.add(value); else s.delete(value); filters[key]=[...s]; summary.textContent=multiSummary(key); render();
    });
    const span=document.createElement('span'); span.textContent=value; label.append(cb,span); opts.appendChild(label);
  });
  menu.appendChild(opts);
  const actions=document.createElement('div'); actions.className='multi-filter-actions';
  const clear=document.createElement('button'); clear.type='button'; clear.textContent='Clear'; clear.addEventListener('click',()=>{filters[key]=[]; opts.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false); summary.textContent='All'; render();}); actions.appendChild(clear); menu.appendChild(actions);
  search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase(); opts.querySelectorAll('.multi-option').forEach(el=>el.classList.toggle('hidden',!!q&&!el.dataset.search.includes(q)));});
  details.addEventListener('toggle',()=>{
    if(details.open){
      document.querySelectorAll('.multi-filter[open]').forEach(other=>{if(other!==details)other.removeAttribute('open');});
      requestAnimationFrame(()=>positionMultiFilterMenu(details,menu));
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
  const sales=data.filter(x=>!x.status.includes('No statewide') && !x.status.includes('Local sales')).length;
  const noTax=data.filter(x=>x.status.includes('No statewide')).length;
  const dollarOnly=data.filter(isDollarThresholdOnly).length;
  const alerts=materialAlertStates().length;
  document.getElementById('stats').innerHTML=`<span class="chip">Showing ${rows.length} of ${data.length}</span><span class="chip">Dollar-threshold-only: ${dollarOnly}</span><span class="chip">Sales-tax / equivalent: ${sales}</span><span class="chip">No statewide sales tax: ${noTax}</span>${alerts?`<span class="chip alert-chip">🚨 ${alerts} update${alerts===1?'':'s'} required</span>`:''}`;
  renderMeta(); requestAnimationFrame(syncTableScrollWidth);
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
  const compact=scope.map(r=>({state:r.state,status:r.status,current_threshold:r.threshold,transaction_test:r.transaction_test,measurement_period:r.measurement_period,nexus_sales_scope:r.nexus_sales_scope,sales_basis:r.sales_basis,collection_timing:r.collection_timing,marketplace_note:r.marketplace_note,latest_material_change:r.latest_change_date,last_reviewed:r.last_reviewed,primary_source:r.source_url}));
  const secondaries=(meta.secondary_sources||[]).map(s=>s.url).join(' and ');
  out.value=`Act as a senior U.S. state-and-local-tax researcher supporting a CPA. Check for changes to remote-seller sales/use tax economic nexus and seller collection/remittance requirements since the later of each jurisdiction's latest_material_change or last_reviewed date.\n\nRESEARCH STANDARD\n- Use primary authority first: enacted statutes/bills, regulations, official revenue-department notices, FAQs, and tax-agency pages.\n- Verify the dollar threshold, transaction-count test, measurement period, nexus threshold sales scope (gross/all vs retail-only vs taxable-only), which sales count, registration/collection timing, marketplace-facilitator interaction, and any enacted future change.\n- Distinguish a rule's effective date from the date an agency webpage was reviewed or updated.\n- Validate that each proposed source_url resolves to a current official state or state-authorized source.\n- Set change_detected=true ONLY when a material collection, filing, threshold, sales-base, timing, or marketplace requirement changed since the stored record. Include a short change_note. Otherwise set change_detected=false.\n- If there is no material change, preserve the existing rule text and set last_reviewed to today's date.\n\nOUTPUT\nReturn ONLY a JSON array, one object per jurisdiction reviewed. Use keys: state, status, threshold, transaction_test, measurement_period, nexus_sales_scope, sales_basis, collection_timing, marketplace_note, rule_effective_date, latest_change_date, last_reviewed, source_title, source_url, notes, change_detected, change_note. Existing wording may be preserved when verified and unchanged.\n\nCURRENT RECORDS\n${JSON.stringify(compact,null,2)}\n\nSecondary cross-checks only: ${secondaries}.`;
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
      const changes={}; Object.entries(u).forEach(([k,v])=>{if(allowedPatchKeys.has(k)&&v!==undefined&&v!==null) changes[k]=String(v);});
      if(!changes.last_reviewed) changes.last_reviewed=todayISO();
      const diffs=Object.entries(changes).filter(([k,v])=>String(r[k]??'')!==String(v)).map(([k,v])=>({field:k,old:String(r[k]??''),new:String(v)}));
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
  document.getElementById('openSearch').addEventListener('click',openSearches);
  document.getElementById('stagePatch').addEventListener('click',stagePatch);
  document.getElementById('clearProposals').addEventListener('click',()=>{if(confirm('Clear all staged proposals?')){proposals=[];persistProposals();buildHeader();renderProposals();render();}});
  document.getElementById('approveAll').addEventListener('click',approveAll);
  document.getElementById('downloadHistory').addEventListener('click',downloadHistory);
  document.getElementById('saveEdit').addEventListener('click',saveEdit);
}

document.addEventListener('DOMContentLoaded',init);
