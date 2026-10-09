import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync,execFile } from 'node:child_process';
import {promisify} from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(process.argv[2] || resolve(root, '..'));
const locales = JSON.parse(execFileSync('ruby', [resolve(app, 'scripts/render_localized_site.rb')], {
  env: { ...process.env, GHOSTDRAW_EXPORT_SITE_COPY: '1' }, encoding: 'utf8'
}));
await mkdir(resolve(root, 'content/challenges'), { recursive: true });
await writeFile(resolve(root, 'content/site-copy.json'), JSON.stringify(locales, null, 2) + '\n');
const strings = JSON.parse(await readFile(resolve(app, 'GhostDraw/Localizable.xcstrings'), 'utf8')).strings;
const nativeKeys = {draw:'Draw',gallery:'Gallery',featured:'Featured',free:'Free',daily:'Daily',pencil:'Pen',circle:'Circle',square:'Box',star:'Star',color:'Color',size:'Brush size',brush:'Brush',smooth:'Smooth',marker:'Marker',highlighter:'Highlighter',crayon:'Crayon',neon:'Neon',clear:'Clear',replay:'Replay Again',shareImage:'Share Image',shareLink:'Share Link',close:'Close',cancel:'Cancel',delete:'Delete',done:'Done',discard:'Discard',emptyGallery:'No Ghosts Yet',emptyGalleryBody:'Reveal a drawing to save its result card here.',deleteConfirm:'Delete this saved drawing?',hiddenInk:'Hidden ink',revealing:'Ghost is drawing',revealed:'Revealed',watchReplay:'Watch Replay',challenge:'Challenge This Prompt'};
const ui = {};
const colorKeys={ink:'Ink',ghostBlue:'Blue',mint:'Mint',tomato:'Red',coral:'Coral',gold:'Gold',lime:'Lime',violet:'Violet',magenta:'Magenta',midnight:'Midnight'};
for (const locale of locales) {
  ui[locale.code] = {};
  for (const [key, nativeKey] of Object.entries(nativeKeys)) {
    const translated = strings[nativeKey]?.localizations?.[locale.code]?.stringUnit?.value;
    if (locale.code !== 'en' && !translated) throw new Error(`Missing ${locale.code} translation for ${nativeKey}`);
    ui[locale.code][key] = translated || nativeKey;
  }
  ui[locale.code].colors={};
  for(const [key,label] of Object.entries(colorKeys)){
    const value=strings[label]?.localizations?.[locale.code]?.stringUnit?.value;
    if(locale.code!=='en'&&!value)throw new Error(`Missing ${locale.code} color: ${label}`);
    ui[locale.code].colors[key]=value||label;
  }
}
await writeFile(resolve(root, 'content/ui-native.json'), JSON.stringify(ui, null, 2) + '\n');
for (const locale of locales) {
  const catalog = JSON.parse(await readFile(resolve(app, `GhostDraw/ChallengeCatalog/challenges.${locale.code}.json`), 'utf8'));
  await writeFile(resolve(root, `content/challenges/${locale.code}.json`), JSON.stringify(catalog) + '\n');
}
const featured=JSON.parse(await readFile(resolve(app,'GhostDraw/FeaturedCatalog/featured.json'),'utf8'));
await mkdir(resolve(root,'content/replays'),{recursive:true});
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{
  while(cursor<featured.items.length){
    const item=featured.items[cursor++],url=new URL(item.replayURL),id=url.pathname.split('/').at(-1);
    if(url.hostname!=='ghostdraw-api.luopeike.com'||!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Unexpected Featured URL');
    item.payloadPath=`/content/replays/${id}.json`;
    const target=resolve(root,'.'+item.payloadPath);
    if(!process.argv.includes('--refresh-replays')){try{await readFile(target);continue;}catch{}}
    const {stdout}=await promisify(execFile)('curl',['--noproxy','*','--fail','--silent','--show-error','--retry','2','--connect-timeout','15','--max-time','60',item.replayURL+'/payload.json'],{maxBuffer:1048576});
    const payload=JSON.parse(stdout);
    if(!Array.isArray(payload.strokes)||!payload.canvas)throw new Error('Invalid Featured payload');
    await writeFile(target,JSON.stringify(payload)+'\n');
  }
}));
await writeFile(resolve(root,'content/featured.json'),JSON.stringify(featured)+'\n');
console.log(`Imported ${locales.length} website locales and challenge catalogs. The website builds independently from these copies.`);
