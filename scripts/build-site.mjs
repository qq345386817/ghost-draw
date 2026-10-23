import {readFile,mkdir,writeFile,cp,rm,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const languages=await read('content/site-copy.json'),native=await read('content/ui-native.json'),extra=await read('content/ui-extra.json'),seoCopy=await read('content/seo.json');
const site='https://ghost-draw.luopeike.com',app='https://apps.apple.com/app/id6773654307';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const href=(language,page='index')=>`${site}/${language.path?language.path+'/':''}${page==='index'?'':page}`;
const out=path.join(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(path.join(out,'assets'),{recursive:true});
await build({entryPoints:[path.join(root,'src/app.js')],bundle:true,minify:true,format:'esm',outfile:path.join(out,'assets/app.js')});
await cp(path.join(root,'src/play.css'),path.join(out,'assets/play.css'));
await cp(path.join(root,'src/no-js.css'),path.join(out,'assets/no-js.css'));
// Keep a returning browser's JS and styles aligned with the published markup.
const assetVersion=createHash('sha256').update(await readFile(path.join(out,'assets/app.js'))).update(await readFile(path.join(out,'assets/play.css'))).digest('hex').slice(0,12);
await cp(path.join(root,'images'),path.join(out,'images'),{recursive:true});
await cp(path.join(root,'favicon/app-icon.png'),path.join(out,'favicon.png'));
await cp(path.join(root,'favicon'),path.join(out,'favicon'),{recursive:true});
for(const file of await readdir(root))if(/^google[a-f0-9]+\.html$/.test(file))await cp(path.join(root,file),path.join(out,file));
await cp(path.join(root,'content'),path.join(out,'content'),{recursive:true});
const llms=[];
for(const language of languages){
  const {code,data:d}=language,seo=seoCopy[code],c={...native[code],...extra[code],seoTitle:seo?.homeTitle,seoDescription:seo?.homeDescription,faq:[...extra[code].faq,...(seo?.faq||[])]};
  if(!native[code]||!extra[code]||!seo)throw new Error('Missing locale '+code);
  for(const key of Object.keys(seoCopy.en))if(seo[key]===undefined)throw new Error(`Missing ${code} SEO field: ${key}`);
  for(const key of Object.keys(extra.en))if(c[key]===undefined)throw new Error(`${code}: ${key}`);
  const config={locale:code,version:'1.0.0',build:'20261009',appName:d.app_name,siteURL:href(language),
    uploadEndpoint:'https://ghostdraw-api.luopeike.com/api/replays',analyticsEndpoint:'https://ghostdraw-api.luopeike.com/api/analytics/events',analyticsDeleteEndpoint:'https://ghostdraw-api.luopeike.com/api/analytics/delete'};
  const selector=`<label class="language-label"><span data-icon="globe"></span><select id="language" aria-label="${esc(d.language)}">${languages.map(l=>`<option value="${esc(href(l))}" ${l.code===code?'selected':''}>${esc(l.label)}</option>`).join('')}</select></label>`;
  const header=`<header class="site-header"><a class="brand" href="${href(language)}"><img src="/favicon.png" width="40" height="40" alt=""><span>${esc(d.app_name)}</span></a>${selector}</header>`;
  const footer=`<footer><a href="${href(language)}">${esc(c.draw)}</a><a href="${href(language,'help')}">${esc(d.nav_help)}</a><a href="${href(language,'support')}">${esc(d.nav_support)}</a><a href="${href(language,'privacy-policy')}">${esc(d.nav_privacy)}</a><button id="privacy-button" class="text-button" type="button">${esc(c.privacyStats)}</button><details class="language-links"><summary>${esc(d.language)}</summary><nav aria-label="${esc(d.language)}">${languages.map(l=>`<a href="${href(l)}" lang="${l.code}" hreflang="${l.code}">${esc(l.label)}</a>`).join('')}</nav></details></footer>`;
  const download=`<a class="button store-button" data-store-link href="${app}" rel="external"><img src="/images/app-store-icon.svg" width="25" height="25" alt="App Store">${esc(d.download_app_store)}</a>`;
  const faq=c.faq.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  for(const page of ['index','help','support','privacy-policy']){
    const game=page==='index',privacy=page==='privacy-policy';
    const title=game?`${d.app_name} | ${c.seoTitle}`:page==='help'?seo.helpTitle:page==='support'?seo.supportTitle:d.privacy_title;
    const description=game?c.seoDescription:page==='help'?seo.helpDescription:privacy?seo.privacyDescription:seo.supportDescription;
    const structured=game?[
      {'@context':'https://schema.org','@type':'WebApplication','@id':site+'/#web-app',name:d.app_name,alternateName:[...new Set(languages.map(l=>l.data.app_name))],url:href(language),description:c.seoDescription,inLanguage:code,applicationCategory:'GameApplication',operatingSystem:'Any',browserRequirements:'Requires JavaScript and a modern browser',isRelatedTo:{'@type':'SoftwareApplication','@id':site+'/#ios-app',name:d.app_name,operatingSystem:'iOS, iPadOS',installUrl:app,sameAs:app},offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}},
      {'@context':'https://schema.org','@type':'FAQPage','@id':href(language)+'#faq',inLanguage:code,mainEntity:c.faq.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))}
    ]:[];
    let body;
    if(game)body=`<nav class="game-tabs" aria-label="${esc(d.index_nav_label)}">${['draw','gallery','featured'].map((tab,i)=>`<button type="button" data-tab="${tab}" ${i===0?'aria-current="page"':''}><span data-icon="${{draw:'pencil',gallery:'gallery',featured:'sparkles'}[tab]}"></span><span>${esc(c[tab])}</span></button>`).join('')}</nav>
      <main><section id="draw-panel" class="play-layout">
        <aside class="tools" id="tools"><div id="tool-options" class="tool-options" role="group" aria-label="${esc(c.draw)}"></div><label class="control-label brush-label" for="brush">${esc(c.brush)}</label><select id="brush">${['smooth','marker','highlighter','crayon','neon'].map(k=>`<option value="${k}">${esc(c[k])}</option>`).join('')}</select><div class="control-label color-label" id="color-label">${esc(c.color)}</div><div id="color-options" class="swatches" role="group" aria-labelledby="color-label"></div><details class="size-picker" open><summary aria-label="${esc(c.size)}" title="${esc(c.size)}"><span data-icon="settings"></span><output id="brush-size" for="size">7</output></summary><div class="size-popover"><label class="control-label" for="size">${esc(c.size)}</label><input id="size" type="range" min="2" max="24" value="7"></div></details></aside>
        <div class="drawing-stage"><div class="mode-controls" role="group" aria-label="${esc(c.draw)}"><button data-mode="free" type="button" aria-pressed="true">${esc(c.free)}</button><button data-mode="daily" type="button" aria-pressed="false">${esc(c.daily)}</button></div><div class="prompt-field"><label class="title-field"><span class="sr-only">${esc(c.title)}</span><input id="drawing-title" maxlength="120" placeholder="${esc(c.defaultTitle)}" autocomplete="off"></label><p id="prompt" class="prompt" hidden></p></div><div class="canvas-actions"><div id="edit-actions" class="edit-actions"></div><div id="drawing-actions" class="drawing-actions"></div></div><div class="canvas-frame"><canvas id="drawing-canvas" width="480" height="640" aria-label="${esc(c.draw)}"></canvas><span id="cursor" hidden></span></div><div class="canvas-status" id="canvas-status" aria-live="polite"></div></div>
        <aside class="featured-rail"><h2>${esc(c.featured)}</h2><div id="featured-preview" class="artwork-grid"></div><button type="button" class="text-button" data-tab="featured">${esc(c.featured)} <span data-icon="arrow"></span></button></aside>
      </section><section id="gallery-panel" class="library-panel" hidden><h2>${esc(c.gallery)}</h2><div id="gallery-items" class="artwork-grid"></div></section><section id="featured-panel" class="library-panel" hidden><h2>${esc(c.featured)}</h2><div id="featured-items" class="artwork-grid"></div></section>
      <section class="guide"><div><h1>${esc(d.app_name)}: ${esc(c.seoTitle)}</h1><h2>${esc(c.guideTitle)}</h2><p>${esc(c.guideBody)}</p><noscript><p class="no-js-notice">${esc(seo.jsRequired)}</p></noscript><a class="text-button" href="${href(language,'help')}">${esc(d.nav_help)} <span data-icon="arrow"></span></a></div>${download}</section><section class="faq" id="faq">${faq}</section></main>`;
    else if(page==='help')body=`<main class="document"><h1>${esc(d.help_h1)}</h1>${seo.steps.map(([heading,text])=>`<h2>${esc(heading)}</h2><p>${esc(text)}</p>`).join('')}<h2>${esc(c.guideTitle)}</h2><p>${esc(c.guideBody)}</p>${faq}<a class="button primary" href="${href(language)}">${esc(c.draw)}</a>${download}</main>`;
    else if(page==='support')body=`<main class="document"><h1>${esc(d.support_h1)}</h1><p>${esc(seo.supportBody)}</p><a class="button" href="mailto:cameoshell09@gmail.com">${esc(d.contact_support)}</a>${download}</main>`;
    else body=`<main class="document"><h1>${esc(d.privacy_h1)}</h1><p>${esc(c.faq[1][1])}</p>${[1,2,3].map(n=>`<h2>${esc(d[`privacy_${n}_title`])}</h2><p>${esc(d[`privacy_${n}_body`])}</p>`).join('')}<p>${esc(c.faq[3][1])}</p><p>${esc(c.sharePrivacy)}</p><p>${esc(c.communityPrivacy)}</p><h2>${esc(c.analyticsTitle)}</h2><p>${esc(c.analyticsBody)}</p><p>${esc(c.analyticsRetention)}</p><p>${esc(c.analyticsNotice)}</p><p>${esc(c.serviceLogs)}</p><h2>${esc(d.privacy_4_title)}</h2><a href="mailto:cameoshell09@gmail.com">cameoshell09@gmail.com</a>${download}</main>`;
    structured.unshift({'@context':'https://schema.org','@type':'WebPage','@id':href(language,page)+'#page',name:title,description,url:href(language,page),inLanguage:code,isPartOf:{'@type':'WebSite','@id':site+'/#website',name:'Ghost Draw',url:site},...(game?{mainEntity:{'@id':site+'/#web-app'}}:{})});
    const machineLinks=`<noscript><link rel="stylesheet" href="/assets/no-js.css"></noscript><link rel="describedby" href="${site}/${language.path?language.path+'/':''}llms.txt">${game?`<link rel="alternate" type="text/markdown" href="${site}/${language.path?language.path+'/':''}index.md">`:''}`;
    const html=`<!doctype html><html lang="${code}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${href(language,page)}">${languages.map(l=>`<link rel="alternate" hreflang="${l.code}" href="${href(l,page)}">`).join('')}<link rel="alternate" hreflang="x-default" href="${href(languages[0],page)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${href(language,page)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(d.app_name)}"><meta property="og:image" content="${site}/favicon.png"><meta property="og:image:width" content="1024"><meta property="og:image:height" content="1024"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${site}/favicon.png"><link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/favicon/apple-touch-icon.png"><link rel="stylesheet" href="/assets/play.css?v=${assetVersion}">${machineLinks}${structured.map(s=>`<script type="application/ld+json">${json(s)}</script>`).join('')}</head><body>${header}${body}${footer}<div id="toast" role="status" hidden></div><script id="game-config" type="application/json">${json({config,copy:c,game})}</script><script type="module" src="/assets/app.js?v=${assetVersion}"></script></body></html>`;
    const directory=path.join(out,language.path);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,`${page}.html`),html);
  }
  const markdown=`# ${d.app_name}: ${c.seoTitle}\n\n> ${c.seoDescription}\n\n${c.guideBody}\n\n${seo.jsRequired}\n\n## ${d.nav_help}\n\n${seo.steps.map(([heading,text])=>`### ${heading}\n\n${text}`).join('\n\n')}\n\n${c.faq.map(([q,a])=>`## ${q}\n\n${a}`).join('\n\n')}\n\n## ${c.privacyStats}\n\n${c.sharePrivacy}\n\n${c.communityPrivacy}\n\n${c.analyticsBody}\n\n${c.analyticsRetention}\n\n${c.serviceLogs}\n\n## Links\n\n- [${c.draw}](${href(language)})\n- [${d.nav_help}](${href(language,'help')})\n- [${d.nav_privacy}](${href(language,'privacy-policy')})\n- [${d.nav_support}](${href(language,'support')})\n- [App Store](${app})\n`;
  await writeFile(path.join(out,language.path,'index.md'),markdown);
  const manifest=`# ${d.app_name}\n\n> ${c.seoDescription}\n\n${c.guideBody}\n\n${seo.jsRequired}\n\n## Pages\n\n- [${c.draw}](${href(language)}): ${c.seoDescription}\n- [${d.nav_help}](${href(language,'help')}): ${seo.helpDescription}\n- [${d.nav_privacy}](${href(language,'privacy-policy')}): ${seo.privacyDescription}\n- [${d.nav_support}](${href(language,'support')})\n\n## Product summary\n\n- [${language.label}](${site}/${language.path?language.path+'/':''}index.md): ${c.seoDescription}\n\n## Optional\n\n- [App Store](${app}): ${c.faq[3][1]}\n`;
  llms.push({language,manifest});
}
await writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${languages.flatMap(l=>['index','help','support','privacy-policy'].map(p=>`<url><loc>${href(l,p)}</loc></url>`)).join('')}</urlset>`);
await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /*?*replay=\nDisallow: /src/\nDisallow: /scripts/\nDisallow: /tests/\nSitemap: ${site}/sitemap.xml\n`);
await writeFile(path.join(out,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://ghostdraw-api.luopeike.com; base-uri 'self'; frame-ancestors 'none'; form-action 'self'\n/content/*\n  X-Robots-Tag: noindex\n/*.md\n  X-Robots-Tag: noindex\n  Content-Type: text/markdown; charset=utf-8\n/llms.txt\n  Content-Type: text/plain; charset=utf-8\n/*/llms.txt\n  Content-Type: text/plain; charset=utf-8\n`);
for(const {language,manifest}of llms)await writeFile(path.join(out,language.path,'llms.txt'),manifest+(language.code==='en'?`\n## Languages\n\n${languages.slice(1).map(l=>`- [${l.label}](${site}/${l.path}/llms.txt): ${seoCopy[l.code].homeDescription}`).join('\n')}\n`:''));
await writeFile(path.join(out,'404.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Ghost Draw</title><link rel="stylesheet" href="/assets/play.css?v=${assetVersion}"><main class="document"><h1>404 · Page not found</h1><a class="button primary" href="/">Ghost Draw</a></main></html>`);

// Pages currently publishes the repository root directly after a Git push.
// Sync only generated public assets; never copy source directories or remove the repository.
for(const language of languages){
  const target=path.join(root,language.path);await mkdir(target,{recursive:true});
  for(const file of ['index.html','help.html','support.html','privacy-policy.html','index.md','llms.txt'])await cp(path.join(out,language.path,file),path.join(target,file));
}
for(const file of ['sitemap.xml','robots.txt','_headers','404.html','favicon.png'])await cp(path.join(out,file),path.join(root,file));
await cp(path.join(out,'assets'),path.join(root,'assets'),{recursive:true});
console.log(`Built ${languages.length} languages: public files synced to the Git-published root and dist/.`);
