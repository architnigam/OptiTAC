import { chromium } from 'file:///C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
fs.mkdirSync('tmp/town',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5182','--strictPort'],{stdio:'ignore',windowsHide:true});
let browser;
try {
  for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:5182');break;}catch{await new Promise(r=>setTimeout(r,250));}}
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5182');
  await page.getByRole('heading',{name:/A little town/}).waitFor();
  if(await page.getByRole('button',{name:/^Visit /}).count()!==8)throw Error('Missing shops');
  await page.screenshot({path:'tmp/town/town.png',fullPage:true});
  await page.locator('.town-map').screenshot({path:'tmp/town/map.png'});
  const visits=[['Token Post','Source tokens'],['Syntax Studio','Raw AST JSON'],['Type Registry','Type rules and numeric conventions'],['TAC Forge','Reading the three instruction kinds'],['Repair Garage','Evidence views'],['Watchtower','Why this comparison matters'],['Scout Office','Held-out evaluation and limitations'],['Challenge Hall','Passport challenge']];
  for(const [name,marker] of visits){
    await page.getByRole('button',{name:'Town map',exact:true}).first().click();
    await page.getByRole('button',{name:new RegExp(`^Visit ${name}:`)}).click();
    await page.getByRole('heading',{name,exact:true}).waitFor();
    if(name==='Repair Garage')await page.getByRole('navigation',{name:marker}).waitFor();
    else if(name==='Challenge Hall') { if(await page.getByRole('region',{name:marker}).count()!==7)throw Error('Missing quests'); }
    else if(name==='Token Post')await page.getByRole('button',{name:/IDENTIFIER crates/}).first().click();
    else await page.getByText(marker,{exact:true}).first().waitFor();
    await page.screenshot({path:`tmp/town/${name.toLowerCase().replaceAll(' ','-')}.png`,fullPage:true});
    if(name==='Scout Office'){
      await page.getByText('Held-out evaluation and limitations',{exact:true}).click();
      await page.getByText('Features extracted from your program',{exact:true}).click();
      const metrics=await page.locator('.feature-list').allTextContents();
      fs.writeFileSync('tmp/town/ml-metrics.txt',metrics.join('\n'));
      await page.locator('.interior-body').screenshot({path:'tmp/town/scout-evaluation.png'});
    }
  }
  // Wrong answer, correction, persistence, and no duplicate awards.
  const first=page.getByRole('region',{name:'Passport challenge'}).first();
  await first.getByRole('button',{name:/B A keyword token/}).click();
  await first.getByRole('status').getByText(/Not quite/).waitFor();
  await first.getByRole('button',{name:/A An identifier token/}).click();
  await first.getByRole('status').getByText(/Stamp earned/).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Token Post: stamp earned'}).waitFor();
  // Detailed optimizer tools.
  await page.getByRole('button',{name:/^Visit Repair Garage:/}).click();
  for(const tab of ['autopsy','counterfactual','structure','logs']){
    await page.getByRole('button',{name:tab,exact:true}).click();
    if(tab==='counterfactual'&&await page.locator('tbody tr').count()!==5)throw Error('Omission rows missing');
  }
  await page.getByText('Execution trace after this pass',{exact:true}).waitFor();
  await page.locator('#checkpoint').selectOption('1');
  await page.getByText('Both operands are compile-time constants.').first().waitFor();
  await page.screenshot({path:'tmp/town/logs.png',fullPage:true});
  // Full pipeline replay, pause and stepping.
  await page.getByRole('button',{name:'Pipeline express',exact:true}).click();
  await page.getByRole('button',{name:'Play journey',exact:true}).click();
  await page.waitForTimeout(1300);
  await page.getByRole('button',{name:'Pause journey',exact:true}).click();
  if(await page.locator('.pipeline-track .current').count()!==1)throw Error('Replay selection lost');
  await page.locator('.pipeline-track button').nth(5).click();
  await page.getByText('Original:  return 30',{exact:false}).waitFor();
  await page.screenshot({path:'tmp/town/pipeline.png',fullPage:true});
  // Frontend errors preserve earlier artifacts.
  await page.locator('#example').selectOption('4');await page.getByRole('button',{name:'Send through town'}).click();
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();
  await page.getByRole('button',{name:/^Visit Syntax Studio:/}).click();await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();
  await page.getByRole('button',{name:/^Visit Token Post:/}).click();
  if(await page.locator('.token-tray button').count()===0)throw Error('Partial tokens lost');
  // Runtime trap, seeded fault, disabled passes.
  await page.locator('#example').selectOption('1');await page.getByRole('button',{name:'Send through town'}).click();
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();
  await page.getByRole('button',{name:/^Visit Watchtower:/}).click();
  await page.getByRole('heading',{name:'error: Division by zero. → error: Division by zero.',exact:true}).waitFor();
  await page.locator('#example').selectOption('0');await page.getByText('Passes & experiments',{exact:true}).click();
  await page.getByLabel('Inject a wrong return (demo)',{exact:true}).check();await page.getByRole('button',{name:'Send through town'}).click();
  await page.getByText('DIVERGENCE DETECTED',{exact:true}).waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export journey evidence'}).click();await(await download).saveAs('tmp/town/experiment.json');
  await page.getByLabel('Inject a wrong return (demo)',{exact:true}).uncheck();
  for(const c of await page.locator('fieldset input').all())await c.uncheck();
  await page.getByRole('button',{name:'Send through town'}).click();
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();await page.getByRole('button',{name:/^Visit Repair Garage:/}).click();
  await page.getByRole('button',{name:'logs',exact:true}).click();await page.getByText('No passes selected. Original TAC remains available in Structure.',{exact:true}).waitFor();
  // Mobile and offline use.
  for(const c of await page.locator('fieldset input').all())await c.check();
  await page.getByRole('button',{name:'Send through town'}).click();
  await page.setViewportSize({width:390,height:844});
  for(const name of ['Town map','Pipeline express','Challenges']) {
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:new RegExp(`^${name}`)}).click();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Mobile overflow: ${name}`);
    await page.screenshot({path:`tmp/town/mobile-${name.toLowerCase().replaceAll(' ','-')}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();await page.getByRole('button',{name:/^Visit Scout Office:/}).click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile scout overflow');
  await page.context().setOffline(true);await page.getByRole('button',{name:'Send through town'}).click();await page.getByRole('heading',{name:/Investigate /}).waitFor();await page.context().setOffline(false);
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync('tmp/town/browser-results.json',JSON.stringify({shops:8,quests:7,desktop:true,mobile:true,passportPersistence:true,quizFeedback:true,replay:true,partialArtifacts:true,logs:true,omissions:true,trap:true,injectedFault:true,export:true,disabledPasses:true,offlineCompilationAndML:true,pageErrors:errors},null,2));
  console.log('Town browser checks passed.');
} finally {await browser?.close();server.kill();server.unref();}
