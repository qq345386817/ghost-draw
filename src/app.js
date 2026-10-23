import {BlindDrawing,COLORS,SOURCE_SIZE,renderArtwork,dailyChallenge,replayDuration} from './drawing.js';
import {drawingStorage as storage} from './storage.js';
import {WebAnalytics} from './analytics.js';
import {Sharing,downloadData} from './sharing.js';
import {Library,loadPayload} from './library.js';
import {button,node,openDialog,toast,installIcons} from './ui.js';

const {config,copy,game}=JSON.parse(document.getElementById('game-config').textContent);
if(location.hostname!=='ghost-draw.luopeike.com')config.siteURL=new URL(location.pathname,location.origin).href;
installIcons();
const analytics=new WebAnalytics(config);analytics.start();
document.getElementById('language').addEventListener('change',e=>{const url=new URL(e.target.value);url.search=location.search;location.assign(url);});
for(const link of document.querySelectorAll('[data-store-link]'))link.addEventListener('click',()=>analytics.track('app_store_click',{kind:'app'}));
document.getElementById('privacy-button').addEventListener('click',()=>{
  const body=node('div','dialog-body'),label=node('label','switch-row'),toggle=node('input');toggle.type='checkbox';toggle.checked=analytics.enabled;toggle.id='analytics-toggle';
  label.append(node('span',null,copy.analyticsSwitch),toggle);body.append(label,node('p','muted',copy.analyticsBody),node('p','muted',copy.analyticsRetention));
  toggle.addEventListener('change',()=>analytics.setEnabled(toggle.checked));
  body.append(button(copy.analyticsClear,async e=>{e.currentTarget.disabled=true;try{await analytics.deleteHistory();toggle.checked=false;toast(copy.analyticsCleared);}catch{toast(copy.loadError);}finally{e.currentTarget.disabled=false;}},{symbol:'trash'}));
  openDialog(copy.privacyStats,body,copy);
});
const savedDraft=game?storage.loadDraft().catch(()=>null):Promise.resolve(null);
if(game)await startGame();

