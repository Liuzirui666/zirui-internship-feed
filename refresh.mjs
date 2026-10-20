import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'internship-feed-'));
execFileSync('git',['clone','--quiet','--depth=1','--filter=blob:none','--sparse','https://github.com/jrohsc/jrohsc.github.io.git',dir],{stdio:'inherit'});
execFileSync('git',['-C',dir,'sparse-checkout','set','jobs-source'],{stdio:'inherit'});
const cwd=join(dir,'jobs-source');
execFileSync('npm',['ci','--omit=dev','--no-audit','--no-fund'],{cwd,stdio:'inherit'});
let model=await readFile(join(cwd,'model.mjs'),'utf8');
const start=model.indexOf('const RULES = {'),end=model.indexOf('\n};',start)+3;
if(start<0||end<3)throw new Error('Upstream model changed; preserving last feed');
model=model.slice(0,start)+String.raw`const RULES = {
 'LLM Security': /\b(?:prompt injection|jailbreak\w*|LLM security|model security|AI security|adversarial (?:machine learning|AI|robustness)|red[- ]team\w*)\b/i,
 'AI Safety': /\b(?:AI safety|responsible AI|trustworthy AI|safeguards|AI alignment|model alignment|interpretability|safety (?:evaluation|oversight)|frontier risk|AI risk|RLHF)\b/i,
 'Agentic Systems': /\b(?:multi[- ]agent|agentic|LLM agents?|AI agents?|agent (?:safety|security|systems?|framework|evaluation|orchestration)|tool[- ]use)\b/i,
 'Reinforcement Learning': /\b(?:reinforcement learning|policy gradient|PPO|contextual bandit|online learning|RLHF|RLVR)\b/i,
 'Software Security': /\b(?:fuzzing|fuzzers?|vulnerability research|software security|memory safety|binary security|vulnerability discovery|cybersecurity research)\b/i,
 'Program Analysis': /\b(?:program analysis|binary analysis|reverse engineering|static analysis|dynamic analysis|symbolic execution|interprocedural|formal verification)\b/i,
};`+model.slice(end);
model=model.replace("['AI Security', 'AI Safety', 'Privacy']","['LLM Security', 'AI Safety']").replaceAll("'AI Research'","'ML Research'");
model=model.replace('if (!title || !url || !isUS(location, raw.countries)) return null;','if (!title || !url) return null;');
model=model.replace('if (!match.topics.length && research.phdEligible) {','if (false) {');
model=model.replace("if (type === 'Other') return null;",String.raw`if(type!=='Internship'||!/\b(?:intern(?:s|ship(?:s)?)?|co-?op|student researcher)\b/i.test(title+' '+(raw.type||'')))return null;`);
model=model.replace('...match, research, excerpt:',"...match, research, us:isUS(location,raw.countries), priorityScore:(isUS(location,raw.countries)?1000:0)+(research.phdEligible?300:research.isResearch?150:0)+match.score, excerpt:");
await writeFile(join(cwd,'model.mjs'),model);
let adaptersText=await readFile(join(cwd,'adapters.mjs'),'utf8');
const adapterAnchor='export async function collectSource(source) {';
if(!adaptersText.includes(adapterAnchor))throw new Error('Upstream adapter changed');
adaptersText=adaptersText.replace(adapterAnchor,"const requestOriginal=request;\nexport async function collectSource(source) {\nconst deadline=Date.now()+90000;\nconst request=(url,body)=>{if(Date.now()>deadline)throw new Error('Source time budget reached; coverage is partial');return requestOriginal(url,body);};");
await writeFile(join(cwd,'adapters.mjs'),adaptersText);

let sourcesText=await readFile(join(cwd,'sources.mjs'),'utf8');
sourcesText=sourcesText.replace(/queries: \[[^\]]*\]/g,"queries: ['PhD intern','research intern','software engineering intern','reinforcement learning intern','AI security intern','program analysis intern']");
await writeFile(join(cwd,'sources.mjs'),sourcesText);
const {sources}=await import(pathToFileURL(join(cwd,'sources.mjs')));
const {collectSource,pool}=await import(pathToFileURL(join(cwd,'adapters.mjs')));
const {mergeSnapshot}=await import(pathToFileURL(join(cwd,'model.mjs')));
let previous;try{previous=JSON.parse(await readFile('data.json','utf8'));}catch{}
const results=await pool(sources,4,async source=>{console.log('Scanning '+source.name);const r=await collectSource(source);console.log(source.name+': '+r.jobs.length+' rows; '+(r.complete?'complete':r.error));return r;});
const snapshot=mergeSnapshot(previous,results,new Date().toISOString());
snapshot.refreshMinutes=5;snapshot.region='US first; internships only';
snapshot.scheduler={provider:'GitHub Actions',cadenceMinutes:5,runId:process.env.GITHUB_RUN_ID||null,repository:process.env.GITHUB_REPOSITORY||'Liuzirui666/zirui-internship-feed'};
if(!snapshot.sources.some(s=>['ok','partial'].includes(s.status)))throw new Error('All sources failed; previous snapshot preserved');
if(snapshot.jobs.some(j=>j.type!=='Internship'))throw new Error('Internship-only check failed');
const body=JSON.stringify(snapshot);
await writeFile('data.json',body);
await writeFile('manifest.json',JSON.stringify({schemaVersion:1,revision:createHash('sha256').update(body).digest('hex'),updatedAt:snapshot.updatedAt,refreshMinutes:5,pollSeconds:30}));
console.log(JSON.stringify({jobs:snapshot.jobs.length,sources:snapshot.sources.length,updatedAt:snapshot.updatedAt}));
