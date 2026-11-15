import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Browser plugin not available; use the repository's isolated Playwright Chrome.
const root=fileURLToPath(new URL('../../',import.meta.url));
const harness=(await build({stdin:{contents:"export {renderArtwork} from './src/drawing.js'; export {resultImage} from './src/sharing.js'; export {drawingStorage} from './src/storage.js';",resolveDir:root},bundle:true,format:'esm',write:false})).outputFiles[0].text;
const ink=page=>page.locator('#drawing-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).reduce((n,v,i)=>n+(i%4!==3&&v<120),0));
async function gesture(page,{hold=false,offset=0}={}){
  const r=await page.locator('#drawing-canvas').boundingBox();
  await page.mouse.move(r.x+r.width*.73,r.y+r.height*(.4+offset));await page.mouse.down();
  for(let i=0;i<60;i++)await page.mouse.move(r.x+r.width*(.5+.23*Math.cos(i/13)),r.y+r.height*(.4+offset+.17*Math.sin(i/13)));
  if(!hold)await page.mouse.up();
}
test.beforeEach(async({page})=>{
  await page.route('**/api/analytics/**',route=>route.fulfill({status:204}));
  await page.route('**/__qa/studio.js',route=>route.fulfill({contentType:'text/javascript',body:harness}));
  await page.emulateMedia({reducedMotion:'reduce'});
});

for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:844},{width:768,height:1024}]){
  test(`visible ink, undo, two effects and stable completion ${viewport.width}`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.setViewportSize(viewport);await page.goto('/zh-Hans/?studio=1');
    await expect(page.locator('[data-mode=paint]')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#brush')).toHaveValue('ghostGlow');
    await expect(page.locator('#finish-painting')).toBeDisabled();
    const canvas=page.locator('#drawing-canvas'),before=await canvas.boundingBox(),blank=await ink(page);
    expect(before.y+before.height).toBeLessThanOrEqual(viewport.height);
    await gesture(page,{hold:true});await expect.poll(()=>ink(page)).toBeGreaterThan(blank+100);
    await page.mouse.up();const first=await canvas.evaluate(c=>c.toDataURL());
    await page.locator('#edit-actions button').nth(0).click();expect(await ink(page)).toBe(blank);
    await page.locator('#edit-actions button').nth(1).click();expect(await canvas.evaluate(c=>c.toDataURL())).toBe(first);
    await page.locator('#brush').selectOption('duotone');await gesture(page,{offset:.16});
    await page.locator('#drawing-title').fill('会发光的晚风');
    await page.locator('#drawing-title').evaluate(e=>e.blur());
    const complete=await canvas.evaluate(c=>c.toDataURL());
    await page.screenshot({path:`/tmp/ghostdraw-studio-paint-${viewport.width}.png`});
    await page.locator('#finish-painting').click();await expect(page.locator('#draw-panel')).toHaveAttribute('data-state','revealed');
    expect(await canvas.boundingBox()).toEqual(before);expect(await canvas.evaluate(c=>c.toDataURL())).toBe(complete);
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'分享',exact:true})).toBeEnabled();
    await page.locator('.game-tabs [data-tab=gallery]').click();await expect(page.locator('#gallery-items .artwork-card')).toHaveCount(1);
    await page.locator('#gallery-items .artwork-open').click();await expect(page.getByRole('heading',{name:'会发光的晚风',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  });
}

test('studio draft restores visibly; cancelling a mode switch preserves strokes',async({page})=>{
  await page.goto('/zh-Hans/?studio=1');await expect(page.locator('#finish-painting')).toBeVisible();
  await page.locator('#brush').selectOption('duotone');await page.locator('#drawing-title').fill('继续我的双色画');await gesture(page);
  const pixels=await ink(page);await page.locator('[data-mode=free]').click();await expect(page.locator('dialog')).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();expect(await ink(page)).toBe(pixels);
  await expect(page.locator('[data-mode=paint]')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(async()=>{const {drawingStorage}=await import('/__qa/studio.js');return (await drawingStorage.loadDraft())?.mode;})).toBe('paint');
  await page.goto('/zh-Hans/');await expect(page.getByRole('heading',{name:'继续上次的绘画？'})).toBeVisible();
  await page.getByRole('button',{name:'继续绘画',exact:true}).click();
  await expect(page.locator('#drawing-title')).toHaveValue('继续我的双色画');expect(await ink(page)).toBe(pixels);
  await page.locator('[data-mode=free]').click();await page.getByRole('button',{name:'丢弃',exact:true}).click();
  await expect(page.locator('#reveal')).toBeVisible();const blank=await ink(page);await gesture(page);expect(await ink(page)).toBe(blank);
  await page.locator('#reveal').click();await expect(page.locator('dialog')).toBeVisible();expect(await ink(page)).toBeGreaterThan(blank);
});

