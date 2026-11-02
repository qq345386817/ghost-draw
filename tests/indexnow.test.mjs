import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {load} from 'cheerio';
import {SITE,ENDPOINT,KEY_FILE,MAX_URLS,parseOptions,readKey,sitemapURLs,createPlan,run} from '../scripts/indexnow.mjs';

const root=new URL('../',import.meta.url),read=async file=>readFile(new URL(file,root),'utf8');
const quiet=()=>{};

async function fixture(t){
  const directory=await mkdtemp('/tmp/ghost-draw-indexnow-');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const languages=JSON.parse(await read('content/site-copy.json'));
  await mkdir(directory+'/content');
  for(const file of ['content/site-copy.json','sitemap.xml',KEY_FILE])await writeFile(directory+'/'+file,await read(file));
  for(const language of languages){
    const prefix=language.path?language.path+'/':'';
    await mkdir(directory+'/'+prefix,{recursive:true});
    for(const page of ['index','help','support','privacy-policy'])await writeFile(directory+'/'+prefix+page+'.html',await read(prefix+page+'.html'));
  }
  return directory;
}

test('default dry run is offline, bounded to the 40 canonical sitemap URLs',async()=>{
  const plan=await createPlan();
  assert.equal(plan.urlList.length,MAX_URLS);
  assert.deepEqual(Object.keys(plan).sort(),['host','key','keyLocation','urlList']);
  assert.equal(plan.host,new URL(SITE).host);
  assert.equal(plan.keyLocation,`${SITE}/${KEY_FILE}`);
  assert.equal(plan.key,await readKey());
  let requests=0;const logs=[];
  assert.deepEqual(await run([],{fetchImpl:async()=>{requests++;throw new Error('Must be offline');},log:line=>logs.push(line)}),{status:'dry-run',count:40});
  assert.equal(requests,0);
  assert.match(logs[0],/offline; nothing sent/);
  assert.deepEqual(logs[1].split('\n'),plan.urlList);
});

test('only exact sitemap URLs can be selected and repeated selections are deduplicated',async()=>{
  const url=SITE+'/help';
  assert.deepEqual((await createPlan({urls:[url,url]})).urlList,[url]);
  const invalid=[SITE+'/?replay=private',SITE+'/?title=private',SITE+'/help#private',SITE+'/help.html',SITE+'/help/',SITE+'/index.html',SITE+'/content/replays/private.json',SITE+'/src/app.js',SITE+'/scripts/indexnow.mjs',SITE+'/llms.txt',SITE+'/private','https://example.com/','http://ghost-draw.luopeike.com/','https://private@ghost-draw.luopeike.com/'];
  for(const url of invalid)await assert.rejects(createPlan({urls:[url]}),/Only exact canonical sitemap URLs/);
  await assert.rejects(createPlan({urls:Array(41).fill(url)}),/At most 40/);
  assert.deepEqual(parseOptions(['--submit','--url',url]),{submit:true,urls:[url],help:false});
  for(const args of [['--url'],['--submit=true'],['--submit','--submit'],['--dry-run'],[url],Array(41).fill(['--url',url]).flat()])assert.throws(()=>parseOptions(args));
});

test('XML sitemap structure, allowlist, uniqueness and count are enforced',async()=>{
  const xml=await read('sitemap.xml'),plan=await createPlan(),urls=plan.urlList;
  assert.deepEqual(sitemapURLs(xml,urls),urls);
  // XML entity decoding is provided by the parser, not string extraction.
  assert.deepEqual(sitemapURLs(xml.replace('/help</loc>','/h&#101;lp</loc>'),urls),urls);
  for(const value of [SITE+'/?replay=private',SITE+'/content/private.json','https://example.com/',SITE+'/help.html',SITE+'/help#private',SITE+'/help?private=yes']){
    const $=load(xml,{xml:true});$('loc').first().text(value);
    assert.throws(()=>sitemapURLs($.xml(),urls),/noncanonical or nonpublic/);
  }
  const duplicate=load(xml,{xml:true});duplicate('loc').first().text(urls[1]);
  assert.throws(()=>sitemapURLs(duplicate.xml(),urls),/unique/);
  const missing=load(xml,{xml:true});missing('url').first().remove();
  assert.throws(()=>sitemapURLs(missing.xml(),urls),/exactly 40/);
  const extra=load(xml,{xml:true});extra('urlset').append('<url><loc>'+SITE+'/</loc></url>');
  assert.throws(()=>sitemapURLs(extra.xml(),urls),/exactly 40/);
  const nested=load(xml,{xml:true});nested('loc').first().html('<private>'+SITE+'/</private>');
  assert.throws(()=>sitemapURLs(nested.xml(),urls),/one text loc/);
  assert.throws(()=>sitemapURLs('<sitemapindex/>',urls),/urlset/);
  assert.throws(()=>sitemapURLs('x'.repeat(128*1024+1),urls),/size limit/);
});

