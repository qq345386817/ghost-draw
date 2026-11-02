import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {load} from 'cheerio';

export const SITE='https://ghost-draw.luopeike.com';
export const ENDPOINT='https://api.indexnow.org/indexnow';
export const KEY_FILE='fac5ab115cb18f45db961c47cdde2f7b.txt';
export const MAX_URLS=40;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);

export function parseOptions(args){
  const options={submit:false,urls:[],help:false};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--submit'&&!options.submit)options.submit=true;
    else if(args[i]==='--url'&&args[i+1]&&!args[i+1].startsWith('--'))options.urls.push(args[++i]);
    else if(args[i]==='--help')options.help=true;
    else throw new Error('Invalid arguments. Use --help; --submit is required to send.');
  }
  if(options.urls.length>MAX_URLS)throw new Error('At most 40 --url arguments are allowed.');
  return options;
}

export async function readKey(directory=root){
  const key=KEY_FILE.slice(0,-4),text=decode(await readFile(path.join(directory,KEY_FILE)));
  if(!/^[a-f0-9]{32}$/.test(key)||!matchesKey(text,key))throw new Error('Local IndexNow key file must contain its filename key as UTF-8 text.');
  return key;
}

function matchesKey(text,key){return text===key||text===key+'\n'||text===key+'\r\n';}

export function sitemapURLs(xml,canonicalURLs){
  if(Buffer.byteLength(xml)>128*1024)throw new Error('Sitemap exceeds the local size limit.');
  const $=load(xml,{xml:true}),urlset=$.root().children();
  if(urlset.length!==1||urlset[0].name!=='urlset'||urlset.attr('xmlns')!=='http://www.sitemaps.org/schemas/sitemap/0.9')throw new Error('Expected a sitemap urlset.');
  const entries=urlset.children('url');
  if(entries.length!==MAX_URLS||urlset.children().length!==MAX_URLS||new Set(canonicalURLs).size!==MAX_URLS)throw new Error('Expected exactly 40 canonical sitemap URLs.');
  const urls=entries.map((_,entry)=>{
    const loc=$(entry).children('loc');
    if(loc.length!==1||loc.children().length)throw new Error('Each sitemap entry needs one text loc.');
    const value=loc.text(),url=new URL(value);
    if(value!==url.href||url.origin!==SITE||url.username||url.password||url.search||url.hash||!canonicalURLs.includes(value))throw new Error('Sitemap contains a noncanonical or nonpublic URL.');
    return value;
  }).get();
  if(new Set(urls).size!==MAX_URLS)throw new Error('Sitemap URLs must be unique.');
  return urls;
}

export async function createPlan({directory=root,urls=[]}={}){
  if(urls.length>MAX_URLS)throw new Error('At most 40 URLs are allowed.');
  const languages=JSON.parse(await readFile(path.join(directory,'content/site-copy.json'),'utf8'));
  const canonicalURLs=languages.flatMap(language=>{
    if(typeof language.path!=='string'||!/^(?:[a-z]{2}(?:-[A-Za-z]+)?)?$/.test(language.path))throw new Error('Invalid locale path.');
    return ['','help','support','privacy-policy'].map(page=>`${SITE}/${language.path?language.path+'/':''}${page}`);
  });
  const all=sitemapURLs(await readFile(path.join(directory,'sitemap.xml'),'utf8'),canonicalURLs);
  // Cross-check public HTML, rather than treating sitemap membership as canonical proof.
  for(const url of all){
    let file=new URL(url).pathname.slice(1);
    file=file.endsWith('/')||!file?file+'index.html':file+'.html';
    const $=load(await readFile(path.join(directory,file),'utf8')),canonical=$('link[rel="canonical"]');
    if(canonical.length!==1||canonical.attr('href')!==url)throw new Error('Sitemap and public HTML canonical metadata disagree. Rebuild before submitting.');
  }
  if(urls.some(url=>!all.includes(url)))throw new Error('Only exact canonical sitemap URLs are allowed; no queries, fragments, replays or other hosts.');
  const key=await readKey(directory);
  return {host:new URL(SITE).host,key,keyLocation:`${SITE}/${KEY_FILE}`,urlList:urls.length?[...new Set(urls)]:all};
}

async function verifyLiveKey(plan,fetchImpl){
  const response=await fetchImpl(plan.keyLocation,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==200)throw new Error(`Live key check failed (HTTP ${response.status}); no submission sent. Wait for Git auto-publication.`);
  // Bound the response even if a host accidentally serves an HTML fallback or a stream.
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>256)throw new Error('Live key response is too large; no submission sent.');
      chunks.push(value);
    }
  }finally{await reader.cancel();}
  if(!matchesKey(decode(Buffer.concat(chunks)),plan.key))throw new Error('Live UTF-8 key does not match the local key; no submission sent.');
}

export async function run(args,{directory=root,fetchImpl=fetch,log=console.log}={}){
  const options=parseOptions(args);
  if(options.help){
    log('Usage: npm run indexnow -- [--submit] [--url CANONICAL_URL ...]\nDefault: offline dry run of all 40 sitemap URLs. Repeat --url to select changed pages only.\n--submit: verify the published root key, then send one POST. No automatic retries.');
    return;
  }
  const plan=await createPlan({directory,urls:options.urls});
  log(`${options.submit?'Submit':'Dry run (offline; nothing sent)'}: ${plan.urlList.length} canonical sitemap URLs\nEndpoint: ${ENDPOINT}\nKey file: ${KEY_FILE}`);
  log(plan.urlList.join('\n'));
  if(!options.submit)return {status:'dry-run',count:plan.urlList.length};
  await verifyLiveKey(plan,fetchImpl);
  const response=await fetchImpl(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(plan),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.body)await response.body.cancel();
  if(response.status===200){
    log('HTTP 200: accepted by IndexNow (received), not a guarantee of crawling or indexing.');
    return {status:'accepted',count:plan.urlList.length};
  }
  if(response.status===202){
    log('HTTP 202: received; IndexNow key validation is pending. Crawling/indexing is not confirmed.');
    return {status:'pending',count:plan.urlList.length};
  }
  const reason={400:'invalid request format',403:'key invalid or unavailable',422:'host/URL/key mismatch',429:'rate limited; do not retry repeatedly'}[response.status]||'unexpected response';
  throw new Error(`IndexNow HTTP ${response.status}: ${reason}. No automatic retry; indexing is not confirmed.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  run(process.argv.slice(2)).catch(error=>{
    console.error(`IndexNow failed: ${error.message} A network failure after POST may have an unknown receipt outcome; no automatic retry.`);
    process.exitCode=1;
  });
}
