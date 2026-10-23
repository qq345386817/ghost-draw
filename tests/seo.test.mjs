import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {load} from 'cheerio';
const root=new URL('../',import.meta.url),site='https://ghost-draw.luopeike.com';
const read=async path=>readFile(new URL(path,root),'utf8');
const languages=JSON.parse(await read('content/site-copy.json'));
const seo=JSON.parse(await read('content/seo.json'));

test('all 40 Git-published pages have matching local metadata and crawlable links',async()=>{
  const titles=new Set();
  for(const language of languages)for(const name of ['index','help','support','privacy-policy']){
    const path=`${language.path?language.path+'/':''}${name}.html`,html=await read(path),$=load(html);
    const canonical=`${site}/${language.path?language.path+'/':''}${name==='index'?'':name}`;
    assert.equal(html,await read('dist/'+path),'Git output is stale: '+path);
    assert.equal($('html').attr('lang'),language.code);
    assert.equal($('link[rel=canonical]').attr('href'),canonical);
    assert.equal($('link[rel=alternate][hreflang]').length,11);
    assert.equal($('h1').length,1,path);
    const title=$('title').text(),description=$('meta[name=description]').attr('content');
    assert.ok(title.length>=6&&title.length<100,path);
    assert.ok(description.length>25&&description.length<280,path);
    assert.ok(!titles.has(language.code+':'+title),'Duplicate title within locale: '+title);titles.add(language.code+':'+title);
    assert.equal($('meta[property="og:title"]').attr('content'),title);
    assert.equal($('meta[name="twitter:description"]').attr('content'),description);
    assert.equal($('meta[name=keywords]').length,0);
    const script=$('script[type=module]').attr('src'),style=$('link[rel=stylesheet]').first().attr('href');
    assert.match(script,/^\/assets\/app\.js\?v=[a-f0-9]{12}$/);
    assert.match(style,/^\/assets\/play\.css\?v=[a-f0-9]{12}$/);
    assert.equal(new URL(script,site).search,new URL(style,site).search,'Script and CSS must share the same content version');
    assert.equal($('footer a[hreflang]').length,10);
    if(name==='index'){
      assert.equal(description,seo[language.code].homeDescription);
      assert.ok($('h1').text().includes(seo[language.code].homeTitle));
      assert.equal($(`a[href="${canonical}help"]`).length>0,true);
      assert.equal($('a[data-store-link]').length,1);
      const structured=$('script[type="application/ld+json"]').map((_,s)=>JSON.parse($(s).text())).get();
      const faq=structured.find(s=>s['@type']==='FAQPage');
      assert.equal(faq.mainEntity.length,$('section.faq details').length);
      for(const question of faq.mainEntity){assert.ok($('section.faq').text().includes(question.name));assert.ok($('section.faq').text().includes(question.acceptedAnswer.text));}
      assert.equal(structured.find(s=>s['@type']==='WebApplication').isRelatedTo.installUrl,'https://apps.apple.com/app/id6773654307');
      assert.equal(html.includes('AggregateRating'),false);
    }
  }
});

test('llms manifests and Markdown summaries reflect the visible product facts in every language',async()=>{
  for(const language of languages){
    const prefix=language.path?language.path+'/':'',manifest=await read(prefix+'llms.txt'),summary=await read(prefix+'index.md');
    assert.equal(manifest,await read('dist/'+prefix+'llms.txt'));
    assert.equal(summary,await read('dist/'+prefix+'index.md'));
    assert.ok(manifest.startsWith('# '+language.data.app_name));
    assert.ok(manifest.includes(seo[language.code].homeDescription));
    for(const [question,answer]of seo[language.code].faq){assert.ok(summary.includes(question));assert.ok(summary.includes(answer));}
    for(const match of manifest.matchAll(/\]\((https:\/\/ghost-draw\.luopeike\.com[^)]+)\)/g)){
      let path=new URL(match[1]).pathname.slice(1);if(path.endsWith('/')||!path)path+='index.html';else if(!/\.(md|txt|html)$/.test(path))path+='.html';
      assert.ok((await stat(new URL(path,root))).isFile(),match[1]);
    }
    const $=load(await read(prefix+'index.html'));
    assert.equal($('link[rel=describedby]').attr('href'),site+'/'+prefix+'llms.txt');
    assert.equal($('link[rel=alternate][type="text/markdown"]').attr('href'),site+'/'+prefix+'index.md');
  }
});

test('sitemap, assets, Search Console verification and crawl policy survive Git publishing',async()=>{
  const xml=load(await read('sitemap.xml'),{xml:true}),urls=xml('loc').map((_,el)=>xml(el).text()).get();
  assert.equal(urls.length,40);assert.equal(new Set(urls).size,40);
  assert.ok(urls.every(url=>url.startsWith(site+'/')&&!url.includes('?')&&!url.endsWith('.html')));
  const robots=await read('robots.txt'),headers=await read('_headers');
  assert.ok(robots.includes('Allow: /'));assert.ok(robots.includes('Disallow: /*?*replay='));
  assert.ok(!robots.includes('Disallow: /content/'),'JSON must remain accessible to page rendering');
  assert.ok(headers.includes('/content/*\n  X-Robots-Tag: noindex'));
  assert.ok(headers.includes('Content-Type: text/markdown; charset=utf-8'));
  assert.equal(await read('google8bdd3bd447b6e703.html'),await read('dist/google8bdd3bd447b6e703.html'));
  for(const file of ['assets/app.js','assets/play.css','favicon.png','404.html'])assert.deepEqual(await readFile(new URL(file,root)),await readFile(new URL('dist/'+file,root)));
  const $=load(await read('404.html'));assert.ok($('meta[name=robots]').attr('content').includes('noindex'));
});
