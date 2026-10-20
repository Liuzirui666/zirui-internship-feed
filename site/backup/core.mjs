export const SCOPES = {
  applications: 'zirui-internship-radar:v1',
  learning: 'zirui-research-atlas:v1',
  contacts: 'zirui-research-contacts:v1',
};
const own = (o, k) => Object.hasOwn(o, k);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const safeKey = k => typeof k === 'string' && k.length <= 1200 && !['__proto__','prototype','constructor'].includes(k);
export const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export const sameEntries = (a,b) => Object.keys(a).length===Object.keys(b).length && Object.entries(a).every(([k,v])=>own(b,k)&&same(v,b[k]));
export const emptyDocument = () => ({format:'zirui-private-progress',version:1,entries:{}});
const encode = parts => JSON.stringify(parts);
export function units(scope, data) {
  const result = {};
  if (!object(data)) throw new Error('记录必须为 JSON 对象。');
  const put = (parts, value) => { result[encode(parts)] = value; };
  if (scope !== 'learning') {
    for (const [id,value] of Object.entries(data)) { if(!safeKey(id))throw new Error('记录编号无效。'); put([scope,id],value); }
    return result;
  }
  for (const field of ['version','mock','plan']) if(own(data,field)) put([scope,field],data[field]);
  for (const field of ['settings','reviews','drafts']) {
    for(const [id,value] of Object.entries(data[field] || {})) {
      if(!safeKey(id))throw new Error('学习记录编号无效。'); put([scope,field,id],value);
    }
  }
  for(const id of data.bookmarks || []) put([scope,'bookmarks',id],id);
  for(const item of data.mistakes || []) put([scope,'mistakes',item.id],item);
  for(const item of data.history || []) put([scope,'history',`${item.id}:${item.at}:${item.rating}`],item);
  return result;
}
// Each application, answer, review, and setting has its own clock. Unrelated
// edits from different devices never replace an entire workspace snapshot.
export function capture(doc, scope, previous, next, device, now=Date.now(), initial=false) {
  const before=previous ? units(scope,previous) : {}, after=units(scope,next);
  const entries={...doc.entries};
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(own(before,key) && own(after,key) && same(before[key],after[key]))continue;
    let at=now;
    if(initial) {
      const value=after[key];
      at=scope==='applications' ? (Date.parse(value?.updatedAt)||0) : scope==='learning' && key.includes('"reviews"') ? (value?.lastReviewed||0) : 0;
    }
    const entry={at,device,deleted:!own(after,key)};
    if(!entry.deleted)entry.value=after[key];
    const old=entries[key];
    if(!old || !initial || at>old.at)entries[key]=entry;
  }
  return {...doc,entries};
}
function validJSON(value, depth=0) {
  if(depth>30)throw new Error('备份嵌套过深。');
  if(value===null || typeof value==='string' || typeof value==='boolean')return;
  if(typeof value==='number' && Number.isFinite(value))return;
  if(Array.isArray(value)){for(const v of value)validJSON(v,depth+1);return;}
  if(object(value)){for(const [k,v] of Object.entries(value)){if(!safeKey(k))throw new Error('备份包含无效字段。');validJSON(v,depth+1);}return;}
  throw new Error('备份包含无效 JSON 数据。');
}
export function validateDocument(doc) {
  if(!object(doc)||doc.format!=='zirui-private-progress'||doc.version!==1||!object(doc.entries))throw new Error('GitHub 备份格式不兼容，未覆盖本地数据。');
  const entries=Object.entries(doc.entries);
  if(entries.length>100000 || JSON.stringify(doc).length>4000000)throw new Error('备份超出大小限制。');
  for(const [key,e] of entries){
    let path;try{path=JSON.parse(key);}catch{throw new Error('备份字段路径无效。');}
    if(!Array.isArray(path)||path.length<2||path.length>3||!own(SCOPES,path[0])||!path.every(safeKey))throw new Error('备份字段路径无效。');
    if(path[0]!=='learning' && path.length!==2)throw new Error('备份字段路径无效。');
    if(path[0]==='learning' && !['version','mock','plan','settings','reviews','drafts','bookmarks','mistakes','history'].includes(path[1]))throw new Error('未知学习记录类型。');
    if(!object(e)||!Number.isFinite(e.at)||e.at<0||typeof e.device!=='string'||e.device.length>100||typeof e.deleted!=='boolean'||(!e.deleted&&!own(e,'value')))throw new Error('备份时间或内容无效。');
    if(!e.deleted)validJSON(e.value);
  }
  return doc;
}
export function merge(local, remote) {
  validateDocument(local);validateDocument(remote);
  const entries={...local.entries};
  for(const [key,e] of Object.entries(remote.entries)){
    const old=entries[key];
    // A deterministic tie-break makes concurrent retries converge.
    if(!old || e.at>old.at || (e.at===old.at && `${e.device}:${JSON.stringify(e)}`>`${old.device}:${JSON.stringify(old)}`))entries[key]=e;
  }
  return {...emptyDocument(),entries};
}
export function materialize(doc) {
  validateDocument(doc);
  const out={};
  const arrayFields=['bookmarks','mistakes','history'];
  for(const [key,e] of Object.entries(doc.entries)){
    const [scope,field,id]=JSON.parse(key);
    if(e.deleted)continue;
    if(!out[scope])out[scope]={};
    if(scope!=='learning' || !id){out[scope][field]=e.value;continue;}
    if(!out[scope][field])out[scope][field]=arrayFields.includes(field)?[]:{};
    if(Array.isArray(out[scope][field]))out[scope][field].push(e.value);
    else out[scope][field][id]=e.value;
  }
  if(out.learning){
    for(const f of ['reviews','drafts'])out.learning[f] ||= {};
    for(const f of arrayFields)out.learning[f] ||= [];
    out.learning.history.sort((a,b)=>a.at-b.at);
    out.learning.mistakes.sort((a,b)=>a.at-b.at);
    out.learning.bookmarks.sort();
    out.learning.mock ??= null;out.learning.plan ??= null;
  }
  // A whole scope may have been deliberately emptied; retain its tombstones.
  for(const key of Object.keys(doc.entries)){
    const [scope]=JSON.parse(key);
    if(!out[scope] && scope!=='learning')out[scope]={};
  }
  return out;
}
export const encodeContent = text => {
  const bytes=new TextEncoder().encode(text);let s='';
  for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
};
export const decodeContent = text => new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0)));

