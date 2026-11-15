import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BlindDrawing,makeReplayPayload,validateReplay,dailyIndex,dailyChallenge,compatibleStrokes,STUDIO_BRUSHES} from '../src/drawing.js';

test('explicit seasonal dates win over the rotating daily index',()=>{
  const regular={id:'regular'},halloween={id:'halloween'};
  const catalog={challenges:[regular,halloween],dailyOverrides:{'2026-10-24':'halloween'}};
  for(const hour of [0,8,23])assert.equal(dailyChallenge(catalog,new Date(2026,9,24,hour)).id,'halloween');
  assert.equal(dailyChallenge(catalog,new Date(2026,10,3)),catalog.challenges[dailyIndex(new Date(2026,10,3),2)]);
});
import {readFile} from 'node:fs/promises';
test('drawing keeps source data, undo/redo and partial replay',()=>{const d=new BlindDrawing();assert.equal(d.begin({x:20,y:30},{tool:'pen',width:7,color:'ink',brush:'smooth'},0),true);d.append({x:80,y:90},100);d.finish();assert.equal(d.visible(1)[0].points.length,1);assert.equal(d.strokes[0].points.length,2);d.undo();assert.equal(d.strokes.length,0);d.redo();assert.equal(d.strokes.length,1);d.state='revealed';assert.equal(d.begin({x:0,y:0},{},0),false);});
test('shared payload respects worker limits and does not modify original drawing',()=>{const points=Array.from({length:9000},(_,i)=>({x:200+100*Math.cos(i/8),y:300+100*Math.sin(i/8),t:i/100}));const r={strokes:[{tool:'pen',width:7,color:'ink',brush:'smooth',points}],title:'Test',mode:'free'};const p=makeReplayPayload(r,'en',{defaultTitle:'Test',free:'Free',verdict:'Your drawing'});assert.equal(validateReplay(p),true);assert.ok(p.strokes[0].points.length<=650);assert.ok(Buffer.byteLength(JSON.stringify(p))<=180000);assert.equal(r.strokes[0].points.length,9000);});
test('daily challenge matches Gregorian day ordinal, same local day is stable',()=>{assert.equal(dailyIndex(new Date(2026,9,9,0),195),dailyIndex(new Date(2026,9,9,23),195));assert.equal(dailyIndex(new Date(2026,9,10),195),(dailyIndex(new Date(2026,9,9),195)+1)%195);});
test('all official Featured items have valid local stroke data and localized challenges',async()=>{const root=new URL('../',import.meta.url),featured=JSON.parse(await readFile(new URL('content/featured.json',root)));assert.equal(featured.items.length,16);const languages=JSON.parse(await readFile(new URL('content/site-copy.json',root)));for(const item of featured.items){const payload=JSON.parse(await readFile(new URL('.'+item.payloadPath,root)));assert.equal(validateReplay(payload),true,item.id);for(const {code:locale} of languages){const catalog=JSON.parse(await readFile(new URL(`content/challenges/${locale}.json`,root)));assert.ok(catalog.challenges.find(c=>c.id===item.challengeID)?.prompt,item.id+' '+locale);}}});

test('studio ink uses the same deterministic compatible strokes for display and sharing',()=>{
  for(const brush of STUDIO_BRUSHES)for(const tool of ['pen','circle','square','star']){
    const points=Array.from({length:80},(_,i)=>({x:240+100*Math.cos(i/15),y:320+100*Math.sin(i/15),t:i/60}));
    const stroke={tool,brush,color:'ghostBlue',width:11,points},original=structuredClone(stroke);
    const record={title:'Doodle',mode:'paint',strokes:[stroke]};
    const copy={defaultTitle:'Drawing',free:'Free',verdict:'Blind',paintingVerdict:'Paint'};
    const projected=compatibleStrokes(stroke),payload=makeReplayPayload(record,'en',copy);
    assert.equal(projected.length,2);assert.equal(validateReplay(payload),true);
    assert.deepEqual(payload.strokes,projected);assert.deepEqual(stroke,original);
    assert.equal(payload.comment,'Paint');assert.ok(payload.strokes.every(s=>['smooth','neon'].includes(s.brush)));
  }
});

test('studio ink bounds dense gestures consistently without silently dropping whole strokes',()=>{
  const stroke={tool:'pen',brush:'duotone',color:'ink',width:2,points:Array.from({length:4000},(_,i)=>({x:i%480,y:i%640,t:i/100}))};
  const original=structuredClone(stroke),projected=compatibleStrokes(stroke);
  assert.ok(projected.every(s=>s.points.length===650&&s.width>=1));
  assert.ok(projected.every(s=>s.points.every(p=>p.x>=0&&p.x<=480&&p.y>=0&&p.y<=640)));
  assert.deepEqual(stroke,original);
  const copy={defaultTitle:'Drawing',free:'Free',verdict:'Blind',paintingVerdict:'Paint'};
  const short={...stroke,points:[{x:10,y:20,t:0},{x:30,y:40,t:1}]};
  assert.equal(validateReplay(makeReplayPayload({strokes:Array(90).fill(short),mode:'paint'},'en',copy)),true);
  assert.throws(()=>makeReplayPayload({strokes:Array(91).fill(short),mode:'paint'},'en',copy),/too_large/);
});

test('studio labels are hand-authored for all website locales',async()=>{
  const root=new URL('../',import.meta.url),copy=JSON.parse(await readFile(new URL('content/studio-copy.json',root)));
  const locales=JSON.parse(await readFile(new URL('content/site-copy.json',root))).map(l=>l.code);
  assert.deepEqual(Object.keys(copy).sort(),locales.sort());
  for(const locale of locales)for(const key of Object.keys(copy.en))assert.ok(typeof copy[locale][key]==='string'&&copy[locale][key].trim(),locale+' '+key);
});
