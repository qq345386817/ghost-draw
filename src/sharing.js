import {makeReplayPayload,renderArtwork} from './drawing.js';
import {button,node,openDialog,toast} from './ui.js';

function wrap(ctx,text,width){const lines=[];let line='';for(const c of text){if(ctx.measureText(line+c).width>width&&line){lines.push(line);line=c;}else line+=c;}if(line)lines.push(line);return lines;}
const filename=text=>(text||'ghost-draw').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'').slice(0,60)||'ghost-draw';
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function downloadData(record){download(new Blob([JSON.stringify(record)],{type:'application/json'}),filename(record.title)+'.json');}
export async function resultImage(record,copy,config){
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.scale(2,2);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,360,600);
  ctx.fillStyle='#171c25';ctx.font='700 22px system-ui,sans-serif';const lines=wrap(ctx,record.title||copy.defaultTitle,320).slice(0,2);
  lines.forEach((line,i)=>ctx.fillText(line,20,36+i*28));
  const image=document.createElement('canvas');image.width=648;image.height=864;renderArtwork(image,record,{fit:.92});
  ctx.drawImage(image,18,90,324,432);ctx.fillStyle='#5f6874';ctx.font='14px system-ui,sans-serif';
  ctx.fillText(config.appName,20,549);wrap(ctx,copy.verdict,320).slice(0,2).forEach((line,i)=>ctx.fillText(line,20,570+i*18));
  return new Promise(resolve=>canvas.toBlob(blob=>resolve(new File([blob],filename(record.title)+'.png',{type:'image/png'})),'image/png'));
}

export class Sharing {
  constructor(config,copy,storage,analytics){Object.assign(this,{config,copy,storage,analytics});this.uploads=new Map();}
  async image(record){
    this.analytics.track('share_open',{kind:'image',mode:record.mode||'free'});
    const file=await resultImage(record,this.copy,this.config);
    try{
      if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:record.title||this.copy.defaultTitle});this.analytics.track('share_complete',{kind:'image',outcome:'success'});}
      else{download(file,file.name);this.analytics.track('image_download',{kind:'image'});}
    }catch(e){if(e.name!=='AbortError')toast(this.copy.uploadError);}
  }
  async ensureLink(record){
    if(record.shareURL)return record.shareURL;
    if(this.uploads.has(record.id))return this.uploads.get(record.id);
    const promise=(async()=>{
      const payload=makeReplayPayload(record,this.config.locale,this.copy);
      const response=await fetch(this.config.uploadEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload}),signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(response.status===413?'too_large':'upload');
      const hosted=await response.json();if(!/^[a-f0-9-]{36}$/i.test(hosted.id))throw new Error('upload');
      const url=new URL(this.config.siteURL);url.searchParams.set('replay',hosted.id);
      record.hostedReplayID=hosted.id;record.shareURL=url.href;record.updatedAt=Date.now();
      await this.storage.save(record).catch(()=>toast(this.copy.storageError));return record.shareURL;
    })();this.uploads.set(record.id,promise);
    try{return await promise;}finally{this.uploads.delete(record.id);}
  }
  async link(record,control){
    if(control)control.disabled=true;this.analytics.track('share_open',{kind:'link',mode:record.mode||'free'});
    try{
      const url=await this.ensureLink(record);
      // Uploading is asynchronous; a new click retains the Web Share user gesture.
      const body=node('div','dialog-body');body.append(node('p',null,this.copy.linkReady));
      const input=node('input','link-field');input.value=url;input.readOnly=true;input.setAttribute('aria-label',this.copy.shareLink);body.append(input);
      const actions=node('div','dialog-actions');
      actions.append(button(this.copy.copy,async()=>{try{await navigator.clipboard.writeText(url);}catch{input.focus();input.select();if(!document.execCommand('copy')){toast(this.copy.uploadError);return;}}toast(this.copy.copied);this.analytics.track('share_complete',{kind:'link',outcome:'success'});},{symbol:'link'}));
      if(navigator.share)actions.append(button(this.copy.share,async()=>{try{await navigator.share({url,title:record.title||this.copy.defaultTitle});this.analytics.track('share_complete',{kind:'link',outcome:'success'});}catch(e){if(e.name!=='AbortError')toast(this.copy.uploadError);}},{symbol:'share',primary:true}));
      body.append(actions,node('p','muted small',this.copy.publicLink));openDialog(this.copy.shareLink,body,this.copy);
    }catch(e){toast(e.message==='too_large'?this.copy.tooLarge:this.copy.uploadError);this.analytics.track('share_failed',{kind:'link',reason:e.message==='too_large'?'too_large':'network'});}
    finally{if(control)control.disabled=false;}
  }
  actions(record){const row=node('div','share-actions');const link=button(this.copy.shareLink,()=>this.link(record,link),{symbol:'link',primary:true});row.append(link,button(this.copy.shareImage,()=>this.image(record),{symbol:'share'}));return row;}
  showResult(record){const body=node('div','dialog-body');body.append(node('p','result-verdict',this.copy.verdict),this.actions(record));openDialog(record.title||this.copy.defaultTitle,body,this.copy);}
}
