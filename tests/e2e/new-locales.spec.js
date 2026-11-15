import {test,expect} from '@playwright/test';

// Browser plugin not available; use the repository's isolated Playwright Chrome.
// Flow: localized home -> visible drawing -> finish -> gallery replay.
for(const locale of ['hi','ar'])for(const width of [390,768,1440]){
  test(`${locale} drawing and gallery at ${width}px`,async({page})=>{
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/api/analytics/**',route=>route.fulfill({status:204}));
    await page.setViewportSize({width,height:width===1440?1000:1024});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`/${locale}/?studio=1`);
    await expect(page).toHaveTitle(/Ghost Draw/);
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    expect(await page.locator('html').evaluate(e=>getComputedStyle(e).direction)).toBe(locale==='ar'?'rtl':'ltr');
    await expect(page.locator('#finish-painting')).toBeVisible();
    const canvas=page.locator('#drawing-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const rect=await canvas.boundingBox();
    await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.3);
    await page.mouse.down();
    for(let i=1;i<=25;i++)await page.mouse.move(rect.x+rect.width*(.2+i*.02),rect.y+rect.height*(.3+i*.01));
    await page.mouse.up();
    const pixels=await canvas.evaluate(c=>c.toDataURL());
    await page.screenshot({path:`/tmp/ghostdraw-web-${locale}-${width}.png`});
    await page.locator('#finish-painting').click();
    await expect(page.locator('#draw-panel')).toHaveAttribute('data-state','revealed');
    expect(await canvas.evaluate(c=>c.toDataURL())).toBe(pixels);
    await page.locator('.game-tabs [data-tab=gallery]').click();
    await expect(page.locator('#gallery-items .artwork-card')).toHaveCount(1);
    await page.locator('#gallery-items .artwork-open').click();
    await expect(page.locator('dialog')).toBeVisible();
    await expect(page.locator('dialog h2')).toContainText(locale==='hi'?'मेरा':'رسمتي');
    await page.screenshot({path:`/tmp/ghostdraw-web-${locale}-${width}-replay.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
