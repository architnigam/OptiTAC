import { chromium } from 'file:///C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'], {stdio:'ignore',windowsHide:true});
process.on('exit',()=>server.kill());
for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:5174');break;}catch{await new Promise(r=>setTimeout(r,250));}}
const browser = await chromium.launch({headless:true, channel:"msedge"});
const page = await browser.newPage({viewport:{width:1440,height:1100}, deviceScaleFactor:1});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5174');
await page.getByRole('button',{name:'Compile & investigate'}).click();
await page.getByText('All recorded checkpoints preserve').waitFor();
await page.getByRole('button',{name:'logs',exact:true}).click();
await page.getByRole('navigation',{name:'Log steps',exact:true}).waitFor();
await page.getByText('REWRITE 1 / INSTRUCTION #2',{exact:true}).waitFor();
await page.getByRole('button',{name:'Step 2: Constant folding, round 1',exact:true}).click();
await page.getByText('Both operands are compile-time constants.').first().waitFor();
await page.getByRole('button',{name:'Next log step',exact:true}).click();
await page.getByText('STEP 3 OF 20',{exact:true}).waitFor();
await page.getByRole('button',{name:'autopsy',exact:true}).click();
if(await page.locator('#checkpoint').inputValue()!=='2') throw Error('Log/autopsy selection not synchronized');
await page.getByRole('button',{name:'logs',exact:true}).click();
await page.setViewportSize({width:390,height:844});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Logs mobile overflow');
await page.screenshot({path:'tmp/pdfs/logs-mobile.png',fullPage:true});
await page.setViewportSize({width:1440,height:1100});
await page.screenshot({path:'tmp/pdfs/logs-desktop.png',fullPage:true});
await page.getByRole('button',{name:'autopsy',exact:true}).click();
await page.screenshot({path:'tmp/pdfs/workbench.png',fullPage:true});
await page.getByRole('button',{name:'counterfactual',exact:true}).click();
if(await page.locator('tbody tr').count()!==5) throw Error('Missing omission rows');
await page.getByLabel('Inject a wrong return value').check();
await page.getByRole('button',{name:'Compile & investigate'}).click();
await page.getByText('First divergence: Injected fault').waitFor();
await page.getByRole('button',{name:'autopsy',exact:true}).click();
await page.locator('#checkpoint').selectOption({index:await page.locator('#checkpoint option').count()-1});
await page.screenshot({path:'tmp/pdfs/fault.png',fullPage:true});
const dl=page.waitForEvent('download'); await page.getByRole('button',{name:'Export JSON'}).click();
await (await dl).saveAs('tmp/pdfs/demo-evidence.json');
await page.getByLabel('Inject a wrong return value').uncheck();
await page.locator('#example').selectOption('1');
await page.getByRole('button',{name:'Compile & investigate'}).click();
await page.getByText('error: Division by zero. → error: Division by zero.').waitFor();
await page.locator('#source').fill('return missing;');
await page.getByRole('button',{name:'Compile & investigate'}).click();
await page.getByRole('alert').waitFor();
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'tmp/pdfs/mobile.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Mobile overflow');
if(errors.length) throw Error(errors.join('\n'));
fs.writeFileSync('tmp/pdfs/browser-checks.json',JSON.stringify({desktop:true,mobile:true,omissionRows:5,faultDetection:true,trapPreservation:true,semanticError:true,jsonExport:true,pageErrors:errors},null,2));
await browser.close(); server.kill(); server.unref();
console.log('Browser checks passed: desktop, mobile, omission, fault, trap, error, export.');





