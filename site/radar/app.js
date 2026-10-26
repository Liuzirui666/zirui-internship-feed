import { withinScope, companyCategory, matchesTrack, upgradeJob, postingFreshness, isCurrentOpportunity } from './matching.mjs?v=freshness-v4';
import { createFeedClient } from './feed-client.js?v=progress-v2';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeLink = value => { try { const u = new URL(value); return u.protocol === 'https:' ? escape(u.href) : '#'; } catch { return '#'; } };
const STORE = 'zirui-internship-radar:v1';
import { STAGES, stageOf, validateRecords, emptyRecord, updateRecord, mergeRecords, trackedJobs, hasApplied, activeInterview, finished } from './tracker-state.mjs';
const topicClasses = { 'AI Security': 'security', 'AI Safety': 'safety', 'LLM Security': 'security', 'Agentic Systems': 'multimodal', 'Reinforcement Learning': 'audio', 'Software Security': 'privacy' };
const companyGroups = { 1: 'Big Tech', 2: 'Major AI companies', 3: 'Specialist teams', 4:'Startups & specialist labs' };
const initials = { google: 'G', apple: 'a', microsoft: 'M', amazon: 'a', nvidia: 'N', meta: '∞', openai: 'O', anthropic: 'A', xai: '𝕏', adobe: 'A', dolby: 'D', elevenlabs: 'Ⅱ', scale: 'S' };
let data = null, records = {}, view = new URLSearchParams(location.search).get('view')==='progress'?'applied':'all', topic = '', roleType = 'Internship', shown = 40, toastTimer, focusedJob = null;
let lastCheckedAt = null, feedMode = 'live', feedError = false, checking = false;
const feed = createFeedClient(document.documentElement.dataset.feedBase ? { base:document.documentElement.dataset.feedBase, manifestPath:'manifest.json', feedPath:'data.json' } : {});
let storageAvailable = true;
try { records=validateRecords(JSON.parse(localStorage.getItem(STORE)||'{}')); } catch { storageAvailable=false;try{records=validateRecords(JSON.parse(localStorage.getItem(STORE+':backup')||'{}'));}catch{} }
const record = id => records[id] || emptyRecord();
const allJobs = () => trackedJobs(data?.jobs || [], records);
const isNew = job => isCurrentOpportunity(job) && Date.now() - Date.parse(job.firstSeen) < 86400000;
const dateLabel = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not provided';
const timeLabel = value => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Not yet verified';
const degreeLabel = job => job.degree?.label || '学历未明确说明';
const payLabel = job => job.compensation?.label || '薪资未公开';
const tags = job => job.topics.map(t => `<span class="tag ${topicClasses[t] || ''}">${escape(t)}</span>`).join('');

