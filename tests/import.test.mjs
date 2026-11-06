import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root=new URL('../',import.meta.url),exec=promisify(execFile);

test('App import preserves independent website copy and needs no legacy Ruby renderer',async()=>{
  const fixture=await mkdtemp(path.join(tmpdir(),'ghostdraw-import-'));
  try{
    const site=path.join(fixture,'site'),app=path.join(fixture,'app');
    const languages=JSON.parse(await readFile(new URL('content/site-copy.json',root),'utf8'));
    const native=JSON.parse(await readFile(new URL('content/ui-native.json',root),'utf8')).en;
    const labels=[...Object.values(native).filter(value=>typeof value==='string'),...Object.values(native.colors)];
    const strings=Object.fromEntries(labels.map(label=>[label,{localizations:Object.fromEntries(languages.map(l=>[l.code,{stringUnit:{value:`${l.code}:${label}`}}]))}]));
    for(const directory of ['scripts','content'])await mkdir(path.join(site,directory),{recursive:true});
    for(const directory of ['GhostDraw/ChallengeCatalog','GhostDraw/FeaturedCatalog'])await mkdir(path.join(app,directory),{recursive:true});
    await cp(new URL('scripts/import-app-content.mjs',root),path.join(site,'scripts/import-app-content.mjs'));
    languages[0].data.fixtureSentinel='Synthetic website-owned copy; do not replace';
    const original=JSON.stringify(languages,null,2)+'\n';
    await writeFile(path.join(site,'content/site-copy.json'),original);
    await writeFile(path.join(app,'GhostDraw/Localizable.xcstrings'),JSON.stringify({strings}));
    const catalog={challenges:[],curatedChallenges:[],legacyChallenges:[]};
    for(const language of languages)await writeFile(path.join(app,`GhostDraw/ChallengeCatalog/challenges.${language.code}.json`),JSON.stringify(catalog));
    await writeFile(path.join(app,'GhostDraw/FeaturedCatalog/featured.json'),JSON.stringify({items:[]}));
    for(let attempt=0;attempt<2;attempt++){
      const {stdout}=await exec(process.execPath,[path.join(site,'scripts/import-app-content.mjs'),app]);
      assert.match(stdout,/Imported 10 website locales/);
      assert.equal(await readFile(path.join(site,'content/site-copy.json'),'utf8'),original);
    }
    const imported=JSON.parse(await readFile(path.join(site,'content/ui-native.json'),'utf8'));
    for(const language of languages){
      assert.equal(imported[language.code].gallery,`${language.code}:Gallery`);
      assert.deepEqual(JSON.parse(await readFile(path.join(site,`content/challenges/${language.code}.json`),'utf8')),catalog);
    }
  }finally{await rm(fixture,{recursive:true,force:true});}
});
