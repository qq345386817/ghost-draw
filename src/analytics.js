const ENABLED='gd.analytics.enabled',INSTALL='gd.analytics.installation',FIRST='gd.analytics.first',QUEUE='gd.analytics.queue';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const names=new Set(['first_open','app_open','drawing_start','reveal_start','reveal_complete','draw_again','share_open','share_complete','share_failed','history_view','featured_view','replay_start','replay_complete','challenge_start','app_store_click','image_download']);
const values={mode:['free','daily','random','featured','history','shared'],kind:['image','link','app'],entry:['fresh','returning'],origin:['owner','recipient'],outcome:['success','cancelled','failed','unsupported'],duration_bucket:['under_15s','15_to_59s','1_to_4m','5m_plus'],reason:['offline','network','too_large','storage','unknown']};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const safe=(name,properties)=>names.has(name)&&properties&&typeof properties==='object'&&!Array.isArray(properties)&&Object.entries(properties).every(([k,v])=>values[k]?.includes(v));

export class WebAnalytics {
  constructor(config) {
    this.config=config;this.enabled=read(ENABLED,true)!==false;this.sessionID=crypto.randomUUID();this.lastEvent=Date.now();
    const stored=read(QUEUE,[]);this.queue=(Array.isArray(stored)?stored:[]).filter(e=>e&&uuid(e.id)&&uuid(e.sessionID)&&safe(e.name,e.properties)&&Date.now()-Date.parse(e.occurredAt)<30*86400000).slice(-200).map(e=>({id:e.id,name:e.name,occurredAt:e.occurredAt,properties:e.properties,sessionID:e.sessionID,locale:e.locale||config.locale,version:e.version||config.version,build:e.build||config.build}));
    const installation=read(INSTALL,null);this.installationID=uuid(installation)?installation:crypto.randomUUID();write(INSTALL,this.installationID);
    this.production=location.hostname==='ghost-draw.luopeike.com'&&!navigator.webdriver;
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.flush(true);});
    if(!this.enabled){this.queue=[];write(QUEUE,[]);}
  }
  start() {
    if(!this.enabled) return;
    if(!read(FIRST,false)){this.track('first_open',{entry:'fresh'});write(FIRST,true);}
    this.track('app_open');
  }
  setEnabled(value) {
    this.enabled=value;write(ENABLED,value);
    if(!value){clearTimeout(this.timer);this.timer=null;this.pending?.abort();this.queue=[];write(QUEUE,[]);}
    else this.track('app_open',{entry:'returning'});
  }
  track(name,properties={}) {
    if(!this.enabled||!this.production||!safe(name,properties)) return;
    if(Date.now()-this.lastEvent>30*60000)this.sessionID=crypto.randomUUID();
    this.lastEvent=Date.now();
    this.queue.push({id:crypto.randomUUID(),name,occurredAt:new Date().toISOString(),properties,sessionID:this.sessionID,locale:this.config.locale,version:this.config.version,build:this.config.build});
    this.queue=this.queue.slice(-200);write(QUEUE,this.queue);
    if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush();},2500);
  }
  async flush(keepalive=false) {
    if(!this.enabled||!this.production||this.uploading||!this.queue.length) return;
    this.uploading=true;const first=this.queue[0],sessionID=first.sessionID;
    const queued=this.queue.filter(e=>e.sessionID===sessionID&&e.locale===first.locale&&e.version===first.version&&e.build===first.build).slice(0,20);
    const events=queued.map(e=>({id:e.id,name:e.name,occurredAt:e.occurredAt,properties:e.properties}));this.pending=new AbortController();
    const body={schemaVersion:1,appID:'ghostdraw',installationID:this.installationID,sessionID,
      context:{appVersion:first.version,buildNumber:first.build,platform:'web',osVersion:'browser',locale:first.locale,environment:'production'},events};
    try {
      const response=await fetch(this.config.analyticsEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive,signal:this.pending.signal});
      if(response.ok||(response.status>=400&&response.status<500&&![408,429].includes(response.status))){
        const ids=new Set(events.map(e=>e.id));this.queue=this.queue.filter(e=>!ids.has(e.id));write(QUEUE,this.queue);
      }
    } catch { /* Drawing never depends on an analytics request. */ }
    finally{this.uploading=false;this.pending=null;}
    if(this.enabled&&this.queue.length&&!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush();},15000);
  }
  async deleteHistory() {
    this.setEnabled(false);
    const r=await fetch(this.config.analyticsDeleteEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationID:this.installationID,platform:'web'})});
    if(!r.ok)throw new Error('analytics_delete_failed');
    this.installationID=crypto.randomUUID();write(INSTALL,this.installationID);
  }
}