async function startGame(){
  const drawing=new BlindDrawing(),canvas=document.getElementById('drawing-canvas'),cursor=document.getElementById('cursor'),title=document.getElementById('drawing-title'),status=document.getElementById('canvas-status'),actions=document.getElementById('drawing-actions');
  const catalog=await fetch(`/content/challenges/${config.locale}.json`).then(r=>r.json());
  const prompts=[...(catalog.curatedChallenges || []),...catalog.challenges,...(catalog.legacyChallenges || [])];
  const sharing=new Sharing(config,copy,storage,analytics);
  // Older cached pages still have a standalone width slider.
  const sizePicker=document.querySelector('.size-picker');
  if(sizePicker){
    const compactTools=matchMedia('(max-width: 640px)');
    const updateToolLayout=()=>{sizePicker.open=!compactTools.matches;};
    updateToolLayout();compactTools.addEventListener('change',updateToolLayout);
    document.getElementById('size').addEventListener('input',e=>{document.getElementById('brush-size').value=e.target.value;});
    sizePicker.addEventListener('keydown',e=>{if(e.key==='Escape'&&compactTools.matches){sizePicker.open=false;sizePicker.querySelector('summary').focus();}});
    sizePicker.addEventListener('focusout',e=>{if(compactTools.matches&&!sizePicker.contains(e.relatedTarget))sizePicker.open=false;});
    document.addEventListener('pointerdown',e=>{if(compactTools.matches&&!sizePicker.contains(e.target))sizePicker.open=false;});
  }
  const library=new Library(config,copy,storage,analytics,sharing,async(id,customTitle)=>{
    const challenge=prompts.find(p=>p.id===id);if(!await canReset())return;
    if(challenge)reset('featured',challenge);else{reset('free');title.value=customTitle||'';}
    tab('draw');analytics.track('challenge_start',{mode:challenge?'featured':'free'});
  },prompts);
  let mode='free',prompt=null,record=null,drawStarted=false,secondDrawing=false,tool='pen',color='ghostBlue',saveTimer,saveChain=Promise.resolve(),animation,playing=false;
  const render=()=>renderArtwork(canvas,{canvas:SOURCE_SIZE,strokes:drawing.strokes},{fit:1,blank:drawing.state==='drawing'});
  const undo=button(copy.undo,()=>{drawing.undo();changed();},{symbol:'undo',iconOnly:true});
  const redo=button(copy.redo,()=>{drawing.redo();changed();},{symbol:'redo',iconOnly:true});
  const clear=button(copy.clear,async()=>{if(drawing.strokes.length&&await ask(copy.clearConfirm,copy.clear)){drawing.clear();changed();}},{symbol:'trash',iconOnly:true});
  document.getElementById('edit-actions').append(undo,redo,clear);
  for(const [key,label,symbol] of [['pen',copy.pencil,'pencil'],['circle',copy.circle,'circle'],['square',copy.square,'square'],['star',copy.star,'star']]){
    const b=button(label,()=>{tool=key;for(const other of b.parentElement.children)other.setAttribute('aria-pressed',String(other===b));},{symbol,iconOnly:true});b.setAttribute('aria-pressed',String(key==='pen'));document.getElementById('tool-options').append(b);
  }
  for(const [key,value] of Object.entries(COLORS)){
    const b=button(copy.colors?.[key]||key,()=>{color=key;for(const other of b.parentElement.children)other.setAttribute('aria-pressed',String(other===b));},{iconOnly:true});b.className='swatch';b.style.setProperty('--swatch',value);b.setAttribute('aria-pressed',String(key===color));document.getElementById('color-options').append(b);
  }
  function display(){
    const revealed=drawing.state==='revealed',busy=drawing.state==='revealing';
    document.getElementById('draw-panel').dataset.state=drawing.state;
    for(const element of document.querySelectorAll('#tools button,#tools select,#tools input,[data-mode]'))element.disabled=busy||revealed;
    undo.disabled=busy||revealed||!drawing.strokes.length;redo.disabled=busy||revealed||!drawing.redoStack.length;clear.disabled=busy||revealed||!drawing.strokes.length;
    title.readOnly=mode!=='free'||busy||revealed;
    status.textContent=busy?copy.revealing:revealed?copy.revealed:drawing.strokes.length?`${copy.hiddenInk} · ${drawing.strokes.length===1?copy.strokeOne:copy.strokeCount.replace('{count}',drawing.strokes.length)}`:'';
    actions.replaceChildren();
    if(revealed){actions.append(button(copy.share,()=>sharing.showResult(record),{symbol:'share',primary:true}),button(copy.replay,()=>play(false),{symbol:'play',iconOnly:true}),button(copy.again,async()=>{if(await canReset())reset(mode,prompt);},{symbol:'pencil'}));}
    else{const reveal=button(copy.reveal,()=>play(true),{symbol:busy?'loading':'play',primary:true});reveal.disabled=busy||!drawing.strokes.length;reveal.id='reveal';actions.append(reveal);}
  }
  function persistDraft(){
    if(drawing.state!=='drawing')return;
    const draft={mode,prompt,title:title.value,strokes:structuredClone(drawing.strokes),updatedAt:Date.now()};
    saveChain=saveChain.catch(()=>{}).then(()=>draft.strokes.length?storage.saveDraft(draft):storage.discardDraft()).catch(()=>toast(copy.storageError));
  }
  function changed(){display();render();clearTimeout(saveTimer);saveTimer=setTimeout(persistDraft,200);}
  title.addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(persistDraft,300);});
  function reset(nextMode='free',nextPrompt=null,persist=true){
    if(drawing.state==='revealed')secondDrawing=true;
    cancelAnimationFrame(animation);drawing.clear();playing=false;mode=nextMode;prompt=nextPrompt;record=null;drawStarted=false;
    title.value=prompt?.prompt||'';title.hidden=mode!=='free';title.closest('.title-field').hidden=mode!=='free';
    const p=document.getElementById('prompt');p.textContent=prompt?.prompt||'';p.hidden=mode==='free';
    for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
    display();render();if(persist){clearTimeout(saveTimer);persistDraft();}
  }
  async function canReset(){if(playing)return false;if(drawing.state==='drawing'&&drawing.strokes.length)return ask(copy.clearConfirm,copy.discard);return true;}
  for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',async()=>{
    if(b.dataset.mode===mode||!await canReset())return;
    reset(b.dataset.mode,b.dataset.mode==='daily'?dailyChallenge(catalog):null);
  });
  function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*480/r.width,y:(e.clientY-r.top)*640/r.height};}
  function showCursor(e){const r=canvas.getBoundingClientRect();cursor.hidden=false;cursor.style.left=`${e.clientX-r.left}px`;cursor.style.top=`${e.clientY-r.top}px`;}
  canvas.addEventListener('pointerdown',e=>{
    if(drawing.state!=='drawing'||e.button>0||drawing.active)return;e.preventDefault();
    if(!drawing.begin(point(e),{tool,color,brush:document.getElementById('brush').value,width:Number(document.getElementById('size').value)},performance.now()))return;
    canvas.setPointerCapture(e.pointerId);showCursor(e);
    if(!drawStarted){drawStarted=true;analytics.track('drawing_start',{mode});if(secondDrawing){analytics.track('draw_again',{mode});secondDrawing=false;}}display();
  });
  canvas.addEventListener('pointermove',e=>{if(!drawing.active)return;for(const event of e.getCoalescedEvents?.()||[e])drawing.append(point(event),performance.now());showCursor(e);});
  function finish(e){if(drawing.finish()){cursor.hidden=true;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);changed();}}
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(drawing.active)drawing.finish();persistDraft();}});
  async function play(first){
    if(playing||!drawing.strokes.length)return;playing=true;cursor.hidden=true;clearTimeout(saveTimer);drawing.state='revealing';display();
    if(first){
      record={id:crypto.randomUUID(),title:title.value.trim()||prompt?.prompt||copy.defaultTitle,prompt:prompt?.prompt||title.value.trim()||copy.defaultTitle,challengeID:prompt?.id||'free-drawing',tag:prompt?.tag||copy.free,mode,canvas:SOURCE_SIZE,strokes:structuredClone(drawing.strokes),createdAt:Date.now()};
      analytics.track('reveal_start',{mode});
      await saveChain;
      try{await storage.save(record);await storage.discardDraft();}catch{toast(copy.storageError);}
    }
    const start=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?100:replayDuration(drawing.pointCount);
    function frame(now){const progress=Math.min(1,(now-start)/duration);renderArtwork(canvas,{canvas:SOURCE_SIZE,strokes:drawing.visible(Math.floor(drawing.pointCount*progress))},{fit:1});
      if(progress<1)animation=requestAnimationFrame(frame);else{drawing.state='revealed';playing=false;render();display();if(first){analytics.track('reveal_complete',{mode});sharing.showResult(record);}}
    }
    animation=requestAnimationFrame(frame);
  }
  function tab(name){
    for(const panel of ['draw','gallery','featured'])document.getElementById(panel+'-panel').hidden=panel!==name;
    for(const b of document.querySelectorAll('.game-tabs [data-tab]'))if(b.dataset.tab===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    if(name==='gallery')library.gallery();if(name==='featured'){analytics.track('featured_view');library.renderFeatured(document.getElementById('featured-items'));}
  }
  for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>tab(b.dataset.tab));
  library.renderFeatured(document.getElementById('featured-preview'),2);
  reset('free',null,false);
  // Load before offering recovery; never silently switch a new day to an old prompt.
  // reset() above must not remove an existing draft before this read.
  const draft=await savedDraft;
  const query=new URLSearchParams(location.search),challenge=prompts.find(p=>p.id===query.get('challenge'));
  if(challenge)reset('featured',challenge);
  else if(draft?.strokes?.length){
    const body=node('div','dialog-body');body.append(node('p',null,copy.restoreBody));
    const dialog=openDialog(copy.restoreTitle,body,copy);
    body.append(button(copy.restore,()=>{reset(draft.mode,draft.prompt);drawing.restore(draft.strokes);title.value=draft.title||'';drawStarted=true;changed();dialog.close();},{primary:true,symbol:'pencil'}),button(copy.discard,()=>{dialog.close();persistDraft();}));
  }
  if(query.get('replay')&&/^[a-f0-9-]{36}$/i.test(query.get('replay'))){
    document.head.append(Object.assign(document.createElement('meta'),{name:'robots',content:'noindex,nofollow'}));
    try{const id=query.get('replay'),payload=await loadPayload(`https://ghostdraw-api.luopeike.com/r/${id}`);
      const official=(await library.featured()).find(item=>item.replayURL.endsWith('/'+id));
      library.record({...payload,id,challengeID:payload.challengeID||official?.challengeID,mode:'shared'},false);
    }catch{toast(copy.loadError);}
  }
}
// Read the draft before any initial UI reset writes to IndexedDB.
function ask(title,label){return new Promise(resolve=>{let confirmed=false;const body=node('div','dialog-body');const dialog=openDialog(title,body,copy,{onClose:()=>resolve(confirmed)});body.append(button(copy.cancel,()=>dialog.close()),button(label,()=>{confirmed=true;dialog.close();},{primary:true}));});}
