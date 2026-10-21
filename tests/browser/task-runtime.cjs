const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const net = require('node:net');
(async()=>{
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const home=mkdtempSync(join(tmpdir(),'clawtask-runtime-browser-'));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p',String(port)],{env:{...process.env,HOME:home},stdio:'ignore'});
let browser;
try {
 const baseURL='http://127.0.0.1:'+port;
 let ready=false;
 for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('Isolated server exited');try {if((await fetch(baseURL)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(ready,true,'Isolated server must start');
 browser=await chromium.launch({channel:'chromium',headless:true});let passed=0;
try {for(const width of [1440,390]){
const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});const errors=[];page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
let task={id:'synthetic',issueId:'TEST-001',title:'Synthetic runtime',description:'Short fixture',status:'todo',priority:'medium',assigneeId:null,assigneeType:null,projectId:null,tags:[],subtasks:[],modelOverride:null,thinkingOverride:null,createdAt:'2026-01-01',updatedAt:'2026-01-01'};let reject=false;let writes=[];
await page.addInitScript(()=>{window.EventSource=class {close(){}};});
await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const method=route.request().method();let data=[];let status=200;
if(url.pathname.endsWith('/auth/token'))data={token:'synthetic'};
else if(url.pathname.endsWith('/config'))data={appName:'Fixture'};
else if(url.pathname==='/api/v1/tasks'){
if(method==='POST'){const body=route.request().postDataJSON();writes.push(body);if(reject)status=409;else task={...task,...body};data=task;}else data={tasks:[task],total:1,page:1,limit:500};
}else if(url.pathname.startsWith('/api/v1/tasks/')&&!url.pathname.endsWith('/comments')&&!url.pathname.endsWith('/activity')){
if(method==='PATCH'){const body=route.request().postDataJSON();writes.push(body);if(reject)status=409;else task={...task,...body};}data=task;
}
await route.fulfill({status,json:status===200?{ok:true,data}:{ok:false,error:{code:'REJECTED',message:'Synthetic mutation rejected'}}});});
await page.goto(baseURL+'/');await page.getByRole('button',{name:'New Issue',exact:true}).first().click();
await page.getByPlaceholder('Issue title').fill('Synthetic runtime');
assert.equal(await page.getByLabel('Model mode').inputValue(),'default');assert.equal(await page.getByLabel('Thinking override').inputValue(),'');passed++;
await page.getByLabel('Model mode').selectOption('override');await page.getByLabel('Model override').fill('test/model');await page.getByLabel('Thinking override').selectOption('high');
reject=true;await page.getByRole('button',{name:'Create Issue',exact:true}).click();await page.getByText('Synthetic mutation rejected',{exact:true}).waitFor();assert.equal(task.modelOverride,null);passed++;
reject=false;await page.getByRole('button',{name:'Create Issue',exact:true}).click();await page.waitForURL('**/issues/**');
assert.equal(task.modelOverride,'test/model');assert.equal(task.thinkingOverride,'high');passed++;
if(width<768)await page.getByTitle('Show properties').click();
await page.getByRole('button',{name:'Edit runtime'}).click();await page.getByLabel('Model mode').selectOption('default');await page.getByLabel('Thinking override').selectOption('');
reject=true;await page.getByRole('button',{name:'Save runtime'}).click();await page.getByRole('alert').filter({hasText:'Synthetic mutation rejected'}).waitFor();assert.equal(task.modelOverride,'test/model');passed++;
reject=false;await page.getByRole('button',{name:'Save runtime'}).click();await page.getByRole('button',{name:'Edit runtime'}).waitFor();assert.deepEqual(writes.at(-1),{modelOverride:null,thinkingOverride:null});passed++;
await page.reload();if(width<768)await page.getByTitle('Show properties').click();await page.getByText('Model: Default · Thinking: Default',{exact:true}).waitFor();assert.deepEqual(errors,[]);passed++;
await page.close();
}console.log(JSON.stringify({passed,failed:0,widths:[1440,390]}));}finally{await browser.close();}
}finally{if(server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}rmSync(home,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