test('stale canonical metadata and invalid local keys prevent planning',async t=>{
  const directory=await fixture(t);
  await writeFile(directory+'/help.html',(await read('help.html')).replace(`rel="canonical" href="${SITE}/help"`,`rel="canonical" href="${SITE}/support"`));
  await assert.rejects(createPlan({directory}),/canonical metadata disagree/);
  await writeFile(directory+'/help.html',await read('help.html'));
  await writeFile(directory+'/'+KEY_FILE,'wrong-key');
  await assert.rejects(createPlan({directory}),/Local IndexNow key/);
  await writeFile(directory+'/'+KEY_FILE,Buffer.from([0xff]));
  await assert.rejects(readKey(directory),/encoded data/);
});

test('published root and dist preserve the same valid UTF-8 ownership file',async()=>{
  const bytes=await readFile(new URL(KEY_FILE,root));
  assert.deepEqual(bytes,await readFile(new URL('dist/'+KEY_FILE,root)));
  assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim(),KEY_FILE.slice(0,-4));
  assert.equal(await readKey(fileURLToPath(new URL('dist/',root))),await readKey());
});

test('explicit submission checks live ownership before one official JSON POST; 200 and 202 differ',async()=>{
  for(const [status,outcome]of [[200,'accepted'],[202,'pending']]){
    const requests=[],logs=[],url=SITE+'/help';
    const result=await run(['--submit','--url',url],{log:line=>logs.push(line),fetchImpl:async(target,options)=>{
      requests.push({target,options});
      assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
      if(requests.length===1){assert.equal(target,`${SITE}/${KEY_FILE}`);assert.equal(options.method,'GET');return new Response(await read(KEY_FILE));}
      assert.equal(target,ENDPOINT);assert.equal(options.method,'POST');
      assert.equal(options.headers['Content-Type'],'application/json; charset=utf-8');
      assert.deepEqual(JSON.parse(options.body),{host:new URL(SITE).host,key:await readKey(),keyLocation:`${SITE}/${KEY_FILE}`,urlList:[url]});
      return new Response(null,{status});
    }});
    assert.equal(result.status,outcome);assert.equal(requests.length,2);
    assert.match(logs.at(-1),status===200?/HTTP 200: accepted.*not a guarantee/:/HTTP 202: received.*pending/);
  }
});

test('unpublished, redirected, mismatched, oversized and invalid UTF-8 keys never cause a POST',async()=>{
  const responses=[()=>new Response(null,{status:404}),()=>new Response(null,{status:202}),()=>new Response(null,{status:302}),()=>new Response('<html>fallback</html>'),()=>new Response('wrong-key'),()=>new Response('x'.repeat(257)),()=>new Response(new Uint8Array([0xff]))];
  for(const response of responses){
    let requests=0;
    await assert.rejects(run(['--submit'],{log:quiet,fetchImpl:async(_,options)=>{requests++;assert.equal(options.method,'GET');return response();}}));
    assert.equal(requests,1);
  }
  let requests=0;
  await assert.rejects(run(['--submit'],{log:quiet,fetchImpl:async()=>{requests++;throw new Error('GET timed out');}}),/GET timed out/);
  assert.equal(requests,1);
});

test('error responses and network failures fail honestly with no retries',async()=>{
  for(const status of [400,403,422,429,500,204,301]){
    let requests=0;
    await assert.rejects(run(['--submit'],{log:quiet,fetchImpl:async()=>++requests===1?new Response(await read(KEY_FILE)):new Response(null,{status})}),new RegExp(`HTTP ${status}`));
    assert.equal(requests,2);
  }
  let requests=0;
  await assert.rejects(run(['--submit'],{log:quiet,fetchImpl:async()=>{if(++requests===1)return new Response(await read(KEY_FILE));throw new Error('POST timed out');}}),/POST timed out/);
  assert.equal(requests,2);
});

test('CLI works outside the repository; argument errors exit nonzero without disclosing input',async()=>{
  const script=new URL('../scripts/indexnow.mjs',import.meta.url).pathname;
  const {stdout}=await promisify(execFile)(process.execPath,[script],{cwd:'/tmp'});
  assert.match(stdout,/Dry run \(offline; nothing sent\): 40/);
  await assert.rejects(promisify(execFile)(process.execPath,[script,'--private=user-data'],{cwd:'/tmp'}),error=>{
    assert.equal(error.code,1);assert.match(error.stderr,/Invalid arguments/);assert.ok(!error.stderr.includes('user-data'));return true;
  });
});
