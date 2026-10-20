import {SCOPES,emptyDocument,capture,merge,materialize,validateDocument,units,same,sameEntries,GitHubStore} from './core.mjs';
const META='zirui-github-backup:state:v1', AUTH='zirui-github-backup:credential:v1';
const rawSet=Storage.prototype.setItem, rawRemove=Storage.prototype.removeItem;
const base=new URL('../',import.meta.url);
const repoURL='https://github.com/Liuzirui666/zirui-private-progress';
const tokenURL='https://github.com/settings/personal-access-tokens/new?name=Zirui+private+progress&description=Private+learning+and+application+backup&target_name=Liuzirui666&expires_in=366&contents=write';
let meta, token='', store, timer, busy=false, again=false, applying=false, error='', lastConfirmed='', remoteExists=false, localError='';
const readJSON=(key,fallback)=>{const text=localStorage.getItem(key);return text?JSON.parse(text):fallback;};
try{
  meta=readJSON(META,null);
  if(meta){validateDocument(meta.doc);if(!meta.device||!meta.observed)throw new Error('Invalid metadata');}
}catch{meta=null;localError='本地同步信息损坏；原始学习和申请记录仍保留，可以下载本地备份。';}
meta ||= {device:crypto.randomUUID(),doc:emptyDocument(),observed:{},confirmed:''};
lastConfirmed=meta.confirmed||'';
function clock(){return Object.values(meta.doc.entries).reduce((at,e)=>Math.max(at,e.at+1),Date.now());}
function saveMeta(){rawSet.call(localStorage,META,JSON.stringify({...meta,confirmed:lastConfirmed}));}
function absorb(){
  const other=readJSON(META,null);
  if(other?.doc){meta.doc=merge(meta.doc,other.doc);if(other.confirmed>lastConfirmed){lastConfirmed=other.confirmed;meta.confirmedEntries=other.confirmedEntries;}}
}
function observe(scope,previous,next,initial=false){
  absorb();
  meta.doc=capture(meta.doc,scope,previous,next,meta.device,clock(),initial);
  meta.observed[scope]=next;
  saveMeta();
}
try{
  for(const [scope,key] of Object.entries(SCOPES)){
    const value=readJSON(key,null);if(!value)continue;
    observe(scope,meta.observed[scope]||null,value,!meta.observed[scope]);
  }
  token=localStorage.getItem(AUTH)||sessionStorage.getItem(AUTH)||'';
}catch{localError='浏览器暂时无法保存同步信息；请下载本地备份后重试。';}

// Existing applications keep their own state and validation. Observe only their
// three named data keys; credentials and other browser storage never enter Git.
Storage.prototype.setItem=function(key,value){
  let previous=null;
  const scope=this===localStorage && Object.keys(SCOPES).find(s=>SCOPES[s]===key);
  if(scope)try{previous=readJSON(key,null);}catch{}
  rawSet.call(this,key,value);
  if(scope&&!applying){
    try{
      const next=JSON.parse(value);
      const firstDefault=scope==='learning'&&!previous&&!Object.keys(next.reviews||{}).length&&!(next.history||[]).length&&!Object.keys(next.drafts||{}).length;
      observe(scope,previous,next,firstDefault);localError='';schedule();render();
    }catch{localError='这次修改已留在浏览器，但无法加入 GitHub 备份。请下载本地备份。';render();}
  }
};

