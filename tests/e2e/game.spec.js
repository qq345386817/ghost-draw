import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
const errors=[];
test.beforeEach(async({page})=>{errors.length=0;page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/analytics/**',route=>route.fulfill({status:204}));});
async function draw(page){const c=page.locator('#drawing-canvas'),r=await c.boundingBox();await page.mouse.move(r.x+r.width*.25,r.y+r.height*.3);await page.mouse.down();for(let i=0;i<70;i++)await page.mouse.move(r.x+r.width*(.5+.22*Math.cos(i/11)),r.y+r.height*(.45+.18*Math.sin(i/11)));await page.mouse.up();}
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
test(`blind draw, stable reveal, gallery and privacy ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/zh-Hans/');await expect(page.locator('#drawing-canvas')).toBeVisible();
  const pixels=()=>page.locator('#drawing-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).reduce((n,x,i)=>n+(i%4!==3&&x<120),0));
  const blank=await pixels();await draw(page);expect(await pixels()).toBe(blank);await page.locator('#reveal').scrollIntoViewIfNeeded();const bounds=await page.locator('#drawing-canvas').evaluate(c=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x+scrollX,y:r.y+scrollY};});
  await page.screenshot({path:`/tmp/ghostdraw-web-blind-${viewport.width}.png`,fullPage:false});await page.locator('#reveal').click();await expect(page.locator('dialog')).toBeVisible();expect(await pixels()).toBeGreaterThan(blank+100);expect(await page.locator('#drawing-canvas').evaluate(c=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x+scrollX,y:r.y+scrollY};})).toEqual(bounds);
  await page.screenshot({path:`/tmp/ghostdraw-web-result-${viewport.width}.png`});await page.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.game-tabs [data-tab=gallery]').click();await expect(page.locator('#gallery-items .artwork-card')).toHaveCount(1);await page.locator('#gallery-items .artwork-open').click();await expect(page.locator('dialog canvas')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('#privacy-button').click();await expect(page.locator('#analytics-toggle')).toBeChecked();await page.locator('#analytics-toggle').uncheck();await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await page.locator('#privacy-button').click();await expect(page.locator('#analytics-toggle')).not.toBeChecked();expect(errors).toEqual([]);
});}
test('draft restore asks first and preserves title and data',async({page})=>{await page.goto('/zh-Hans/');await page.locator('#drawing-title').fill('太空里的猫');await draw(page);await page.waitForTimeout(500);await page.reload();await expect(page.getByRole('heading',{name:'继续上次的绘画？'})).toBeVisible();await page.getByRole('button',{name:'继续绘画',exact:true}).click();await expect(page.locator('#drawing-title')).toHaveValue('太空里的猫');await expect(page.locator('#canvas-status')).toContainText('1 笔');expect(errors).toEqual([]);});
test('localized routes, SEO and mobile width',async({page})=>{await page.setViewportSize({width:390,height:844});for(const locale of ['','de','es','fr','ja','ko','pt-BR','ru','zh-Hans','zh-Hant']){await page.goto(`/${locale?locale+'/':''}`);await expect(page.locator('#drawing-canvas')).toBeVisible();expect(await page.locator('link[rel=alternate][hreflang]').count()).toBe(11);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('body').innerText()).not.toContain('undefined');}expect(errors).toEqual([]);});
test('real Featured payloads render and challenge retains the localized prompt',async({page})=>{await page.goto('/zh-Hans/');await expect(page.locator('#featured-preview canvas').first()).toHaveAttribute('aria-label','观看回放');expect(await page.locator('#featured-preview canvas').first().evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).filter((v,i)=>i%4!==3&&v<120).length)).toBeGreaterThan(500);await page.locator('#featured-preview .artwork-open').first().click();await expect(page.getByRole('heading',{name:'画一个幽灵正在审判一块可疑的纸杯蛋糕'})).toBeVisible();await page.getByRole('button',{name:'挑战同题',exact:true}).click();await expect(page.locator('#prompt')).toHaveText('画一个幽灵正在审判一块可疑的纸杯蛋糕');expect(errors).toEqual([]);});
test('one upload is reused for repeated link sharing',async({page})=>{let uploads=0;const id='d10d0785-ef84-4d03-b79f-c1e850e72555';await page.route('**/api/replays',async route=>{uploads++;const body=route.request().postDataJSON();expect(body.payload.strokes.length).toBeGreaterThan(0);expect(body.payload.challengeID).toBe('free-drawing');await route.fulfill({status:201,json:{id,shareURL:`https://ghostdraw-api.luopeike.com/r/${id}`},headers:{'Access-Control-Allow-Origin':'*'}});});await page.goto('/zh-Hans/');await draw(page);await page.locator('#reveal').click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'分享链接',exact:true}).click();await expect(page.locator('.link-field')).toHaveValue(`http://127.0.0.1:8877/zh-Hans/?replay=${id}`);await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'分享',exact:true}).click();await page.getByRole('button',{name:'分享链接',exact:true}).click();await expect(page.locator('.link-field')).toBeVisible();expect(uploads).toBe(1);expect(errors).toEqual([]);});
test('corrupted analytics storage cannot break drawing',async({page})=>{await page.addInitScript(()=>{localStorage.setItem('gd.analytics.queue','{}');localStorage.setItem('gd.analytics.installation','{}');});await page.goto('/zh-Hans/');await expect(page.locator('#drawing-canvas')).toBeVisible();await draw(page);await expect(page.locator('#reveal')).toBeEnabled();expect(errors).toEqual([]);});
test('SEO content and language links are available without JavaScript',async({browser})=>{const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});try{const page=await context.newPage();await page.goto('http://127.0.0.1:8877/zh-Hans/');await expect(page.locator('h1')).toContainText('免费在线盲画小游戏');await page.getByText('这个在线画画小游戏可以免费玩吗？',{exact:true}).click();await expect(page.getByText('可以。网页版免费，无需下载或注册，包含自由绘画、每日题目、本地画廊和回放分享。',{exact:true})).toBeVisible();await page.locator('footer details summary').click();await expect(page.locator('footer a[hreflang=ru]')).toBeVisible();await page.screenshot({path:'/tmp/ghostdraw-seo-no-js-mobile.png',fullPage:true});const russian=await page.locator('footer a[hreflang=ru]').getAttribute('href');expect(russian).toBe('https://ghost-draw.luopeike.com/ru/');await page.goto('http://127.0.0.1:8877'+new URL(russian).pathname);await expect(page.locator('h1')).toContainText('Рисование вслепую');}finally{await context.close();}});