function toast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function persist() {
  try {
    const old = localStorage.getItem(STORE);
    let previous={};
    if(old){try{previous=validateRecords(JSON.parse(old));localStorage.setItem(STORE+':backup',old);}catch{localStorage.setItem(STORE+':recovery',old);}}
    records = mergeRecords(previous, records);
    localStorage.setItem(STORE, JSON.stringify(records)); storageAvailable = true;
    const label = $('#tracker-save-state'); if (label) label.textContent = '已自动保存到此浏览器 · ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
  } catch { storageAvailable = false; toast('浏览器暂时无法保存。请立即导出备份，保留本次修改。'); }
}
function localDay() { const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function save(id) {
  const r=record(id), saved=!r.saved;
  records[id]=updateRecord(records[id], {saved}, allJobs().find(j=>j.id===id));
  persist(); render(); toast(saved?'已加入收藏。':'已取消收藏，申请记录仍保留。');
}
function setStatus(id,status) {
  if(!STAGES.some(s=>s.id===status))return;
  const old=record(id), patch={status};
  if(!hasApplied(old)&&hasApplied({...old,status})&&!old.appliedAt)patch.appliedAt=localDay();
  records[id]=updateRecord(records[id],patch,allJobs().find(j=>j.id===id));
  persist();render();toast('已记录：'+stageOf(status).label);
}
function statusOptions(id) { return STAGES.map(s=>`<option value="${s.id}"${record(id).status===s.id?' selected':''}>${s.label}</option>`).join(''); }
function filtersActive() { return topic || roleType || $('#application-filter').value || $('#search').value || $('#company').value || $('#company-group').value || ['remote', 'new', 'include-archived'].some(id => $(`#${id}`).checked); }
function updateCompanies() {
  const chosen = $('#company').value, group = $('#company-group').value;
  const sources = data.sources.filter(s => !group || s.tier === Number(group));
  $('#company').innerHTML = '<option value="">All companies</option>' + Object.entries(companyGroups).map(([tier, label]) => {
    const members = sources.filter(s => s.tier === Number(tier));
    return members.length ? `<optgroup label="${label}">${members.map(s => `<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  $('#company').value = sources.some(s => s.id === chosen) ? chosen : '';
}
function filteredJobs(ignoreType = false) {
  if (!data) return [];
  const terms = $('#search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const jobs = (view==='saved'?allJobs():data.jobs).filter(job => {
    const r = record(job.id);
    if (view === 'saved' && !r.saved) return false;
    if (view === 'applied' && !hasApplied(r)) return false;
    const progress=$('#application-filter').value;
    if(progress==='not_applied'&&hasApplied(r)||progress==='applied'&&!hasApplied(r)||progress==='interview'&&!activeInterview(r)||progress==='closed'&&!finished(r))return false;
    if (view === 'all' && !$('#include-archived').checked && !isCurrentOpportunity(job)) return false;
    if (topic && !job.topics.includes(topic)) return false;
    if (job.type !== 'Internship') return false;
    if (!ignoreType && !matchesTrack(job, roleType)) return false;
    if ($('#us').checked && !job.us) return false;
    if ($('#company').value && job.sourceId !== $('#company').value) return false;
    if ($('#company-group').value && job.tier !== Number($('#company-group').value)) return false;
    if (!withinScope(job)) return false;
    if ($('#remote').checked && !job.remote) return false;
    if ($('#new').checked && !isNew(job)) return false;
    const searchable = `${job.title} ${job.company} ${job.location} ${job.department} ${job.topics.join(' ')} ${job.excerpt} ${job.evidence.map(e => e.excerpt).join(' ')}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  });
  const sort = $('#sort').value;
  jobs.sort((a, b) => {
    if (sort === 'priority') return b.priorityScore - a.priorityScore || b.score - a.score || (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0) || a.title.localeCompare(b.title);
    if (sort === 'match') return b.score - a.score || a.tier - b.tier;
    const key = sort === 'newest' ? 'postedAt' : 'firstSeen';
    return (Date.parse(b[key]) || 0) - (Date.parse(a[key]) || 0) || a.tier - b.tier;
  });
  return jobs;
}

function setRoleType(type) { roleType = type; shown = 40; render(); }
function updateRoleTabs() {
  const jobs = filteredJobs(true);
  document.querySelectorAll('[data-type]').forEach(button => {
    const selected = button.dataset.type === roleType;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.querySelector('span').textContent = (button.dataset.type ? jobs.filter(j => matchesTrack(j, button.dataset.type)).length : jobs.length).toLocaleString();
    if (selected) $('#role-results').setAttribute('aria-labelledby', button.id);
  });
}
function jobCard(job) {
  const r = record(job.id), id = escape(job.id);
  const type = job.type === 'Unspecified' ? 'Type not specified' : job.type;
  return `<article class="job-card" data-id="${id}">
    <div class="company-logo ${escape(job.sourceId)}" aria-hidden="true">${escape(initials[job.sourceId] || job.company.slice(0, 1))}</div>
    <div class="job-content"><div class="job-company">${escape(job.company)} <span class="priority-badge">${companyCategory(job)==='big'?'大厂':'小厂 · 公开薪资达标'}</span> ${isNew(job) ? '<span class="new-badge" title="首次收录到雷达，不代表新发布">首次收录</span>' : ''}</div>
      <button class="job-title" data-action="details">${escape(job.title)}</button>
      <div class="job-meta"><span class="place" title="${escape(job.location)}">${escape(job.location)}</span><span>${escape(type)}</span><span>${job.postedAt ? `原始发布 ${dateLabel(job.postedAt)}` : '原始发布日期未提供'}</span><span>官网收录核验 ${dateLabel(job.lastSeen)}</span></div>
      <div class="job-tags">${tags(job)}<span class="tag internship" title="${escape(job.degree?.evidence||'')}">${escape(degreeLabel(job))}</span><span class="tag compensation">${escape(payLabel(job))}</span>${!isCurrentOpportunity(job) ? `<span class="tag warning">${escape(postingFreshness(job).label)}</span>` : ''}${job.type === 'Internship' ? '<span class="tag internship">Internship</span>' : ''}${job.status !== 'open' ? `<span class="tag warning">${job.status === 'not-listed' ? 'Not in latest scan' : 'Needs verification'}</span>` : ''}</div>
    </div><div class="job-actions"><div class="action-line"><button class="save" data-action="save" aria-label="${r.saved ? 'Unsave' : 'Save'} ${escape(job.title)}" aria-pressed="${r.saved}">${r.saved ? '♥' : '♡'}</button><a class="apply" href="${safeLink(job.applyUrl)}" target="_blank" rel="noopener noreferrer">View &amp; apply</a></div><select class="status-select" data-action="status" aria-label="Application status for ${escape(job.title)}">${statusOptions(job.id)}</select><button class="tracker-open" data-action="track">记录进展 ↗</button></div>
  </article>`;
}
function updateStats() {
  const open = data.jobs.filter(j => j.type === 'Internship' && withinScope(j) && isCurrentOpportunity(j) && (!$('#us').checked || j.us));
  $('#stat-total').textContent = open.length.toLocaleString();
  $('#stat-bigtech').textContent = open.filter(j => j.research?.isResearch).length.toLocaleString();
  $('#stat-internships').textContent = open.filter(j => j.type === 'Internship').length;
  $('#stat-new').textContent = open.filter(isNew).length.toLocaleString();
  $('#nav-all').textContent = open.length;
  $('#nav-saved').textContent = allJobs().filter(j => record(j.id).saved).length;
  $('#nav-applied').textContent = Object.values(records).filter(hasApplied).length;
  $('#nav-sources').textContent = data.sources.length;
  const ageMinutes = (Date.now() - Date.parse(data.updatedAt)) / 60000;
  $('#sync-label').textContent = feedError ? 'Connection interrupted · retrying' : `Auto-updating · checked ${lastCheckedAt ? new Date(lastCheckedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'just now'}`;
  $('#sync-meta').textContent = `Collected ${ageMinutes < 60 ? `${Math.max(0, Math.floor(ageMinutes))}m` : `${Math.floor(ageMinutes / 60)}h`} ago · background every 5m · page checks 30s`;
  $('#sync-meta').title = timeLabel(data.updatedAt);
  const incomplete = data.sources.filter(s => s.status !== 'ok');
  const note = [];
  if (ageMinutes > 120) note.push(`Last collected ${timeLabel(data.updatedAt)}; the next scheduled run may be delayed.`);
  if (feedError) note.push('Could not check for updates. Keeping current results and retrying automatically.');
  else if (feedMode === 'backup') note.push('Showing the backup feed while reconnecting to the latest collection.');
  if (incomplete.length) note.push(`${incomplete.length} sources have limited or manual coverage. Open Sources to check before relying on the counts.`);
  if (!storageAvailable) note.push('Local storage is unavailable; export your tracker to retain changes.');
  $('#notice').textContent = note.join(' '); $('#notice').hidden = !note.length;
}
function renderSources() {
  const labels = { ok: 'Collected', partial: 'Partial', error: 'Unavailable', manual: 'Manual check' };
  $('#source-panel').innerHTML = `<p class="source-intro">${data.sources.filter(s => s.status === 'ok').length} of ${data.sources.length} sources collected successfully. All ${data.sources.length} official source channels are collected by the cloud updater on a five-minute schedule, including when this page is closed. This page checks the small feed manifest every thirty seconds and downloads changed data automatically. Scheduler delays and source limits may delay complete results. A source error preserves earlier listings; it does not mean those roles closed. Research roles rank before engineering. Education is separate: postings that only mention bachelor’s/master’s degrees are excluded from opportunities. PhD-required, PhD-preferred, mixed-degree and unspecified postings remain; an unspecified requirement is not a guarantee of eligibility. All internships satisfy the same inclusion rules. Research and Engineering may overlap; their deduplicated union is All. Big and Small companies are independent subsets. Small-company roles require an employer-published USD base-pay lower bound of $60/hour or $10,000/month; undisclosed pay is excluded. No annual-to-hourly conversion is used. The default view is US only, with an option to include other locations. Default results exclude ended internship cohorts, standing adverts older than 180 days without a current/future cohort, talent pools and unverified availability. Original publication and the latest official-board check are distinct dates. Employer search results can miss roles, so these counts do not represent every available job.</p><div class="source-grid">${data.sources.map(s => `<article class="source-card"><header><h2>${escape(s.name)}</h2><span class="source-status ${escape(s.status)}">${labels[s.status] || 'Unknown'}</span></header><p>${s.status === 'manual' ? 'Open the official board to search current US opportunities.' : `${data.jobs.filter(j => j.sourceId === s.id && isCurrentOpportunity(j) && j.type === 'Internship' && withinScope(j) && j.research?.isResearch).length} research internships for PhD consideration · ${data.jobs.filter(j=>j.sourceId===s.id&&j.us&&withinScope(j)&&isCurrentOpportunity(j)).length} matching US roles · ${s.scanned || 0} listings checked`}${s.note ? `<br>${escape(s.note)}` : ''}</p><a href="${safeLink(s.url)}" target="_blank" rel="noopener noreferrer">Open official careers</a><small>Checked: ${timeLabel(s.checkedAt)}<br>Last complete collection: ${timeLabel(s.lastSuccess)}</small></article>`).join('')}</div>`;
}
function render() {
  if (!data && view!=='applied') return;
  if(data)updateStats();
  const sourceView = view === 'sources', trackerView=view==='applied';
  $('#opportunities').hidden=sourceView||trackerView; $('#source-panel').hidden=!sourceView; $('#tracker-panel').hidden=!trackerView;
  $('.stats').hidden=trackerView; $('.zirui-profile').hidden=trackerView;
  $('.location-pill').hidden=trackerView;
  if(trackerView&&storageAvailable)$('#notice').hidden=true;
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); });
  const titles = { all: [roleType === 'Internship' ? 'Find your next PhD research internship.' : 'Find your next research internship.', 'Only internships in LLM security, agentic systems, RL and software security. US PhD research first.'], saved: ['Your research shortlist.', 'Saved opportunities, ready for a closer look.'], applied: ['申请进展', '未投、已投、面试轮次与最终结果。保存后持续保留，职位更新不会覆盖。'], sources: ['Know what’s being monitored.', 'Official sources, collection status and honest coverage.'] };
  $('#page-title').textContent = titles[view][0]; $('#page-description').textContent = titles[view][1];
  if (sourceView) { renderSources(); return; }
  if(trackerView){renderTracker();return;}
  updateRoleTabs();
  const jobs = filteredJobs();
  $('#results-count').textContent = `${jobs.length.toLocaleString()} ${view === 'all' ? 'opportunities' : view === 'saved' ? 'saved roles' : 'applications'}`;
  $('#reset').hidden = !filtersActive();
  $('#job-list').innerHTML = jobs.length ? jobs.slice(0, shown).map(jobCard).join('') : `<div class="empty"><h2>${view === 'saved' && !filtersActive() ? 'A shortlist starts with one role.' : view === 'applied' && !filtersActive() ? 'Your next chapter starts here.' : 'No matching opportunities.'}</h2><p>${view === 'all' || filtersActive() ? 'Try another topic, company or role type. Source coverage may also be limited.' : view === 'saved' ? 'Use the heart on an opportunity to save it here.' : 'After applying on an employer’s website, mark the role as Applied.'}</p><button id="empty-reset">${filtersActive() ? 'Clear filters' : 'Browse opportunities'}</button></div>`;
  $('#load-more').hidden = jobs.length <= shown;
  $('#load-more').textContent = `Show ${Math.min(40, jobs.length - shown)} more opportunities`;
}
function resetFilters() {
  topic = ''; roleType = 'Internship'; shown = 40;
  ['search', 'company', 'company-group', 'application-filter'].forEach(id => { $(`#${id}`).value = ''; });
  if (data) updateCompanies();
  ['remote', 'new', 'include-archived'].forEach(id => { $(`#${id}`).checked = false; });
  document.querySelectorAll('[data-topic]').forEach(b => { b.classList.toggle('selected', !b.dataset.topic); b.setAttribute('aria-pressed', String(!b.dataset.topic)); });
  render();
}
function setView(next) { view=next;shown=40;if(next==='all')roleType='Internship';const u=new URL(location.href);if(next==='applied')u.searchParams.set('view','progress');else u.searchParams.delete('view');history.replaceState(null,'',u);render(); }
function details(id) {
  const job = allJobs().find(j => j.id === id); if (!job) return;
  focusedJob = id;
  $('#detail-content').innerHTML = `<div class="detail"><div class="detail-top"><span>${escape(job.company)}</span><button id="close-details" aria-label="Close role details">×</button></div><h2>${escape(job.title)}</h2><p>${escape(job.location)}</p><div class="job-tags">${tags(job)}</div><h3>学历要求 · 官方原文</h3><div class="evidence"><strong>${escape(degreeLabel(job))}</strong>${escape(job.degree?.evidence||'No explicit education requirement provided.')}</div><h3>薪资 · 官方披露</h3><div class="evidence"><strong>${escape(payLabel(job))}</strong>${escape(job.compensation?.evidence||'No published salary available.')}</div><h3>Why this role is here</h3>${job.evidence.map(e => `<div class="evidence"><strong>${escape(e.topic)} · ${escape(e.term)}</strong>…${escape(e.excerpt)}…</div>`).join('')}<button class="tracker-open prominent" data-track-id="${escape(job.id)}">记录投递 / 面试进展 ↗</button><h3>Posting details</h3><dl><dt>Role type</dt><dd>${job.type === 'Unspecified' ? 'Not specified by the source — confirm on the posting' : escape(job.type)}</dd><dt>原始发布日期</dt><dd>${dateLabel(job.postedAt)}</dd><dt>首次被雷达收录</dt><dd>${timeLabel(job.firstSeen)}</dd><dt>最近官网收录核验</dt><dd>${timeLabel(job.lastSeen)}</dd><dt>当期推荐</dt><dd>${escape(postingFreshness(job).label)}</dd><dt>Availability</dt><dd>${job.pipeline ? 'Talent pool only; employer does not advertise a specific opening' : job.status === 'open' ? 'Listed at last collection' : job.status === 'not-listed' ? 'Not present in the latest complete scan; verify with employer' : 'Source unavailable; verify with employer'}</dd></dl><div class="detail-footer"><a class="apply" href="${safeLink(job.applyUrl)}" target="_blank" rel="noopener noreferrer">View &amp; apply on official site</a><a href="${safeLink(job.url)}" target="_blank" rel="noopener noreferrer">Original posting</a></div><p class="local-note">Opening the application does not mark it as submitted. Update your status after you apply.</p></div>`;
  $('#details').showModal(); $('#close-details').focus();
}
async function loadFeed(showToast = false) {
  if (checking) return;
  checking = true;
  $('#refresh').disabled = true;
  try {
    const result = await feed.poll();
    lastCheckedAt = result.checkedAt; feedMode = result.mode; feedError = false;
    if (result.snapshot) {
      const oldIDs = data ? new Set(data.jobs.map(j => j.id)) : null;
      data = {...result.snapshot,jobs:result.snapshot.jobs.map(upgradeJob)};
      $('#source-total-note').textContent=`全部 ${data.sources.length} 个官方来源由 GitHub 自动采集。全部岗位使用同样的方向、学历规则；小厂还须公开薪资下限达到 $60/h 或 $10,000/月；默认排除旧挂岗、已结束批次和待核验岗位。`; 
      const newJobs = oldIDs ? data.jobs.filter(j => !oldIDs.has(j.id) && j.status === 'open').length : 0;
      updateCompanies(); render();
      if (newJobs) toast(`${newJobs} new ${newJobs === 1 ? 'opportunity' : 'opportunities'} added. Your filters are unchanged.`);
      else if (showToast) toast('Latest feed loaded. New opportunities appear automatically.');
    } else { updateStats(); if (showToast) toast('You’re viewing the latest available collection.'); }
  } catch (error) {
    feedError = true;
    $('#sync-label').textContent = 'Feed unavailable';
    $('#notice').hidden = false; $('#notice').textContent = data ? 'Could not reload the feed. The previous results remain available.' : 'Could not load the job feed. Please retry in a moment.';
    if (!data) $('#job-list').innerHTML = '<div class="empty"><h2>The feed could not be loaded.</h2><p>Your saved application states are still stored in this browser.</p><button id="retry">Try again</button></div>';
    else updateStats();
    if (showToast) toast('Could not reload. Please try again.');
  } finally { checking = false; $('#refresh').disabled = false; }
}

let editingJob=null;
function renderTracker(){
 const entries=Object.entries(records).map(([id,r])=>({id,r,job:r.job||allJobs().find(j=>j.id===id)}));
 const groups=[['','全部记录',entries.length],['group:pending','未投 / 准备投递',entries.filter(x=>stageOf(x.r.status).group==='pending').length],['submitted','已投递',entries.filter(x=>hasApplied(x.r)).length],['group:interview','面试流程中',entries.filter(x=>activeInterview(x.r)).length],['group:offer','Offer',entries.filter(x=>stageOf(x.r.status).group==='offer').length],['group:closed','已结束',entries.filter(x=>stageOf(x.r.status).group==='closed').length]];
 const selected=$('#tracker-stage-filter').value,query=$('#tracker-search').value.trim().toLowerCase(),dueOnly=$('#tracker-due-only').checked;
 $('#tracker-summary').innerHTML=groups.map(([value,label,n])=>`<button data-tracker-group="${value}" class="${selected===value?'selected':''}"><span>${label}</span><strong>${n}</strong></button>`).join('');
 const list=entries.filter(({r,job})=>{
  if(selected==='submitted'&&!hasApplied(r))return false;
  if(selected.startsWith('group:')&&stageOf(r.status).group!==selected.slice(6))return false;
  if(selected.startsWith('stage:')&&r.status!==selected.slice(6))return false;
  if(dueOnly&&(!r.nextEventAt||finished(r)))return false;
  return !query||[job?.title,job?.company,r.notes,r.nextAction,r.result].join(' ').toLowerCase().includes(query);
 }).sort((a,b)=>{
  const next=x=>!finished(x.r)&&x.r.nextEventAt?Date.parse(x.r.nextEventAt):Infinity;
  return next(a)-next(b)||(Date.parse(b.r.updatedAt)||0)-(Date.parse(a.r.updatedAt)||0);
 });
 $('#tracker-count').textContent=`${list.length} 条记录 · 投递与面试阶段均由你手动确认`;
 $('#nav-applied').textContent=entries.filter(x=>hasApplied(x.r)).length;
 $('#tracker-list').innerHTML=list.length?list.map(({id,r,job})=>`<article class="tracker-row" data-id="${escape(id)}"><div class="tracker-role"><span>${escape(job?.company||'历史申请')}</span><button class="job-title" data-action="track">${escape(job?.title||id)}</button><small>${job?.sourceId==='manual'?'手动添加':data&&!data.jobs.some(j=>j.id===id)?'岗位已不在最新列表 · 申请记录保留':''}</small></div><div><span class="stage-badge ${stageOf(r.status).group}">${stageOf(r.status).label}</span><small class="tracker-date">${r.appliedAt?'投递于 '+r.appliedAt:hasApplied(r)?'投递日期未填写':'尚未投递'}</small></div><div class="tracker-next"><strong>${escape(r.nextAction||'暂无下一步')}</strong>${r.nextEventAt?`<time class="${!finished(r)&&Date.parse(r.nextEventAt)<Date.now()?'overdue':''}">${escape(timeLabel(r.nextEventAt))}${!finished(r)&&Date.parse(r.nextEventAt)<Date.now()?' · 待跟进':''}</time>`:''}${r.result?`<p>结果：${escape(r.result)}</p>`:r.notes?`<p>${escape(r.notes.slice(0,110))}${r.notes.length>110?'…':''}</p>`:''}</div><button class="tracker-secondary" data-action="track" aria-label="更新 ${escape(job?.company||'')} ${escape(job?.title||id)} 的进展">更新进展 ↗</button></article>`).join(''):`<div class="empty"><h2>${entries.length?'没有符合筛选的记录。':'从一份申请开始。'}</h2><p>${entries.length?'调整阶段、搜索或待办筛选。':'在岗位卡片点“记录进展”，或手动添加你在其他渠道投递的实习。'}</p><button id="tracker-empty-add">＋ 手动添加申请</button></div>`;
}
function datetimeInput(value){if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function openTracker(id){
 editingJob=id?allJobs().find(j=>j.id===id):{id:'manual:'+crypto.randomUUID(),title:'',company:'',sourceId:'manual',topics:[],evidence:[],type:'Internship'};
 if(!editingJob)return;
 const r=record(editingJob.id), job=r.job||editingJob;
 $('#track-company').value=job.company||'';$('#track-title').value=job.title||'';$('#track-url').value=job.applyUrl||job.url||'';
 $('#track-stage').innerHTML=statusOptions(editingJob.id);$('#track-applied').value=r.appliedAt;$('#track-next').value=datetimeInput(r.nextEventAt);$('#track-action').value=r.nextAction;$('#track-notes').value=r.notes;$('#track-result').value=r.result;
 $('#track-history').innerHTML=r.history.length?[...r.history].reverse().map(h=>`<li><time>${escape(timeLabel(h.at))}</time><strong>${h.from&&h.from!==h.to?stageOf(h.from).label+' → ':''}${stageOf(h.to).label}</strong><span>${escape(h.summary)}</span></li>`).join(''):'<li>尚无变更记录。保存后开始记录；不会补造之前的面试轮次。</li>';
 $('#tracker-dialog').showModal();$('#track-stage').focus();
}
$('#tracker-stage-filter').insertAdjacentHTML('beforeend','<optgroup label="具体阶段">'+STAGES.map(s=>`<option value="stage:${s.id}">${s.label}</option>`).join('')+'</optgroup>');
$('#tracker-search').addEventListener('input',renderTracker);
$('#tracker-stage-filter').addEventListener('change',renderTracker);
$('#tracker-due-only').addEventListener('change',renderTracker);
$('#add-application').addEventListener('click',()=>openTracker());
$('#tracker-export').addEventListener('click',()=>$('#export').click());
$('#tracker-import').addEventListener('click',()=>$('#import').click());
$('#close-tracker').addEventListener('click',()=>$('#tracker-dialog').close());
$('#track-stage').addEventListener('change',()=>{if(editingJob&&!hasApplied(record(editingJob.id))&&hasApplied({status:$('#track-stage').value})&&!$('#track-applied').value)$('#track-applied').value=localDay();});
$('#tracker-form').addEventListener('submit',event=>{
 event.preventDefault();if(!editingJob)return;
 const link=$('#track-url').value.trim();if(link&&!link.startsWith('https://')){toast('请使用 https:// 开头的官方链接，或留空。');return;}
 const job={...editingJob,title:$('#track-title').value.trim(),company:$('#track-company').value.trim(),url:link,applyUrl:link};
 if(!job.title||!job.company)return;
 const next=$('#track-next').value;
 records[job.id]=updateRecord(records[job.id],{status:$('#track-stage').value,appliedAt:$('#track-applied').value,nextEventAt:next?new Date(next).toISOString():'',nextAction:$('#track-action').value,notes:$('#track-notes').value,result:$('#track-result').value},job);
 persist();$('#tracker-dialog').close();render();toast('申请进展已保存。');
});
document.addEventListener('click', event => {
  const viewButton = event.target.closest('[data-view]'); if (viewButton) { resetFilters(); setView(viewButton.dataset.view); }
  const topicButton = event.target.closest('[data-topic]');
  const typeButton = event.target.closest('[data-type]');
  if (typeButton) setRoleType(typeButton.dataset.type);
  if (topicButton) {
    topic = topicButton.dataset.topic; shown = 40;
    document.querySelectorAll('[data-topic]').forEach(b => { b.classList.toggle('selected', b === topicButton); b.setAttribute('aria-pressed', String(b === topicButton)); });
    render();
  }
  const card = event.target.closest('[data-id]'), action = event.target.closest('[data-action]')?.dataset.action;
  if (card && action === 'save') save(card.dataset.id);
  if (card && action === 'details') details(card.dataset.id);
  if (card && action === 'track') openTracker(card.dataset.id);
  const track=event.target.closest('[data-track-id]');if(track){$('#details').close();openTracker(track.dataset.trackId);}
  const group=event.target.closest('[data-tracker-group]');if(group){$('#tracker-stage-filter').value=group.dataset.trackerGroup;renderTracker();}
  const stat = event.target.closest('[data-stat]');
  if (stat) { resetFilters(); view = 'all'; if (stat.dataset.stat === 'bigtech') roleType='Research'; if (stat.dataset.stat === 'internship') roleType = 'Internship'; if (stat.dataset.stat === 'new') $('#new').checked = true; render(); }
  if (event.target.id === 'empty-reset') { resetFilters(); setView('all'); }
  if (event.target.id === 'retry') loadFeed(true);
  if (event.target.id === 'close-details') $('#details').close();
  if (event.target.id === 'tracker-empty-add') openTracker();
});
document.addEventListener('change', event => {
  if (event.target.matches('[data-action="status"]')) setStatus(event.target.closest('[data-id]').dataset.id, event.target.value);
});
['company', 'sort', 'remote', 'new', 'include-archived', 'us', 'application-filter'].forEach(id => $(`#${id}`).addEventListener('change', () => { shown = 40; render(); }));
$('#company-group').addEventListener('change', () => { shown = 40; updateCompanies(); render(); });
$('.role-tabs').addEventListener('keydown', event => {
  const buttons = [...document.querySelectorAll('[data-type]')], index = buttons.indexOf(event.target);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  setRoleType(buttons[next].dataset.type); buttons[next].focus();
});
$('#search').addEventListener('input', () => { shown = 40; render(); });
$('#reset').addEventListener('click', resetFilters);
$('#refresh').addEventListener('click', () => loadFeed(true));
$('#coverage-link').addEventListener('click', () => { setView('sources'); $('#page-title').scrollIntoView({ behavior: 'smooth' }); });
$('#load-more').addEventListener('click', () => { shown += 40; render(); });
$('#details').addEventListener('click', e => { if (e.target === $('#details')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
$('#details').addEventListener('close', () => { [...document.querySelectorAll('.job-card')].find(c => c.dataset.id === focusedJob)?.querySelector('.job-title')?.focus(); });
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('#details').open) { e.preventDefault(); setView('all'); $('#search').focus(); } });
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'zirui-applications-'+localDay()+'.json'; a.click(); URL.revokeObjectURL(url); toast('Tracker exported. Keep this file to restore on another browser.');
});
$('#import').addEventListener('click', () => {$('#backup-error').textContent='';$('#backup-dialog').showModal();});
$('#close-backup').addEventListener('click',()=>$('#backup-dialog').close());
$('#choose-backup-file').addEventListener('click',()=>$('#import-file').click());
function importTracker(raw){
 if(raw.length>5*1024*1024)throw new Error('File too large');
 const input=JSON.parse(raw);if(![1,2].includes(input.version))throw new Error('Unsupported version');
 const imported=validateRecords(input.records);records=mergeRecords(records,imported);persist();render();$('#backup-dialog').close();toast(`已恢复 ${Object.keys(imported).length} 条记录。`);
}
$('#restore-backup-text').addEventListener('click',()=>{try{importTracker($('#backup-json').value);$('#backup-json').value='';}catch{$('#backup-error').textContent='无法导入。请粘贴此前导出的完整 JSON 备份。';}});
$('#footer-export').addEventListener('click', () => $('#export').click());
$('#footer-import').addEventListener('click', () => $('#import').click());
$('#import-file').addEventListener('change', async e => {
  try {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('File too large');
    importTracker(await file.text());
  } catch { toast('Could not import. Choose a tracker JSON exported from this page.'); }
  e.target.value = '';
});
window.addEventListener('storage', e => { if (e.key === STORE) { try { records = validateRecords(JSON.parse(e.newValue || '{}')); render(); } catch {} } });
if(view==='applied')render();
await loadFeed();

setInterval(() => { if (!document.hidden) loadFeed(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadFeed(); });
window.addEventListener('online', () => loadFeed());