test('both inks retain exact pixels in payload, replay and PNG; link upload is reused',async({page})=>{
  let payload,uploads=0;const id='d10d0785-ef84-4d03-b79f-c1e850e72555';
  await page.route('**/api/replays',async route=>{uploads++;payload=route.request().postDataJSON().payload;
    expect(payload.strokes).toHaveLength(4);expect(payload.strokes.every(s=>['smooth','neon'].includes(s.brush))).toBe(true);
    await route.fulfill({status:201,json:{id},headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto('/zh-Hans/?studio=1');await expect(page.locator('#finish-painting')).toBeVisible();await gesture(page);
  await page.locator('#brush').selectOption('duotone');await gesture(page,{offset:.16});await page.locator('#finish-painting').click();
  await expect(page.locator('#draw-panel')).toHaveAttribute('data-state','revealed');
  await page.getByRole('button',{name:'分享',exact:true}).click();await page.getByRole('button',{name:'分享链接',exact:true}).click();
  await expect(page.locator('.link-field')).toBeVisible();const link=await page.locator('.link-field').inputValue();
  const evidence=await page.evaluate(async payload=>{
    const {renderArtwork,resultImage,drawingStorage}=await import('/__qa/studio.js');
    const record=(await drawingStorage.list())[0],config=JSON.parse(document.getElementById('game-config').textContent);
    const canvas=()=>Object.assign(document.createElement('canvas'),{width:480,height:640}),local=canvas(),shared=canvas();
    renderArtwork(local,record,{fit:1});renderArtwork(shared,payload,{fit:1});
    const file=await resultImage(record,{...config.copy,paintingVerdict:'Test'},config.config),bitmap=await createImageBitmap(file);
    const png=Object.assign(document.createElement('canvas'),{width:bitmap.width,height:bitmap.height});png.getContext('2d').drawImage(bitmap,0,0);
    const image=Object.assign(document.createElement('canvas'),{width:648,height:864});renderArtwork(image,record,{fit:.92});
    const expected=image.getContext('2d').getImageData(0,0,648,864).data,actual=png.getContext('2d').getImageData(36,180,648,864).data;
    return {same:local.toDataURL()===shared.toDataURL(),png:{width:bitmap.width,height:bitmap.height,type:file.type,sameArtwork:expected.every((v,i)=>v===actual[i])}};
  },payload);
  expect(evidence.same).toBe(true);expect(evidence.png).toEqual({width:720,height:1200,type:'image/png',sameArtwork:true});
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'分享',exact:true}).click();
  await page.getByRole('button',{name:'分享链接',exact:true}).click();await expect(page.locator('.link-field')).toHaveValue(link);expect(uploads).toBe(1);
  await page.route(`**/r/${id}/payload.json`,route=>route.fulfill({status:200,json:payload,headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.goto(link);await expect(page.locator('dialog canvas')).toBeVisible();
  await expect.poll(()=>page.locator('dialog canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).filter((v,i)=>i%4!==3&&v<120).length)).toBeGreaterThan(100);
  expect(await page.evaluate(async payload=>{const {renderArtwork}=await import('/__qa/studio.js');const expected=Object.assign(document.createElement('canvas'),{width:480,height:640});renderArtwork(expected,payload);return expected.toDataURL()===document.querySelector('dialog canvas').toDataURL();},payload)).toBe(true);
});

test('studio fits every language in light and dark modes',async({page})=>{
  const languages=JSON.parse(await readFile(new URL('../../content/site-copy.json',import.meta.url),'utf8'));
  for(const colorScheme of ['light','dark'])for(const width of [320,768]){
    await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:1024});
    for(const language of languages){
      await page.goto(`/${language.path?language.path+'/':''}?studio=1`);await expect(page.locator('#finish-painting')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(await page.locator('.mode-controls button').evaluateAll(items=>items.every(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1))).toBe(true);
      expect(await page.locator('body').innerText()).not.toContain('undefined');
    }
  }
  await page.goto('/zh-Hans/?studio=1');await gesture(page);await page.screenshot({path:'/tmp/ghostdraw-studio-dark-768.png'});
});
