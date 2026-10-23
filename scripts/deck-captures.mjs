import { chromium } from 'file:///C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5183','--strictPort'],{stdio:'ignore',windowsHide:true});
let browser;
try{
 for(let i=0;i<60;i++){try{await fetch('http://127.0.0.1:5183');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:1150}});
 await page.goto('http://127.0.0.1:5183');
 async function crop(file,selector='.destination'){
   await page.evaluate(()=>scrollTo(0,0));
   const box=await page.locator(selector).boundingBox();
   await page.screenshot({path:`tmp/town/${file}.png`,clip:{x:box.x,y:Math.max(box.y,105),width:box.width,height:Math.min(700,box.height)}});
 }
 await page.locator('.town-map').screenshot({path:'tmp/town/map.png'});
 await page.screenshot({path:'tmp/town/town.png',fullPage:true});
 for(const [name,file] of [['Token Post','tokens-crop'],['Syntax Studio','syntax-crop'],['Type Registry','types-crop'],['TAC Forge','tac-crop'],['Scout Office','scout-crop']]){
  await page.getByRole('button',{name:'Town map',exact:true}).first().click();
  await page.getByRole('button',{name:new RegExp(`^Visit ${name}:`)}).click();
  await crop(file);
 }
 await page.getByRole('button',{name:'Pipeline express',exact:true}).click();
 await page.locator('.pipeline-track button').nth(4).click();await crop('pipeline-crop');
 await page.getByRole('button',{name:'Town map',exact:true}).first().click();await page.getByRole('button',{name:/^Visit Repair Garage:/}).click();
 await page.getByRole('button',{name:'logs',exact:true}).click();await page.locator('#checkpoint').selectOption('1');
 await page.locator('.detailed-step').scrollIntoViewIfNeeded();
 const box=await page.locator('.detailed-step').boundingBox();
 await page.screenshot({path:'tmp/town/logs-crop.png',clip:{x:box.x,y:Math.max(0,box.y),width:box.width,height:680}});
 await page.getByRole('button',{name:'Challenges',exact:false}).first().click();await page.evaluate(()=>scrollTo(0,0));
 const quiz=page.getByRole('region',{name:'Passport challenge'}).first();await quiz.screenshot({path:'tmp/town/quiz-crop.png'});
 await page.locator('#example').selectOption('1');await page.getByRole('button',{name:'Send through town'}).click();
 await page.getByRole('button',{name:'Town map',exact:true}).first().click();await page.getByRole('button',{name:/^Visit Watchtower:/}).click();await crop('trap-crop');
 console.log('Presentation captures complete.');
}finally{await browser?.close();server.kill();server.unref();}