const host=document.createElement('div');host.id='zirui-private-backup';
const shadow=host.attachShadow({mode:'open'});
shadow.innerHTML=`<style>
:host{all:initial;font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#293b35}*{box-sizing:border-box}button,input{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:wait;opacity:.6}a{color:#35665c}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #9dbeb1;outline-offset:3px}.pill{position:fixed;z-index:900;bottom:15px;right:18px;border:1px solid #b8c9bf;background:#f7faf7;color:#355d50;border-radius:20px;padding:8px 15px;box-shadow:0 2px 8px #294b3312;font-size:12px}.pill[data-problem=true]{background:#fff8e9;color:#825a21;border-color:#ddc796}dialog{color:#293b35;max-width:570px;width:calc(100% - 28px);max-height:calc(100dvh - 35px);padding:25px;border:1px solid #cbd7cd;border-radius:14px;box-shadow:0 20px 70px #23382f2b;overflow:auto;background:#fafbf8}dialog::backdrop{background:#1f332c44}h2{font-size:21px;letter-spacing:-.4px;font-weight:600;margin:0 32px 8px 0}p{margin:10px 0}.muted{color:#738175;font-size:12px}.close{position:absolute;right:16px;top:16px;border:0;background:transparent;font-size:22px;color:#728475}ol{padding-left:23px;font-size:13px}li{margin:9px 0}code{font-size:12px;background:#edf1e9;padding:2px 5px;border-radius:4px;word-break:break-word}input[type=password]{width:100%;border:1px solid #c7d3c7;background:white;padding:11px;border-radius:7px;margin:7px 0 12px}label{display:block;font-size:13px}.remember{display:flex;gap:8px;align-items:flex-start;margin-bottom:16px}.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}.actions button{border:1px solid #bdcfc1;border-radius:7px;background:white;color:#3b5b49;padding:9px 13px}.actions .primary{background:#426452;color:white;border-color:#426452}.status{padding:12px 14px;background:#edf3eb;border-radius:8px;font-size:13px;margin:16px 0}.status.error{background:#fff3e0;color:#8b5d22}.summary{font-size:12px;margin:12px 0}.summary span{display:inline-block;padding-right:16px}.restore{padding:13px 15px;background:#edf4f0;border:1px solid #b9cebf;border-radius:8px;margin-top:15px}.restore p{margin-top:0;font-size:13px}.footer{border-top:1px solid #dce3d7;padding-top:13px;margin-top:18px;font-size:12px;color:#758372}[hidden]{display:none!important}@media(max-width:600px){.pill{bottom:10px;right:10px;font-size:11px;padding:7px 12px}dialog{padding:20px}.actions button{padding:9px 11px}}</style>
<button class="pill" id="open" type="button">GitHub 备份 · 未连接</button>
<dialog aria-labelledby="backup-title"><button class="close" id="close" type="button" aria-label="关闭 GitHub 备份">×</button>
<h2 id="backup-title">GitHub 私有备份</h2><p class="muted">学习进度、申请与面试记录、联系人备注统一保存。</p>
<p class="muted">保存位置：<a href="${repoURL}" target="_blank" rel="noopener noreferrer">Liuzirui666 / zirui-private-progress ↗</a>（私有）</p>
<div id="status" class="status" role="status" aria-live="polite"></div><div id="summary" class="summary"></div>
<section id="setup"><ol><li><a href="${tokenURL}" target="_blank" rel="noopener noreferrer">在 GitHub 创建专用授权 ↗</a>。Repository access 选 <b>Only select repositories</b>，只勾选 <code>zirui-private-progress</code>。</li><li>Repository permissions 只需 <b>Contents: Read and write</b>（Metadata 只读会自动添加）。点击 Generate token。</li><li>把生成的令牌粘贴到下方，点击连接。令牌只发给 GitHub API，请勿发送到聊天或写进仓库。</li></ol>
<label for="token">GitHub 专用令牌</label><input id="token" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
<label class="remember"><input id="remember" type="checkbox" checked><span>在这台个人设备上保持连接<br><span class="muted">授权保存在此浏览器；清除后可重新授权，GitHub 中的记录仍在。</span></span></label>
<div class="actions"><button id="connect" class="primary" type="button">连接并同步</button></div></section>
<section id="connected" hidden><p class="muted">修改后自动保存；断网时先保留在本地，联网后重试。两站共用此连接。</p><div class="actions"><button class="primary" id="sync" type="button">立即同步</button><button id="disconnect" type="button">断开此设备</button></div></section>
<section id="restore" class="restore" hidden><p>GitHub 中有此浏览器尚未载入的记录。载入时会保留本地副本，并重新加载当前页面；请先保存正在填写的表单。</p><div class="actions"><button id="apply" class="primary" type="button">载入合并后的云端记录</button></div></section>
<div class="footer">只有显示“已与 GitHub 同步”的修改才已有云端副本。清除浏览器数据或换电脑后，重新连接同一仓库并载入记录即可恢复。GitHub 提交历史保留旧版本。<div class="actions"><button id="download" type="button">下载完整本地备份</button><button id="recovery" type="button" hidden>下载载入前的本地副本</button></div></div></dialog>`;
document.body.append(host);
const $=selector=>shadow.querySelector(selector), dialog=$('dialog');
function snapshots(){const out={};for(const [scope,key] of Object.entries(SCOPES)){const data=readJSON(key,null);if(data)out[scope]=data;}return out;}
function differences(){
  try{
    const cloud=materialize(meta.doc), local=snapshots();
    return Object.keys(cloud).filter(scope=>!sameEntries(units(scope,cloud[scope]),units(scope,local[scope]||{})));
  }catch{return [];}
}
function render(){
  const connected=!!token, pending=differences().length>0, dirty=!sameEntries(meta.doc.entries,meta.confirmedEntries||{});
  $('#setup').hidden=connected;$('#connected').hidden=!connected;
  $('#restore').hidden=!connected||!pending||busy;
  $('#open').textContent=busy?'GitHub · 同步中':localError||error?'GitHub · 需处理':!connected?'GitHub 备份 · 未连接':dirty?'GitHub · 待同步':pending?'GitHub · 有记录可载入':lastConfirmed?'GitHub · 已同步':'GitHub · 待同步';
  $('#open').dataset.problem=String(!!(localError||error)||!connected);
  $('#status').textContent=localError||error||(busy?'正在与 GitHub 同步…':!connected?'尚未连接 GitHub。现在的修改仍只保存在此浏览器。':dirty?'新修改已保存到浏览器，等待 GitHub 确认备份。':lastConfirmed?`已与 GitHub 同步 · ${new Date(lastConfirmed).toLocaleString('zh-CN')}`:'连接已准备好，等待首次同步。');
  $('#status').classList.toggle('error',!!(localError||error));
  for(const id of ['sync','connect','apply','disconnect'])$('#'+id).disabled=busy;
  try{
    const data=materialize(meta.doc), apps=Object.keys(data.applications||{}).length, reviews=Object.keys(data.learning?.reviews||{}).length, contacts=Object.keys(data.contacts||{}).length;
    $('#summary').textContent=`备份内容：${apps} 条申请/收藏 · ${reviews} 道已复习题目 · ${contacts} 条联系人记录（含笔记与草稿）`;
  }catch{$('#summary').textContent='';}
  try{$('#recovery').hidden=!localStorage.getItem(META+':recovery');}catch{}
}
function schedule(delay=2500){clearTimeout(timer);if(token)timer=setTimeout(()=>void sync(),delay);}
async function sync(){
  if(!token)return;
  if(busy){again=true;return;}
  busy=true;error='';render();
  try{
    const perform=async()=>{
      absorb();
      const result=await store.sync(()=>{absorb();return meta.doc;});
      // A user can edit while HTTP is in flight; keep those newer local entries.
      absorb();meta.doc=merge(meta.doc,result.doc);remoteExists=result.exists;
      lastConfirmed=new Date().toISOString();meta.confirmedEntries=result.doc.entries;saveMeta();
      if(Object.entries(meta.doc.entries).some(([k,e])=>!same(e,result.doc.entries[k])))again=true;
    };
    if(navigator.locks)await navigator.locks.request('zirui-private-github-sync',perform);else await perform();
  }catch(e){error=e.name==='TimeoutError'?'GitHub 请求超时；记录仍在本地，稍后自动重试。':e.message==='Failed to fetch'?'暂时无法连接 GitHub；记录仍在本地，联网后自动重试。':e.message;}
  finally{busy=false;render();schedule(again?2500:60000);again=false;}
}
function setToken(value,remember=false){
  token=value;store=value?new GitHubStore({token:value}):null;
  rawRemove.call(localStorage,AUTH);rawRemove.call(sessionStorage,AUTH);
  if(value)rawSet.call(remember?localStorage:sessionStorage,AUTH,value);
}
$('#open').addEventListener('click',()=>{render();dialog.showModal();});
$('#close').addEventListener('click',()=>dialog.close());
$('#connect').addEventListener('click',async()=>{
  const value=$('#token').value.trim();
  if(!/^github_pat_[a-zA-Z0-9_]+$/.test(value)){error='请使用 GitHub fine-grained 专用令牌（以 github_pat_ 开头）。';render();return;}
  try{setToken(value,$('#remember').checked);$('#token').value='';await sync();}
  catch{error='无法在这台设备保存授权，请取消“保持连接”后重试。';render();}
});
$('#sync').addEventListener('click',()=>void sync());
$('#disconnect').addEventListener('click',()=>{setToken('');clearTimeout(timer);error='';lastConfirmed='';render();});
function download(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#download').addEventListener('click',()=>{try{download({format:'zirui-workspace-local',version:1,exportedAt:new Date().toISOString(),data:snapshots()},`zirui-workspace-${new Date().toISOString().slice(0,10)}.json`);}catch(e){error=e.message;render();}});
$('#recovery').addEventListener('click',()=>{try{download(readJSON(META+':recovery',{}),'zirui-before-cloud-restore.json');}catch(e){error=e.message;render();}});
async function validatedSnapshots(data){
  const out={};
  if(data.applications){const {validateRecords}=await import(new URL('radar/tracker-state.mjs',base));out.applications=validateRecords(data.applications);}
  if(data.contacts){
    const {validateRecords}=await import(new URL('radar/contacts/state.mjs',base));
    // Record IDs are retained even when a contact is no longer in the current list.
    out.contacts=validateRecords(data.contacts,Object.keys(data.contacts));
  }
  if(data.learning){
    const [{validateImport},curriculum,questions,companies]=await Promise.all([
      import('./atlas-engine.mjs'),...['curriculum','questions','companies'].map(async name=>{const r=await fetch(new URL(`atlas/data/${name}.json`,base));if(!r.ok)throw new Error('无法读取学习资料，请稍后重试恢复。');return r.json();})
    ]);
    out.learning=validateImport(data.learning,questions.map(q=>q.id),curriculum.map(t=>t.id),companies.companies.map(c=>c.id),companies.roles.map(r=>r.id));
  }
  return out;
}
$('#apply').addEventListener('click',async()=>{
  busy=true;error='';render();let original;
  try{
    absorb();const restored=await validatedSnapshots(materialize(meta.doc));original=Object.fromEntries(Object.entries(SCOPES).map(([scope,key])=>[scope,localStorage.getItem(key)]));
    rawSet.call(localStorage,META+':recovery',JSON.stringify({format:'zirui-workspace-local',version:1,exportedAt:new Date().toISOString(),data:snapshots()}));
    applying=true;
    for(const [scope,value] of Object.entries(restored)){rawSet.call(localStorage,SCOPES[scope],JSON.stringify(value));meta.observed[scope]=value;}
    saveMeta();location.reload();
  }catch(e){
    if(original)for(const [scope,value] of Object.entries(original))try{if(value===null)rawRemove.call(localStorage,SCOPES[scope]);else rawSet.call(localStorage,SCOPES[scope],value);}catch{}
    error='载入未完成，原始记录已保留。'+e.message;
  }finally{applying=false;busy=false;render();}
});
window.addEventListener('online',()=>schedule(100));
window.addEventListener('focus',()=>schedule(300));
window.addEventListener('storage',event=>{
  if(event.key===AUTH){token=localStorage.getItem(AUTH)||sessionStorage.getItem(AUTH)||'';store=token?new GitHubStore({token}):null;schedule(500);}
  if(event.key===META)try{absorb();render();}catch{}
});
if(token){store=new GitHubStore({token});schedule(500);}
render();
