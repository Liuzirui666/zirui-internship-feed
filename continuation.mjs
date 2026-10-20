import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const EVENT='internship-feed-next';
export function controlOf(input){
  if(!input||typeof input.enabled!=='boolean'||!Number.isInteger(input.intervalSeconds)||input.intervalSeconds<300||input.intervalSeconds>3600||input.intervalSeconds%60)throw new Error('Invalid refresh control. Use an interval of 5–60 whole minutes.');
  return {enabled:input.enabled,intervalSeconds:input.intervalSeconds};
}
export function turnPlan({control,event,payload={},now=Date.now()}){
  const c=controlOf(control);if(!c.enabled)return {...c,waitMs:0};
  let target=now;
  if(event==='repository_dispatch'){
    target=Date.parse(payload.notBefore);
    if(!Number.isFinite(target)||target>now+c.intervalSeconds*1000+60000)throw new Error('Invalid continuation timestamp.');
  }
  return {...c,waitMs:Math.max(0,target-now)};
}
export function nextEvent({startedAt,intervalSeconds,runId}){
  const at=Date.parse(startedAt);
  if(!Number.isFinite(at)||!Number.isInteger(intervalSeconds)||intervalSeconds<300||intervalSeconds>3600||!/^\d+$/.test(String(runId)))throw new Error('Invalid automatic continuation context.');
  return {event_type:EVENT,client_payload:{notBefore:new Date(at+intervalSeconds*1000).toISOString(),previousRunId:String(runId)}};
}
export async function dispatchNext({repository,token,event,fetcher=globalThis.fetch.bind(globalThis),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(repository!=='Liuzirui666/zirui-internship-feed'||!token)throw new Error('Automatic continuation requires this repository’s GITHUB_TOKEN.');
  if(event.event_type!==EVENT)throw new Error('Unexpected continuation event.');
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetcher(`https://api.github.com/repos/${repository}/dispatches`,{method:'POST',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10'},body:JSON.stringify(event)});
      if(r.status===204)return event.client_payload.notBefore;
      if(r.status<500&&r.status!==429)throw Object.assign(new Error(`GitHub continuation rejected (HTTP ${r.status}).`),{permanent:true});
      throw new Error(`GitHub continuation temporarily unavailable (HTTP ${r.status}).`);
    }catch(error){if(error.permanent||attempt===2)throw error;await sleep(2000*(attempt+1));}
  }
}
async function main(){
  const control=controlOf(JSON.parse(await readFile('refresh-control.json','utf8')));
  if(process.argv[2]==='pace'){
    const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
    const plan=turnPlan({control,event:process.env.GITHUB_EVENT_NAME,payload:event.client_payload});
    if(plan.enabled&&plan.waitMs){console.log(`Waiting ${Math.ceil(plan.waitMs/1000)}s for the next automatic refresh.`);await new Promise(r=>setTimeout(r,plan.waitMs));}
    await appendFile(process.env.GITHUB_OUTPUT,`enabled=${plan.enabled}\nstarted_at=${new Date().toISOString()}\ninterval_seconds=${plan.intervalSeconds}\n`);
    return;
  }
  if(process.argv[2]==='queue'){
    if(!control.enabled){console.log('Automatic refresh is disabled.');return;}
    const event=nextEvent({startedAt:process.env.REFRESH_STARTED_AT,intervalSeconds:control.intervalSeconds,runId:process.env.GITHUB_RUN_ID});
    const nextAt=await dispatchNext({repository:process.env.GITHUB_REPOSITORY,token:process.env.GH_TOKEN,event});
    const message=`Next automatic collection queued for ${nextAt}; predecessor run ${process.env.GITHUB_RUN_ID}.`;
    console.log(message);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,message+'\n');
    return;
  }
  throw new Error('Choose pace or queue.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
