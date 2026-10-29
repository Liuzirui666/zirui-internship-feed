// Official, public employer APIs only. No model calls, account cookies or paid API.
import {setTimeout as delay} from 'node:timers/promises';
export const INTERNSHIP=/\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher)\b/i;
export const queriesFor=source=>source.adapter==='google'?['intern','student researcher']:['intern'];
export async function requestOfficial(url,body,extra={},options={}) {
  const fetcher=options.fetcher||fetch, sleep=options.sleep||delay;
  for(let attempt=0;attempt<4;attempt++){
    const response=await fetcher(url,{method:body?'POST':'GET',headers:{'user-agent':'Mozilla/5.0',accept:'application/json,text/html;q=0.9,*/*;q=0.8',...(body?{'content-type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(response.ok)return response;
    const supplierSearch=/^https:\/\/(?:api\.lifeattiktok\.com|jobs\.bytedance\.com)\/api\/v1\/public\/supplier\/search\/job\/posts/.test(String(url));
    if(!([429,500,502,503,504].includes(response.status)||(response.status===400&&supplierSearch))||attempt===3){
      let reason='';try{const d=await response.clone().json();reason=String(d.message||d.msg||d.error?.message||'').slice(0,180);}catch{}
      throw new Error(`Official source returned HTTP ${response.status} after ${attempt+1} attempt(s)${reason?': '+reason:''}`);
    }
    const retry=Number(response.headers.get('retry-after'));
    await response.body?.cancel();
    await sleep(Math.min(30000,Math.max(1500*2**attempt,Number.isFinite(retry)?retry*1000:0)));
  }
}
function replaceRequired(text,before,after,label){if(!text.includes(before))throw new Error(`Upstream ${label} changed; previous feed preserved`);return text.replace(before,after);}
export function patchAdapters(text){
  text="import {requestOfficial,collectExtendedOfficial,collectMicrosoftFallback,INTERNSHIP} from './coverage.mjs';\n"+text;
  text=replaceRequired(text,"export async function request(url, body) {","export async function request(url, body) { return requestOfficial(url,body);\n/*",'request');
  text=replaceRequired(text,'export async function pool(items, limit, fn) {','*/}\nexport async function pool(items, limit, fn) {','request boundary');
  text=replaceRequired(text,'export async function collectSource(source) {',`export async function collectSource(source) {
  const deadline=Date.now()+240000;
  const request=(url,body,headers)=>{if(Date.now()>deadline)throw new Error('Source time budget reached; coverage is partial');return requestOfficial(url,body,headers);};
  if(['ibm','tiktok','bytedance','workday','smartrecruiters','amd'].includes(source.adapter))return collectExtendedOfficial(source,{request,pool});
  if(source.id==='microsoft'&&source.adapter==='eightfold'){const primary=await collectPublicCareers(source,{request,pool});return primary.complete?primary:collectMicrosoftFallback(source,primary,{request,pool,parseMSR});}`,'collector');
  text=replaceRequired(text,'job-board/${source.board}','job-board/${encodeURIComponent(source.board)}?includeCompensation=true','Ashby compensation');
  text=replaceRequired(text,'type: j.employmentType, workplace:','compensation:j.compensation, type: j.employmentType, workplace:','Ashby fields');
  text=replaceRequired(text,'await pool([...listings.values()], 4,','await pool([...listings.values()].filter(j=>INTERNSHIP.test(j.title)), 2,','Workday details');
  text=replaceRequired(text,'/\\b(?:intern(?:ships?)?|research(?:er)?|scien(?:tist|ce))\\b/i.test(j.title)','INTERNSHIP.test(j.title)','Apple/Dolby details');
  return text;
}
export function patchPublicCareers(text){
  text=replaceRequired(text,'const RESEARCH_OR_INTERN = /\\b(?:research(?:er)?|scien(?:tist|ce)|intern(?:s|ship(?:s)?)?|Ph\\.?D|student|postdoc)\\b/i;',"const RESEARCH_OR_INTERN = /\\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher)\\b/i;",'public detail candidates');
  // Restrict by title, never by generic Research department (full-time scientists).
  text=replaceRequired(text,"RESEARCH_OR_INTERN.test(`${j.name} ${j.department || ''}`)","RESEARCH_OR_INTERN.test(j.name)",'Eightfold candidates');
  return text;
}
const locationChain=city=>{const result=[];for(let c=city;c;c=c.parent)result.push(c.en_name||c.i18n_name||c.name||'');return result.filter(Boolean);};
export function parseSupplierJob(j,source){
  if(!j.id||!j.title||typeof j.description!=='string'||typeof j.requirement!=='string')throw new Error('Official supplier returned incomplete job qualifications');
  const locations=locationChain(j.city_info);
  return {id:j.id,title:j.title,description:j.description+'\n'+j.requirement,location:locations.join(', '),countries:locations.slice(-1),type:j.recruit_type?.en_name||j.recruit_type?.i18n_name,department:j.job_category?.en_name,url:source.adapter==='tiktok'?`https://lifeattiktok.com/search/${j.id}`:`https://joinbytedance.com/search/${j.id}`,expiresAt:j.job_post_info?.expiry_time||null};
}
export function parseSmartRecruitersJob(j){
  const sections=j.jobAd?.sections;
  if(!j.id||!j.name||!j.postingUrl||!sections?.jobDescription?.text||!sections?.qualifications?.text)throw new Error('SmartRecruiters full qualifications unavailable');
  return {id:j.id,title:j.name,description:['jobDescription','qualifications','additionalInformation'].map(k=>sections[k]?.text).filter(Boolean).join('\n'),location:j.location?.fullLocation||[j.location?.city,j.location?.region,j.location?.country].filter(Boolean).join(', '),countries:[j.location?.country],type:j.typeOfEmployment?.label,department:j.department?.label,postedAt:j.releasedDate,url:j.postingUrl};
}
export function parseAMDJob(j){
  if(!j.req_id||!j.title||!j.description||!j.country)throw new Error('AMD full qualifications unavailable');
  const canonical=j.meta_data?.canonical_url;
  const url=canonical&&new URL(canonical).origin==='https://careers.amd.com'?canonical:`https://careers.amd.com/students/jobs/${encodeURIComponent(j.req_id)}?lang=en-us`;
  return {id:j.req_id,title:j.title,description:j.description,location:[j.city,j.state,j.country].filter(Boolean).join(', '),countries:[j.country_code||j.country],type:(j.categories||[]).map(c=>c.name).join('; '),postedAt:j.posted_date,url};
}
const internWorkerType=value=>/\bintern(?:ship)?\b/i.test(value||'')&&!/\bnon[- ]intern/i.test(value||'');
export async function collectExtendedOfficial(source,{request,pool}){
  const jobs=[],issues=[],visited=new Set();let scanned=0;
  try{
    if(source.adapter==='workday'){
      const base=`https://${source.host}/wday/cxs/${source.tenant}/${source.board}`;
      const initial=await(await request(base+'/jobs',{limit:20,offset:0,searchText:'intern',appliedFacets:{}})).json();
      if(!Array.isArray(initial.jobPostings)||!Number.isFinite(initial.total))throw new Error('Workday search format changed');
      // Workday reports total=0 after page one. Preserve the first total.
      // An official Intern worker-type facet avoids matching "internal" in full-time descriptions.
      const facet=initial.facets?.find(f=>f.facetParameter==='workerSubType'&&f.values?.some(v=>internWorkerType(v.descriptor)));
      const internTypes=facet?.values.filter(v=>internWorkerType(v.descriptor)).map(v=>v.id);
      const queries=internTypes?.length?['']:['internship','intern'];
      const appliedFacets=internTypes?.length?{[facet.facetParameter]:internTypes}:{};
      const listings=new Map();
      for(const query of queries){
        let offset=0,total=Infinity;const pages=new Set();
        while(offset<total&&offset<20000){
          const data=await(await request(base+'/jobs',{limit:20,offset,searchText:query,appliedFacets})).json();
          if(!Array.isArray(data.jobPostings)||!Number.isFinite(data.total))throw new Error('Workday search format changed');
          total=offset===0?data.total:Math.max(total,data.total);
          const ids=data.jobPostings.map(j=>j.externalPath).join(',');
          if((!data.jobPostings.length&&offset<total)||(ids&&pages.has(ids)))throw new Error('Workday pagination repeated or ended early');pages.add(ids);
          for(const j of data.jobPostings)listings.set(j.externalPath,j);
          offset+=data.jobPostings.length;
        }
        if(offset<total)throw new Error('Workday page limit reached; coverage is partial');
      }
      scanned=listings.size;
      await pool([...listings.values()].filter(j=>INTERNSHIP.test(j.title)),2,async j=>{
        try{
          const data=await(await request(base+j.externalPath)).json(),d=data.jobPostingInfo;
          if(!d?.jobDescription||!d.title)throw new Error('Workday qualifications unavailable');
          jobs.push({id:d.jobReqId||j.bulletFields?.[0],title:d.title,location:[d.location,...(d.additionalLocations||[])].filter(Boolean).join('; '),countries:[d.country?.descriptor],description:d.jobDescription,type:`${d.timeType||''} ${d.workerSubType||''}`,postedAt:d.startDate,url:d.externalUrl||`https://${source.host}/en-US/${source.board}${j.externalPath}`});
        }catch(e){issues.push(e.message);}
      });
    }else if(source.adapter==='smartrecruiters'){
      const base=`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.board)}/postings`;
      let offset=0,total=Infinity;const listings=new Map();
      while(offset<total&&offset<20000){
        const data=await(await request(`${base}?limit=100&offset=${offset}${source.country?'&country='+encodeURIComponent(source.country):''}`)).json();
        if(!Array.isArray(data.content)||!Number.isInteger(data.totalFound)||data.totalFound<0)throw new Error('SmartRecruiters official search format changed');
        total=data.totalFound;const ids=data.content.map(j=>j.id).join(',');
        if((!data.content.length&&offset<total)||(ids&&visited.has(ids)))throw new Error('SmartRecruiters pagination repeated or ended early');visited.add(ids);
        scanned+=data.content.length;
        for(const j of data.content){
          if(!j.id||!j.name)throw new Error('SmartRecruiters returned incomplete listings');
          if(source.country&&j.location?.country?.toLowerCase()!==source.country.toLowerCase())throw new Error('SmartRecruiters country filter was not applied');
          if(INTERNSHIP.test(j.name+' '+(j.typeOfEmployment?.label||'')))listings.set(j.id,j);
        }
        offset+=data.content.length;
      }
      if(offset<total)throw new Error('SmartRecruiters page limit reached; coverage is partial');
      await pool([...listings.values()],2,async j=>{try{jobs.push(parseSmartRecruitersJob(await(await request(base+'/'+encodeURIComponent(j.id))).json()));}catch(e){issues.push(e.message);}});
    }else if(source.adapter==='amd'){
      let page=1,total=Infinity;
      while(scanned<total&&page<=200){
        const data=await(await request(`https://careers.amd.com/api/jobs?keywords=intern&limit=100&page=${page}`)).json();
        if(!Array.isArray(data.jobs)||!Number.isInteger(data.totalCount)||data.totalCount<0)throw new Error('AMD official search format changed');
        total=data.totalCount;const ids=data.jobs.map(j=>j.data?.req_id).join(',');
        if((!data.jobs.length&&scanned<total)||(ids&&visited.has(ids)))throw new Error('AMD pagination repeated or ended early');visited.add(ids);
        scanned+=data.jobs.length;
        for(const row of data.jobs){const j=row.data;if(!j?.title)throw new Error('AMD returned incomplete listings');if(INTERNSHIP.test(j.title))jobs.push(parseAMDJob(j));}
        page++;
      }
      if(scanned<total)throw new Error('AMD page limit reached; coverage is partial');
    }else if(source.adapter==='ibm'){
      let offset=0,total=Infinity;
      while(offset<total && offset<20000){
        const data=await(await request('https://www-api.ibm.com/search/api/v2',{appId:'careers',scopes:['careers2'],query:{bool:{must:[]}},size:100,from:offset,_source:['title','url','body','description','field_keyword_05','field_keyword_18','field_keyword_19']})).json();
        const rows=data.hits?.hits;total=typeof data.hits?.total==='number'?data.hits.total:data.hits?.total?.value;
        if(!Array.isArray(rows)||!Number.isFinite(total)||data.timed_out)throw new Error('IBM official search format changed or timed out');
        const ids=rows.map(r=>r._id).join(',');if((!rows.length&&offset<total)||(ids&&visited.has(ids)))throw new Error('IBM pagination repeated or ended early');visited.add(ids);
        scanned+=rows.length;
        for(const row of rows){const j=row._source;if(!j?.title||!j.url||!j.body)throw new Error('IBM full qualifications unavailable');if(INTERNSHIP.test(j.title+' '+j.field_keyword_18))jobs.push({id:row._id,title:j.title,url:j.url,description:j.body,location:[j.field_keyword_19,j.field_keyword_05].filter(Boolean).join(', '),countries:[j.field_keyword_05],type:j.field_keyword_18});}
        offset+=rows.length;
      }
      if(offset<total)throw new Error('IBM page limit reached; coverage is partial');
    }else{
      const base=source.adapter==='tiktok'?'https://api.lifeattiktok.com/api/v1/public/supplier':'https://jobs.bytedance.com/api/v1/public/supplier';
      const headers={'accept-language':'en-US','website-path':source.adapter==='tiktok'?'tiktok':'en',origin:source.adapter==='tiktok'?'https://lifeattiktok.com':'https://joinbytedance.com'};
      // IDs 202 and 301 are the official site's Intern filter (not Campus graduates).
      // Filtering at the API avoids paging through thousands of full-time keyword matches.
      let offset=0,total=Infinity;
      while(offset<total&&offset<20000){
        const data=await(await request(base+'/search/job/posts',{keyword:'',recruitment_id_list:['202','301'],limit:100,offset},headers)).json();
        const rows=data.data?.job_post_list;total=data.data?.count;
        if(data.code!==0||!Array.isArray(rows)||!Number.isFinite(total))throw new Error('Official supplier search format changed');
        const ids=rows.map(r=>r.id).join(',');if((!rows.length&&offset<total)||(ids&&visited.has(ids)))throw new Error('Official supplier pagination repeated or ended early');visited.add(ids);
        scanned+=rows.length;for(const row of rows)if(INTERNSHIP.test(row.title+' '+row.recruit_type?.en_name))jobs.push(parseSupplierJob(row,source));
        offset+=rows.length;
        if(offset<total)await delay(600);
      }
      if(offset<total)throw new Error('Official supplier page limit reached; coverage is partial');
    }
  }catch(e){issues.push(e.message);}
  return {source,jobs,scanned,complete:!issues.length,error:issues.join('; ')};
}
export function parseOfficialJobPosting(html,listing){
  let posting;
  for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const value=JSON.parse(match[1]);const rows=Array.isArray(value)?value:value['@graph']||[value];posting||=rows.find(j=>j['@type']==='JobPosting');}catch{}
  }
  if(!posting?.title||!posting.description||/this (?:job|position) is no longer available|this position has been filled/i.test(html))throw new Error('Official job page no longer provides a current posting');
  const loc=Array.isArray(posting.jobLocation)?posting.jobLocation:[posting.jobLocation].filter(Boolean);
  return {id:listing.id||listing.url.match(/\/job\/(\d+)/)?.[1],title:posting.title,description:posting.description,location:loc.map(l=>l.name||[l.address?.addressLocality,l.address?.addressRegion,l.address?.addressCountry].filter(Boolean).join(', ')).join('; '),countries:loc.map(l=>l.address?.addressCountry),type:posting.employmentType,postedAt:posting.datePosted,expiresAt:posting.validThrough,url:listing.url};
}
export async function collectMicrosoftFallback(source,primary,{request,pool,parseMSR}){
  const candidates=new Map(),jobs=new Map((primary.jobs||[]).map(j=>[j.id,j]));let boardComplete=false,boardError='',scanned=primary.scanned||0;
  for(const j of source.previousJobs||[])if(INTERNSHIP.test(j.title))candidates.set(j.url,{...j,id:j.id.replace(/^microsoft:/,'')});
  try{
    let url='https://www.microsoft.com/en-us/research/careers/open-positions/?sort_by=most-recent';const pages=new Set();let count=0;
    while(url&&count++<30){
      if(pages.has(url))throw new Error('MSR pagination repeated');pages.add(url);
      const result=parseMSR(await(await request(url)).text());
      if(!result.jobs.length)throw new Error('MSR public board temporarily unavailable');scanned+=result.jobs.length;
      for(const j of result.jobs)if(INTERNSHIP.test(j.title))candidates.set(j.url,{...j,id:j.url.match(/\/job\/(\d+)/)?.[1]});
      url=result.next?new URL(result.next,url).href:null;
    }
    if(url)throw new Error('MSR page limit reached');boardComplete=true;
  }catch(e){boardError=e.message;}
  let checked=0,failed=0;
  await pool([...candidates.values()].slice(0,100),2,async j=>{try{const raw=parseOfficialJobPosting(await(await request(j.url)).text(),j);jobs.set(raw.id,raw);checked++;}catch{failed++;}});
  // Successful detail checks establish availability for those exact postings. They
  // never establish that a failed company-wide search discovered every new role.
  const coverage=`Microsoft primary careers search limited: ${primary.error||'incomplete'}. ${checked} official posting pages reverified; ${boardComplete?'MSR research board checked; broader discovery remains partial.':boardError+'.'}${failed?' '+failed+' detail checks unavailable.':''}`;
  return {source,jobs:[...jobs.values()],scanned,complete:false,error:coverage};
}
