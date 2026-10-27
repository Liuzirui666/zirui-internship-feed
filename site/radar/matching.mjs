// Shared matching rules used by the reused collector and browser ATS refresh.
const decode = value => String(value || '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
export const plain = value => decode(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const cleanDescription = value => {
 let html=decode(value).replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi,'');
 html=html.replace(/<(div|section)[^>]*class=["'][^"']*content-(?:intro|conclusion)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,'');
 return plain(html).split(/(?:we are an equal opportunity|equal employment opportunity|applicant.{0,20}privacy (?:notice|policy)|our commitment to diversity|benefits at a glance|how we[’']re different|annual salary)/i)[0];
};
const AI = /\b(?:AI|ML|LLMs?|VLMs?|artificial intelligence|machine learning|deep learning|language models?|foundation models?|neural|generative|reinforcement learning)\b/i;
const TECHNICAL = /\b(?:research(?:er)?|scien(?:tist|ce)|engineer(?:ing)?|technical|student|intern(?:s|ship(?:s)?)?|fellow(?:ship)?|residen(?:cy|t)|postdoc|professor|red team)\b/i;
const RULES = {
  'LLM Security': /\b(?:prompt injection|jailbreak\w*|LLM security|model security|AI security|AI\/ML security|adversarial (?:machine learning|AI|robustness)|red[- ]team\w*)\b/i,
  'AI Safety': /\b(?:AI safety|responsible AI|trustworthy AI|safeguards|AI alignment|model alignment|interpretability|safety (?:evaluation|oversight)|frontier risk|AI risk|RLHF)\b/i,
  'Agentic Systems': /\b(?:multi[- ]agent|agentic|LLM agents?|AI agents?|agent (?:safety|security|systems?|framework|evaluation|orchestration)|tool[- ]use|tool[- ]using)\b/i,
  'Reinforcement Learning': /\b(?:reinforcement learning|multi[- ]objective (?:RL|reinforcement)|policy gradient|PPO|contextual bandit|online learning|RLHF|RLVR)\b/i,
  'Software Security': /\b(?:fuzzing|fuzzers?|vulnerability research|software security|program security|memory safety|binary security|vulnerability discovery|cybersecurity research)\b/i,
  'Program Analysis': /\b(?:program analysis|binary analysis|reverse engineering|static analysis|dynamic analysis|symbolic execution|compiler optimization|interprocedural|formal verification)\b/i,
};

export function classify(title, description = '', department = '') {
  // Hiring AI researchers is not itself an AI research or engineering role.
  if (/\b(?:recruit(?:er|ers|ing|ment)|talent acquisition|copywrit\w*|designer|(?:product|UX|brand|visual) design|consult(?:ant|ing)|(?:business|revenue|category) operations|business development|finance|accounting|marketing|sales|human resources|legal|communications|procurement|supply chain|(?:product|project|program) manag(?:er|ement))\b/i.test(title)) return { topics: [], evidence: [], score: 0 };
  const body = cleanDescription(description);
  const heading = `${title} ${department}`;
  const text = `${heading}. ${body}`;
  const ai = AI.test(text);
  const topics = [], evidence = [];
  for (const [topic, pattern] of Object.entries(RULES)) {
    let match = text.match(pattern);
    if (!match && ai && topic === 'Privacy') match = heading.match(/\bprivacy\b/i);
    if (!match && ai && topic === 'LLM Security') match = heading.match(/\bsecurity\b/i);
    if (!match && ai && topic === 'AI Safety') match = heading.match(/\b(?:safety|alignment|robustness)\b/i);
    if (!match || (!ai && ['LLM Security', 'AI Safety'].includes(topic))) continue;
    // Audio engineers are relevant; recruiting and sales boilerplate is not.
    if (!TECHNICAL.test(title) && !pattern.test(title)) continue;
    topics.push(topic);
    const index = match.index || 0;
    evidence.push({ topic, term: match[0], excerpt: text.slice(Math.max(0, index - 65), index + 200).trim() });
  }
  // Company introductions mentioning AI are not evidence that a copywriting,
  // hardware or general business internship involves machine learning.
  const technicalTitle=/\b(?:research(?:er)?|scien(?:tist|ce)|engineer(?:ing)?|developer|AI|ML|NLP|data science)\b/i.test(title);
  const concreteML=/\b(?:LLMs?|VLMs?|machine learning|deep learning|language models?|foundation models?|neural networks?|generative (?:AI|models?)|reinforcement learning)\b/i;
  if (!topics.length && ai && technicalTitle && (AI.test(heading)||concreteML.test(body))) {
    topics.push('ML Research');
    evidence.push({ topic: 'ML Research', term: 'Related AI research', excerpt: text.slice(0, 250) });
  }
  return { topics, evidence, score: topics.filter(t => t !== 'ML Research').length * 12 + topics.filter(t => RULES[t]?.test(title)).length * 8 + (/research|scien(?:tist|ce)/i.test(title) ? 4 : 0) };
}

export function isUS(location, countries = []) {
  if (countries.some(c => /^(?:US|USA|United States(?: of America)?)$/i.test(c || ''))) return true;
  return /\bUnited States\b|\bUSA\b|(?:^|[,;\s-])US(?:$|[,;\s-])|\bU\.S\.|\b(?:California|Massachusetts|Washington|Texas|Virginia|Pennsylvania|Illinois|New York|New Jersey|North Carolina|Colorado|Oregon|Georgia|Florida|Utah|Michigan|Minnesota|Arizona)\b|\b(?:San Francisco|San Jose|Mountain View|Sunnyvale|Santa Clara|Palo Alto|Menlo Park|Redwood City|San Diego|Los Angeles|Cupertino|Seattle|Redmond|Bellevue|Kirkland|Boston|Cambridge,? MA|Pittsburgh|Austin|Atlanta|Chicago|New York City|Burlingame|Foster City|South San Francisco)\b/i.test(location || '');
}

export const DEGREE_LABELS = {
  phd_required: '博士必需', phd_preferred: '博士优先', phd_accepted: '明确接受博士 · 多学历开放',
  other_degree: '仅写本科／硕士 · 博士资格待确认', restricted: '明确限定本科／硕士', unspecified: '学历未明确说明',
};
const PHD = /\b(?:Ph[.\s]*D\.?|doctorate|doctoral (?:degree|student|candidate|program|studies))\b/i;
const LOWER = /\b(?:undergrad\w*|bachelor[’'s]*|master[’'s]*|MSc|BSc|BS|MS|B\.S\.|M\.S\.)\b/i;
const STUDY = /\b(?:pursu\w*|enroll\w*|studying|studies|students?|candidates?|working toward\w*|obtain\w*|complet\w*|degree|program|education|qualification|current)\b/i;
const PREF = /preferred qualifications?|prefer(?:red|ence)?|nice to have|bonus|ideally|desired qualifications?/i;
const REQ = /required qualifications?|minimum qualifications?|requirements?|what we(?:[’']re| are) looking for|you (?:must|have|bring)|qualifications/i;
function degreeLines(description) {
  return decode(description).replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi,'')
    .replace(/<\/?(?:p|li|h[1-6]|div|br|ul|section)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')
    .replace(/Ph[.\s]*D\.?/gi,'PhD').replace(/(?=(?:Required Qualifications|Minimum Qualifications|Preferred Qualifications|Nice to Have|Other Requirements|Responsibilities|Compensation)\b)/g,'\n').replace(/\r/g,'').split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(plain).filter(Boolean);
}
export function degreeFit(title, description = '') {
  let section = 'unknown', candidate = null;
  for (const line of degreeLines(description)) {
    // Qualification headings set context for subsequent bullets; prose about mentors is never eligibility evidence.
    if (/^(?:preferred qualifications?|nice to have|bonus qualifications?|desired qualifications?)\b/i.test(line)) section='preferred';
    else if (/^(?:required qualifications?|minimum qualifications?|requirements?|what we(?:[’']re| are) looking for|qualifications)\b/i.test(line)) section='required';
    else if (/^(?:responsibilities|what you(?:[’']ll| will) do|about (?:us|the role)|benefits|compensation)/i.test(line)) section='unknown';
    if (!PHD.test(line) || !STUDY.test(line) || /(?:mentors?|team|colleagues?|researchers?).{0,35}(?:with|hold|have)|no PhD|PhD (?:is )?not required|not (?:currently )?pursuing (?:a )?PhD/i.test(line)) continue;
    let status = PREF.test(line) || section==='preferred' ? 'phd_preferred'
      : LOWER.test(line) || /or equivalent (?:experience|practical)/i.test(line) ? 'phd_accepted'
      : /currently|pursu\w*|enroll\w*|must|require\w*|current PhD|PhD (?:students?|candidates?)|obtaining|working toward/i.test(line) || section==='required' ? 'phd_required' : 'phd_accepted';
    const next={status,label:DEGREE_LABELS[status],evidence:line.slice(0,700)};
    if(!candidate || ({phd_required:3,phd_preferred:2,phd_accepted:1}[status] > {phd_required:3,phd_preferred:2,phd_accepted:1}[candidate.status]))candidate=next;
  }
  const titlePhD=PHD.test(title), titleOther=LOWER.test(title);
  if (candidate) return candidate;
  if(titlePhD && !titleOther)return {status:'phd_required',label:DEGREE_LABELS.phd_required,evidence:title};
  if(titlePhD && titleOther)return {status:'phd_accepted',label:DEGREE_LABELS.phd_accepted,evidence:title};
  const lowerLine=degreeLines(description).find(l=>LOWER.test(l)&&STUDY.test(l));
  const restricted=titleOther || (lowerLine && /only|exclusively|must be (?:an? )?undergrad|not (?:open|eligible).{0,20}PhD/i.test(lowerLine));
  const status=restricted?'restricted':lowerLine?'other_degree':'unspecified';
  return {status,label:DEGREE_LABELS[status],evidence:restricted&&titleOther?title:lowerLine?.slice(0,700)||'The posting does not explicitly state an education requirement. Confirm eligibility with the employer.'};
}
export function researchFit(title, description = '', department = '') {
  const body = cleanDescription(description), degree=degreeFit(title,description);
  const excluded = /\b(?:recruit(?:er|ing|ment)|talent acquisition|(?:program|product|project) manag(?:er|ement)|sales|marketing|counsel|account executive)\b/i.test(title);
  const researchTitle = /\b(?:research(?:er)?|(?:applied|research) scien(?:tist|ce)|student researcher)\b/i.test(title);
  // An engineering internship stays engineering when research appears only in broad intake/qualifications.
  const engineeringTitle=/\bengineer(?:ing)?\b/i.test(title);
  const researchWork = /\b(?:conduct(?:ing)?|perform(?:ing)?) (?:\w+\s+){0,3}research|develop(?:ing)? novel (?:algorithms?|methods?|models?)/i.test(body);
  const isResearch = !excluded && (researchTitle || (!engineeringTitle && /research/i.test(department) && researchWork));
  return { isResearch, phdMentioned:PHD.test(title+' '+body), phdEligible:isResearch&&['phd_required','phd_preferred','phd_accepted'].includes(degree.status),
    isEngineering:engineeringTitle||!isResearch, roleScope:isResearch?'research':'engineering', evidence:degree.evidence, degree };
}
export function compensationFit(raw, description = '') {
  const base=(raw?.summaryComponents || []).filter(c=>c.compensationType==='Salary' && c.currencyCode==='USD' && ['1 HOUR','1 MONTH'].includes(c.interval) && Number.isFinite(c.minValue));
  const period=base.some(c=>c.interval==='1 HOUR')?'hour':'month', components=base.filter(c=>c.interval===(period==='hour'?'1 HOUR':'1 MONTH'));
  if(components.length){const min=Math.min(...components.map(c=>c.minValue)),max=Math.max(...components.map(c=>c.maxValue??c.minValue));return {currency:'USD',period,min,max,label:`$${min.toLocaleString('en-US')}${max!==min?'–$'+max.toLocaleString('en-US'):''}/${period==='hour'?'h':'mo'}`,evidence:plain(raw.compensationTierSummary||raw.scrapeableCompensationSalarySummary||'Employer-published hourly compensation')};}
  const text=plain(description), matches=[...text.matchAll(/(?:USD\s*|US)?\$\s*(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3}(?:\.\d{1,2})?))?\s*(?:USD\s*)?(?:an?\s+|per\s+|\/\s*)(?:hour|hr|h)\b/gi)];
  if(matches.length){const m=matches[0], min=Number(m[1]),max=Number(m[2]||m[1]);const nearby=text.slice(Math.max(0,m.index-100),m.index+m[0].length+60);if(!/\b(?:CAD|Canadian|AUD|Australian|NZD|SGD)\b/i.test(nearby))return {currency:'USD',period:'hour',min,max,label:`$${min}${max!==min?'–$'+max:''}/h`,evidence:nearby};}
  const monthly=text.match(/(?:USD\s*|US)?\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)(?:\s*(?:-|–|—|to)\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?))?\s*(?:USD\s*)?(?:a\s+|per\s+|\/\s*)month\b/i);
  if(monthly && !/\b(?:CAD|Canadian|AUD|Australian|NZD|SGD)\b/i.test(text.slice(Math.max(0,monthly.index-50),monthly.index+monthly[0].length+20))){const min=Number(monthly[1].replaceAll(',','')),max=Number((monthly[2]||monthly[1]).replaceAll(',',''));return {currency:'USD',period:'month',min,max,label:`$${min.toLocaleString('en-US')}${max!==min?'–$'+max.toLocaleString('en-US'):''}/mo`,evidence:monthly[0]};}
  const summary=plain(raw?.compensationTierSummary||raw?.scrapeableCompensationSalarySummary||'');
  return {currency:null,period:null,min:null,max:null,label:summary||'薪资未公开',evidence:summary||'No comparable USD hourly rate was published. Annual, monthly and total-package amounts are not converted into hourly pay.'};
}
export const COMPANY_GROUPS = {big:['google','apple','microsoft','amazon','nvidia','meta','adobe','qualcomm','openai','anthropic','xai','scale','dolby','databricks','samsung','salesforce','sony','snowflake','ibm','tiktok','bytedance']};
export const companyCategory=job=>COMPANY_GROUPS.big.includes(job.sourceId)?'big':'small';
export const PAY_FLOOR={hour:55,month:10000};
export const competitivePay=job=>job.compensation?.currency==='USD' && Object.hasOwn(PAY_FLOOR,job.compensation.period) && job.compensation.min>=PAY_FLOOR[job.compensation.period];
export const withinScope=job=>acceptsPhD(job)&&(companyCategory(job)==='big'||competitivePay(job));
export const matchesTrack=(job,type)=>type==='Research'?!!job.research?.isResearch:type==='Engineering'?(job.research?.isEngineering??!job.research?.isResearch):type==='BigCompanies'?companyCategory(job)==='big':type==='SmallCompanies'?companyCategory(job)==='small':true;
export const acceptsPhD=job=>!['other_degree','restricted'].includes(job.degree?.status);
export const matchesPay=(job,floor)=>!floor || job.compensation?.currency==='USD' && job.compensation.period==='hour' && job.compensation.min>=Number(floor);
export function priorityOf(job) {return (job.us?1000:0)+(job.research?.isResearch?({phd_required:500,phd_preferred:400,phd_accepted:300}[job.degree?.status]||200):0)+(job.score||0);}
export function upgradeJob(job) {
  if(job.classificationVersion===2)return job;
  // Old snapshots contain excerpts, not the full qualification section. Never infer "required" from those fragments.
  const degree=degreeFit(job.title),research=researchFit(job.title,'',job.department);
  return {...job,classificationVersion:2,degree,research:{...research,degree},compensation:compensationFit(null),priorityScore:priorityOf({...job,degree,research})};
}

// Default results contain current recruiting windows, not undated multi-year standing adverts.
export const MAX_UNDATED_COHORT_AGE_DAYS=180;
const DAY=86400000;
export function postingFreshness(job, now=Date.now()) {
  const time=typeof now==='number'?now:Date.parse(now);
  if(job.pipeline)return {eligible:false,code:'talent_pool',label:'人才库 · 非明确空缺'};
  if(job.status!=='open')return {eligible:false,code:job.status==='not-listed'?'not_listed':'source_unverified',label:job.status==='not-listed'?'已不在最新官网列表':'当前官网收录未核实'};
  const checked=Date.parse(job.lastSeen);
  if(!Number.isFinite(checked)||time-checked>DAY)return {eligible:false,code:'verification_old',label:'官网收录核验已超过一天'};
  const expires=Date.parse(job.expiresAt);
  if(Number.isFinite(expires)&&expires<time)return {eligible:false,code:'deadline_passed',label:'官方截止日期已过'};
  const title=String(job.title||''), years=[...title.matchAll(/\b(20\d{2})\b/g)].map(m=>({year:Number(m[1]),index:m.index}));
  let cohortEnd=null;
  for(const item of years){
    const context=title.slice(Math.max(0,item.index-35),item.index+4);
    const seasons=[...context.matchAll(/\b(spring|summer|fall|autumn|winter)\b/gi)].map(m=>m[1].toLowerCase());
    const month=seasons.length?Math.max(...seasons.map(x=>({winter:11,spring:4,summer:8,fall:11,autumn:11}[x]))):11;
    const end=Date.UTC(item.year,month+1,1)-1;cohortEnd=Math.max(cohortEnd??0,end);
  }
  if(cohortEnd!==null&&cohortEnd<time)return {eligible:false,code:'past_cohort',label:'标注的实习批次已结束',cohortEnd:new Date(cohortEnd).toISOString()};
  const posted=Date.parse(job.postedAt);
  if(Number.isFinite(posted)&&posted>time+DAY)return {eligible:false,code:'future_date',label:'来源发布日期异常'};
  const ageDays=Number.isFinite(posted)?Math.max(0,Math.floor((time-posted)/DAY)):null;
  if(ageDays!==null&&ageDays>MAX_UNDATED_COHORT_AGE_DAYS&&cohortEnd===null)return {eligible:false,code:'standing_old',label:'长期挂岗 · 当前批次未明确',ageDays};
  return {eligible:true,code:cohortEnd!==null?'current_cohort':ageDays===null?'date_unknown':'recent_posting',label:cohortEnd!==null?'当前／未来实习批次':ageDays===null?'发布日期未提供 · 官网仍列出':'近期发布 · 官网仍列出',ageDays};
}
export const isCurrentOpportunity=(job,now=Date.now())=>postingFreshness(job,now).eligible;

export function employmentType(title, type = '', description = '') {
  if (/\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher|fellowship)\b|\b(?:AI|research|ML) residen(?:cy|t)\b/i.test(`${title} ${type}`)) return 'Internship';
  if (/contract|temporary|part[- ]?time|freelance/i.test(`${title} ${type}`)) return 'Other';
  if (/full[- _]?time|regular|permanent/i.test(type) || /\bfull[- ]time (?:position|role|employment)\b/i.test(description)) return 'Full-time';
  return 'Unspecified';
}

export function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function normalize(raw, source, now) {
  const title = plain(raw.title), location = plain(raw.location);
  const url = safeURL(raw.url), description = cleanDescription(raw.description);
  if (!title || !url) return null;
  const match = classify(title, description, plain(raw.department));
  const research = researchFit(title, raw.description || '', plain(raw.department));
  if (!match.topics.length) return null;
  const type = employmentType(title, raw.type, description);
  if (type !== 'Internship' || !/\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher)\b/i.test(`${title} ${raw.type || ''}`)) return null;
  const degree=research.degree, compensation=compensationFit(raw.compensation,raw.description);
  return {
    classificationVersion:2, degree, compensation,
    id: `${source.id}:${raw.id || encodeURIComponent(url.split('?')[0]).slice(-120)}`,
    sourceId: source.id, company: source.name, tier: source.tier,
    title, location, type, typeInferred: type === 'Unspecified',
    us: isUS(location, raw.countries), department: plain(raw.department), url, applyUrl: safeURL(raw.applyUrl) || url,
    postedAt: isoDate(raw.postedAt), expiresAt:isoDate(raw.validThrough||raw.expiresAt), sourceUpdatedAt: isoDate(raw.updatedAt),
    remote: /remote/i.test(`${location} ${raw.workplace || ''}`), pipeline: raw.pipeline === true,
    ...match, research, priorityScore: priorityOf({us:isUS(location,raw.countries),research,degree,score:match.score}), excerpt: description.slice(0, 480),
    firstSeen: now, lastSeen: now, status: 'open',
  };
}


export function mergeSnapshot(previous, results, now) {
  const oldJobs = new Map((previous?.jobs || []).map(j => [j.id, j]));
  const current = new Map();
  const sources = results.map(({ source, jobs, complete, error, scanned }) => {
    const oldSource = previous?.sources?.find(s => s.id === source.id);
    const observedOutsideScope=new Set();
    for (const raw of jobs) {
      const job = normalize(raw, source, now);
      if (!job) {const url=safeURL(raw.url);if(url)observedOutsideScope.add(`${source.id}:${raw.id || encodeURIComponent(url.split('?')[0]).slice(-120)}`);continue;}
      const old = oldJobs.get(job.id);
      current.set(job.id, { ...job, firstSeen: old?.firstSeen || now, missingSince: null });
    }
    const found = [...current.values()].filter(j => j.sourceId === source.id).length;
    // A sudden empty/reduced response may be a parser change, never a mass closure.
    const oldCount = [...oldJobs.values()].filter(j => j.sourceId === source.id && j.status === 'open' && !observedOutsideScope.has(j.id)).length;
    const suspicious = complete && oldCount >= 5 && found < oldCount * 0.35;
    const trustworthy = complete && !error && !suspicious;
    for (const old of oldJobs.values()) {
      if (old.sourceId !== source.id || current.has(old.id) || observedOutsideScope.has(old.id)) continue;
      if (trustworthy) {
        const missingSince = old.missingSince || now;
        if (Date.parse(now) - Date.parse(missingSince) < 30 * 86400000) current.set(old.id, { ...upgradeJob(old), status: 'not-listed', missingSince });
      } else current.set(old.id, { ...upgradeJob(old), status: old.status === 'not-listed' ? 'not-listed' : 'unverified' });
    }
    return {
      id: source.id, name: source.name, tier: source.tier, url: source.url,
      status: source.adapter === 'manual' ? 'manual' : trustworthy ? 'ok' : jobs.length ? 'partial' : 'error',
      checkedAt: now, lastSuccess: trustworthy ? now : oldSource?.lastSuccess || null,
      count: found, scanned: scanned || jobs.length,
      note: suspicious ? 'Unusually few results; previous listings retained for verification.' : error || source.note || '',
    };
  });
  return { schemaVersion: 1, updatedAt: now, refreshMinutes: 5, region: 'United States first · Internships only', sources,
    jobs: [...current.values()].map(job=>({...job,freshness:postingFreshness(job,now)})).sort((a, b) => b.priorityScore - a.priorityScore || b.score - a.score || (b.postedAt || '').localeCompare(a.postedAt || '') ) };
}
