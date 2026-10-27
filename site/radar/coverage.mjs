// Official, public employer APIs only. No model calls, account cookies or paid API.
import {setTimeout as delay} from 'node:timers/promises';
export const INTERNSHIP=/\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher)\b/i;
export const queriesFor=source=>source.adapter==='google'?['intern','student researcher']:['intern'];
export async function requestOfficial(url,body,extra={},options={}) {
  const fetcher=options.fetcher||fetch, sleep=options.sleep||delay;
  for(let attempt=0;attempt<4;attempt++){
    const response=await fetcher(url,{method:body?'POST':'GET',headers:{'user-agent':'Mozilla/5.0',accept:'application/json,text/html;q=0.9,*/*;q=0.8',...(body?{'content-type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(response.ok)return response;
    if(![429,500,502,503,504].includes(response.status)||attempt===3)throw new Error(`Official source returned HTTP ${response.status} after ${attempt+1} attempt(s)`);
    const retry=Number(response.headers.get('retry-after'));
    await response.body?.cancel();
    await sleep(Math.min(30000,Math.max(1500*2**attempt,Number.isFinite(retry)?retry*1000:0)));
  }
}
function replaceRequired(text,before,after,label){if(!text.includes(before))throw new Error(`Upstream ${label} changed; previous feed preserved`);return text.replace(before,after);}
export function patchAdapters(text){
  text="import {requestOfficial,collectExtendedOfficial,INTERNSHIP} from './coverage.mjs';\n"+text;
  text=replaceRequired(text,"export async function request(url, body) {","export async function request(url, body) { return requestOfficial(url,body);\n/*",'request');
  text=replaceRequired(text,'export async function pool(items, limit, fn) {','*/}\nexport async function pool(items, limit, fn) {','request boundary');
  text=replaceRequired(text,'export async function collectSource(source) {',`export async function collectSource(source) {
  const deadline=Date.now()+240000;
  const request=(url,body,headers)=>{if(Date.now()>deadline)throw new Error('Source time budget reached; coverage is partial');return requestOfficial(url,body,headers);};
  if(['ibm','tiktok','bytedance','workday'].includes(source.adapter))return collectExtendedOfficial(source,{request,pool});`,'collector');
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
export async function collectExtendedOfficial(source,{request,pool}){
  const jobs=[],issues=[],visited=new Set();let scanned=0;
  try{
    if(source.adapter==='workday'){
      const base=`https://${source.host}/wday/cxs/${source.tenant}/${source.board}`;
      const initial=await(await request(base+'/jobs',{limit:20,offset:0,searchText:'intern',appliedFacets:{}})).json();
      if(!Array.isArray(initial.jobPostings)||!Number.isFinite(initial.total))throw new Error('Workday search format changed');
      // Workday reports total=0 after page one. Preserve the first total.
      // An official Intern worker-type facet avoids matching "internal" in full-time descriptions.
      const facet=initial.facets?.find(f=>f.facetParameter==='workerSubType'&&f.values?.some(v=>/^intern(?:ship)?(?:\s|\(|$)/i.test(v.descriptor)));
      const internTypes=facet?.values.filter(v=>/^intern(?:ship)?(?:\s|\(|$)/i.test(v.descriptor)).map(v=>v.id);
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
      const headers={'accept-language':'en-US','website-path':source.adapter==='tiktok'?'tiktok':'en'};
      let offset=0,total=Infinity;
      while(offset<total&&offset<20000){
        const data=await(await request(base+'/search/job/posts',{keyword:'intern',limit:100,offset},headers)).json();
        const rows=data.data?.job_post_list;total=data.data?.count;
        if(data.code!==0||!Array.isArray(rows)||!Number.isFinite(total))throw new Error('Official supplier search format changed');
        const ids=rows.map(r=>r.id).join(',');if((!rows.length&&offset<total)||(ids&&visited.has(ids)))throw new Error('Official supplier pagination repeated or ended early');visited.add(ids);
        scanned+=rows.length;for(const row of rows)if(INTERNSHIP.test(row.title+' '+row.recruit_type?.en_name))jobs.push(parseSupplierJob(row,source));
        offset+=rows.length;
      }
      if(offset<total)throw new Error('Official supplier page limit reached; coverage is partial');
    }
  }catch(e){issues.push(e.message);}
  return {source,jobs,scanned,complete:!issues.length,error:issues.join('; ')};
}