test('mobile tools are reachable and size popover does not move the canvas',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/zh-Hans/');
  const canvas=page.locator('#drawing-canvas'),before=await canvas.boundingBox();
  const action=await page.locator('#reveal').boundingBox();expect(action.y+action.height).toBeLessThan(before.y);expect(before.y+before.height).toBeLessThanOrEqual(844);
  await page.locator('.size-picker summary').click();await expect(page.locator('#size')).toBeVisible();
  await page.locator('#size').fill('15');await expect(page.locator('#brush-size')).toHaveText('15');
  expect(await canvas.boundingBox()).toEqual(before);await page.locator('.size-picker summary').press('Escape');await expect(page.locator('#size')).not.toBeVisible();
  await page.locator('.size-picker summary').click();await page.locator('#size').focus();await page.keyboard.press('Tab');await expect(page.locator('#size')).not.toBeVisible();
  await page.getByRole('button',{name:'午夜',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'午夜',exact:true}).click();await expect(page.getByRole('button',{name:'午夜',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('free and daily title fields occupy the same canvas geometry',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/zh-Hans/');
  const canvas=page.locator('#drawing-canvas'),before=await canvas.boundingBox();
  await page.locator('[data-mode=daily]').click();await expect(page.locator('#prompt')).toBeVisible();await expect(page.locator('.title-field')).not.toBeVisible();expect(await canvas.boundingBox()).toEqual(before);
  await page.locator('[data-mode=free]').click();await expect(page.locator('#drawing-title')).toBeVisible();expect(await canvas.boundingBox()).toEqual(before);expect(errors).toEqual([]);
});

test('all languages fit narrow phone and tablet workbenches',async({page})=>{
  for(const width of [320,768]){await page.setViewportSize({width,height:1024});for(const locale of ['','de','es','fr','ja','ko','pt-BR','ru','zh-Hans','zh-Hant']){
    await page.goto(`/${locale?locale+'/':''}`);await expect(page.locator('#reveal')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const control of await page.locator('#tool-options button').all()){const bounds=await control.boundingBox();expect(bounds.width).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeGreaterThanOrEqual(44);}
  }}expect(errors).toEqual([]);
});

test('dark reveal keeps light paper and stable board dimensions',async({page})=>{
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto('/zh-Hans/');await draw(page);
  const canvas=page.locator('#drawing-canvas'),before=await canvas.boundingBox();await page.locator('#reveal').click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();expect(await canvas.boundingBox()).toEqual(before);
  expect(await canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,1,1).data))).toEqual([250,250,245,255]);await page.screenshot({path:'/tmp/ghostdraw-dark-revealed.png'});expect(errors).toEqual([]);
});

test('Featured title opens the same real replay as the artwork',async({page})=>{
  await page.goto('/zh-Hans/');const title=page.locator('#featured-preview .artwork-title').first(),name=await title.innerText();await title.click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('new scripts tolerate cached standalone width-control markup',async({page})=>{
  const $=load(await readFile(new URL('../../zh-Hans/index.html',import.meta.url),'utf8'));
  $('.size-picker').replaceWith('<label for="size">画笔粗细</label><input id="size" type="range" min="2" max="24" value="7">');
  await page.route('**/zh-Hans/',route=>route.fulfill({contentType:'text/html',body:$.html()}));
  await page.goto('/zh-Hans/');await draw(page);await expect(page.locator('#reveal')).toBeEnabled();expect(errors).toEqual([]);
});

test('mobile size popover stays closed while the catalog is loading',async({page})=>{
  await page.setViewportSize({width:390,height:844});let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  await page.route('**/content/challenges/zh-Hans.json',async route=>{await waiting;await route.continue();});
  try{
    await page.goto('/zh-Hans/',{waitUntil:'commit'});await expect(page.locator('.size-picker')).toBeAttached();
    expect(await page.locator('.size-picker').evaluate(picker=>picker.open)).toBe(false);
  }finally{release();}
  await expect(page.locator('#reveal')).toBeVisible();await expect(page.locator('#size')).not.toBeVisible();expect(errors).toEqual([]);
});