export class GitHubStore {
  constructor({token,owner='Liuzirui666',repo='zirui-private-progress',fetcher=fetch}){this.token=token;this.owner=owner;this.repo=repo;this.fetcher=fetcher;}
  async request(path,init={}) {
    const response=await this.fetcher(`https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`,{...init,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','Authorization':`Bearer ${this.token}`,'X-GitHub-Api-Version':'2026-03-10',...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
    if(response.status===401)throw new Error('GitHub 授权已失效。重新连接即可，云端记录仍保留。');
    if(response.status===403)throw new Error('GitHub 暂不允许访问。请检查该私有仓库的 Contents 读写权限，或稍后重试。');
    return response;
  }
  async privateRepository() {
    const r=await this.request('');if(!r.ok)throw new Error('无法访问私有备份仓库，请确认授权已选中 zirui-private-progress。');
    const info=await r.json();
    if(info.private!==true || info.owner?.login?.toLowerCase()!==this.owner.toLowerCase())throw new Error('备份目标不是你的私有仓库，已停止上传。');
  }
  async read() {
    const r=await this.request('/contents/progress.json');
    if(r.status===404)return {doc:emptyDocument(),sha:null,exists:false};
    if(!r.ok)throw new Error(`读取 GitHub 失败（${r.status}），未覆盖任何记录。`);
    const file=await r.json();
    if(file.encoding!=='base64'||typeof file.content!=='string'||file.size>4000000)throw new Error('GitHub 备份文件无法读取，未覆盖本地数据。');
    return {doc:validateDocument(JSON.parse(decodeContent(file.content))),sha:file.sha,exists:true};
  }
  async sync(getLocal) {
    await this.privateRepository();
    for(let attempt=0;attempt<3;attempt++){
      const remote=await this.read(),doc=merge(getLocal(),remote.doc);
      if(sameEntries(doc.entries,remote.doc.entries))return {doc,uploaded:false,exists:remote.exists};
      const savedAt=new Date().toISOString();
      const content=JSON.stringify({...doc,savedAt},null,2)+'\n';
      if(new TextEncoder().encode(content).length>950000)throw new Error('备份接近 GitHub 文件读取上限，请导出完整备份后整理较旧记录。');
      const r=await this.request('/contents/progress.json',{method:'PUT',body:JSON.stringify({message:'Save private research and application progress',content:encodeContent(content),...(remote.sha?{sha:remote.sha}:{})})});
      if(r.status===409 || r.status===422){if(attempt<2)continue;throw new Error('另一台设备正在保存。记录仍在本地，稍后会自动重试。');}
      if(!r.ok)throw new Error(`GitHub 保存失败（${r.status}）。修改仍保留在本地。`);
      return {doc,uploaded:true,exists:true,savedAt};
    }
  }
}
