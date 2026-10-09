import {renderArtwork,validateReplay} from './drawing.js';
import {button,node,openDialog,confirmAction,toast} from './ui.js';
const cache=new Map();
export async function loadPayload(url){
  const u=new URL(url,location.origin),local=u.origin===location.origin&&/^\/content\/replays\/[a-f0-9-]{36}\.json$/i.test(u.pathname);
  if(!local&&u.hostname!=='ghostdraw-api.luopeike.com')throw new Error('invalid_replay');
  if(!local&&!u.pathname.endsWith('/payload.json'))u.pathname=u.pathname.replace(/\/$/,'')+'/payload.json';
  if(!cache.has(u.href))cache.set(u.href,fetch(u.href,{signal:AbortSignal.timeout(20000)}).then(r=>{if(!r.ok)throw new Error('load');return r.json();}).then(p=>{if(!validateReplay(p))throw new Error('load');return p;}).catch(e=>{cache.delete(u.href);throw e;}));
  return cache.get(u.href);
}
function visible(strokes,count){const output=[];for(const stroke of strokes){if(count<=0)break;const n=Math.min(count,stroke.points.length);count-=n;if(n===stroke.points.length)output.push(stroke);else output.push({...stroke,points:stroke.points.slice(0,n)});}return output;}
export function playOnCanvas(canvas,record,onEnd,{loop=false}={}){
  const count=record.strokes.reduce((n,s)=>n+s.points.length,0),duration=Math.max(4200,Math.min(9000,count*85));
  let id,start=performance.now(),stopped=false;
  const motion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(now){if(stopped)return;const elapsed=now-start,progress=motion?1:Math.min(1,elapsed/duration);renderArtwork(canvas,{...record,strokes:visible(record.strokes,Math.floor(count*progress))});
    if(progress<1)id=requestAnimationFrame(frame);else{onEnd?.();if(loop){id=setTimeout(()=>{start=performance.now();id=requestAnimationFrame(frame);},1000);}}
  }
  id=requestAnimationFrame(frame);return()=>{stopped=true;cancelAnimationFrame(id);clearTimeout(id);};
}

export class Library {
  constructor(config,copy,storage,analytics,sharing,onChallenge,prompts){Object.assign(this,{config,copy,storage,analytics,sharing,onChallenge,prompts});}
  title(record){return (['featured','shared'].includes(record.mode)?this.prompts?.find(p=>p.id===record.challengeID)?.prompt:null)||(record.mode==='shared'?record.prompt||record.title:record.title||record.prompt)||this.copy.defaultTitle;}
  async gallery(){
    const panel=document.getElementById('gallery-items');panel.replaceChildren();this.analytics.track('history_view');
    const records=await this.storage.list().catch(()=>{toast(this.copy.storageError);return[];});
    if(!records.length){const empty=node('div','empty-state');empty.append(node('h2',null,this.copy.emptyGallery),node('p','muted',this.copy.emptyGalleryBody));panel.append(empty);return;}
    for(const record of records){const card=node('article','artwork-card'),open=button(this.title(record),()=>this.record(record));open.className='artwork-open';
      const canvas=node('canvas');canvas.width=240;canvas.height=320;renderArtwork(canvas,record);open.replaceChildren(canvas,node('span','artwork-title',this.title(record)));card.append(open);panel.append(card);}
  }
  async featured(){
    if(this.featuredItems)return this.featuredItems;
    const bundled=await fetch('/content/featured.json').then(r=>r.json());this.featuredItems=bundled.items;
    return this.featuredItems;
  }
  async renderFeatured(target,limit){
    target.replaceChildren();const entries=await this.featured().catch(()=>[]);
    if(!entries.length){target.append(node('p','muted',this.copy.emptyFeatured));return;}
    for(const item of entries.slice(0,limit||entries.length)){
      const card=node('article','artwork-card'),open=button(this.copy.watchReplay,()=>this.official(item));open.className='artwork-open';
      const canvas=node('canvas');canvas.width=240;canvas.height=320;renderArtwork(canvas,null);canvas.setAttribute('aria-label',this.copy.loading);
      const play=node('span','artwork-play');play.append(button(this.copy.watchReplay,()=>this.official(item),{symbol:'play',primary:true,iconOnly:true}));
      // Separate the preview and replay command so interactive elements are not nested.
      open.replaceChildren(canvas);card.append(open,play);target.append(card);
      loadPayload(item.payloadPath||item.replayURL).then(p=>{renderArtwork(canvas,p);canvas.setAttribute('aria-label',this.copy.watchReplay);}).catch(()=>{canvas.setAttribute('aria-label',this.copy.loadError);});
    }
  }
  async official(item){
    try{const payload=await loadPayload(item.payloadPath||item.replayURL);this.record({...payload,id:item.id,challengeID:item.challengeID,mode:'featured'},false);}
    catch{toast(this.copy.loadError);}
  }
  record(record,local=true){
    this.analytics.track('replay_start',{mode:local?'history':record.mode==='shared'?'shared':'featured',origin:local?'owner':'recipient'});
    const body=node('div','dialog-body');const canvas=node('canvas','replay-board');canvas.width=480;canvas.height=640;canvas.dataset.testid='replay-canvas';body.append(canvas);
    let stop=()=>{};const replay=button(this.copy.replay,()=>{stop();stop=playOnCanvas(canvas,record,()=>{});},{symbol:'play'});body.append(replay);
    if(local)body.append(this.sharing.actions(record));
    else body.append(button(this.copy.challenge,()=>{dialog.close();this.onChallenge(record.challengeID,this.title(record));},{symbol:'pencil',primary:true}));
    if(local)body.append(button(this.copy.delete,async()=>{dialog.close();if(await confirmAction(this.copy.deleteConfirm,this.copy)){try{await this.storage.remove(record.id);this.gallery();}catch{toast(this.copy.storageError);}}},{symbol:'trash'}));
    const dialog=openDialog(this.title(record),body,this.copy,{onClose:()=>stop()});
    let completed=false;
    stop=playOnCanvas(canvas,record,()=>{if(!completed){completed=true;this.analytics.track('replay_complete',{mode:local?'history':record.mode==='shared'?'shared':'featured',origin:local?'owner':'recipient'});}}, {loop:true});
  }
}
