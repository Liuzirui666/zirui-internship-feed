import {cp,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=dirname(fileURLToPath(import.meta.url));
const target=resolve(process.argv[2]);
const base='/zirui-internship-feed/';
await cp(source,join(target,'backup'),{recursive:true});
async function install(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory()&&item.name!=='backup')await install(path);
    else if(item.isFile()&&/\.(html|js|mjs)$/.test(item.name)){
      let html=await readFile(path,'utf8');
      const tag=`<script type="module" src="${base}backup/ui.mjs?v=github-private-v2"></script>`;
      if(item.name.endsWith('.html')){
        if(html.includes('backup/ui.mjs'))html=html.replace(/<script type="module" src="[^" ]*backup\/ui\.mjs[^" ]*"><\/script>/g,tag);
        else html=html.includes('</head>')?html.replace('</head>',tag+'</head>'):tag+html;
      }
      const replacements=[
        ['进展仅保存在此浏览器。关闭网页后仍保留，可导出备份或转移设备。','记录先保存在此浏览器。连接右下角 GitHub 备份后，自动备份到你的私有仓库。'],
        ['此浏览器自动保存 · 备份可转移到其他设备','此浏览器自动保存 · GitHub 备份状态见右下角'],
        ['申请和学习进度只保存在你当前设备的浏览器中，不上传到公开仓库。刷新或关闭网页不会丢失；清除浏览器数据、换浏览器或换设备时，请先导出备份。职位下架不会删除申请记录。','记录先保存到当前浏览器；连接右下角 GitHub 备份后，会自动写入你的私有仓库。清除浏览器数据或换设备后，可重新连接恢复。职位下架不会删除申请记录。'],
        ['Application states stay in this browser.','Use GitHub Backup at the bottom right for private automatic backups.'],
        ['点击保存后，自动保存在此浏览器。','先保存到此浏览器；GitHub 备份状态见右下角。'],
        ['Drafts, notes and contact states stay in this browser.','Connect GitHub Backup at the bottom right to back up drafts, notes and contact states privately.'],
        ['Your progress stays in this browser.','Private backups through GitHub Backup ↘'],
        ["Your records stay in this browser's localStorage. No account or server synchronization is required. Back up your data from Progress before switching devices or clearing browser data.","Your records are saved locally first. Connect GitHub Backup at the bottom right for private automatic backups. Reconnect and restore after clearing browser data or switching devices."],
      ];
      for(const [before,after] of replacements)html=html.replaceAll(before,after);
      html=html.replace('无需登录。你的学习与申请进度只保存在当前浏览器，不上传到公开仓库，关闭网页后仍会保留。换设备或清理浏览器前，请在各站导出备份。职位由 GitHub Actions 自动更新，不需要 AI。','无需登录即可使用。点击右下角“GitHub 备份”，连接你的私有仓库后自动备份学习、申请与联系人记录；清除浏览器数据或换设备后可重新连接恢复。首次连接前记录保存在当前浏览器。职位由 GitHub Actions 自动更新，不需要 AI。');
      await writeFile(path,html);
    }
  }
}
await install(target);
console.log('Installed private GitHub backup controls.');
