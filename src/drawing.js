import simplify from 'simplify-js';

export const SOURCE_SIZE = {width: 480, height: 640};
export const COLORS = {ink:'#181818',ghostBlue:'#17c8e8',mint:'#34d399',tomato:'#ef4444',coral:'#fb923c',gold:'#facc15',lime:'#84cc16',violet:'#a855f7',magenta:'#ec4899',midnight:'#6366f1'};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export class BlindDrawing {
  constructor() { this.strokes=[]; this.redoStack=[]; this.active=null; this.state='drawing'; }
  get pointCount() { return this.strokes.reduce((n,s)=>n+s.points.length,0); }
  get strokeCount() { return this.strokes.length+(this.active?1:0); }
  begin(point, settings, time) {
    if(this.state!=='drawing' || this.strokes.length>=180) return false;
    this.active={id:crypto.randomUUID(),...settings,points:[{x:clamp(point.x,0,480),y:clamp(point.y,0,640),t:0}]};
    this.startedAt=time; this.redoStack=[]; return true;
  }
  append(point, time) {
    if(!this.active) return;
    const p={x:clamp(point.x,0,480),y:clamp(point.y,0,640),t:Math.max(0,(time-this.startedAt)/1000)};
    const pts=this.active.points, last=pts.at(-1);
    if(Math.hypot(p.x-last.x,p.y-last.y)<0.25) return;
    if(this.active.tool==='circle'||this.active.tool==='square') this.active.points=[pts[0],p];
    else { pts.push(p); if(pts.length>6000) this.active.points=pts.filter((_,i)=>i===0||i===pts.length-1||i%2===0); }
  }
  finish() {
    if(!this.active) return false;
    if(this.active.points.length===1) this.active.points.push({...this.active.points[0],t:0.001});
    this.strokes.push(this.active); this.active=null; return true;
  }
  undo() { if(this.state==='drawing' && this.strokes.length) this.redoStack.push(this.strokes.pop()); }
  redo() { if(this.state==='drawing' && this.redoStack.length) this.strokes.push(this.redoStack.pop()); }
  clear() { this.strokes=[]; this.redoStack=[]; this.active=null; this.state='drawing'; }
  restore(strokes) { this.clear(); this.strokes=structuredClone(strokes); }
  visible(pointCount) {
    const result=[]; let left=pointCount;
    for(const stroke of this.strokes) {
      if(left<=0) break;
      if(left>=stroke.points.length) {result.push(stroke);left-=stroke.points.length;}
      else {const points=stroke.points.slice(0,left);if(stroke.tool!=='pen'&&stroke.tool!=='star'&&points.length===1)points.push(points[0]);result.push({...stroke,points});break;}
    }
    return result;
  }
}

function pressurePoints(points, width) {
  const taperCount=clamp(Math.floor(points.length/6),2,9);
  return points.map((p,i)=>{
    const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)];
    const dt=Math.max(0.016,after.t-before.t),speed=Math.hypot(after.x-before.x,after.y-before.y)/dt;
    const speedFactor=clamp(1.18-speed/2200,0.45,1.18);
    const distance=Math.min(i,points.length-1-i);
    const taper=0.4+0.6*Math.min(1,distance/taperCount);
    return {...p,w:Math.max(1,width*speedFactor*taper)};
  });
}

function variableLine(ctx, points, color, multiplier, alpha, cap='round') {
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=alpha;ctx.lineCap=cap;ctx.lineJoin='round';
  if(points.length===1){ctx.beginPath();ctx.arc(points[0].x,points[0].y,points[0].w*multiplier/2,0,Math.PI*2);ctx.fill();return;}
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];ctx.lineWidth=(a.w+b.w)*multiplier/2;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
}

function star(ctx,x,y,size){ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?size*.42:size,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();}

export function drawStroke(ctx, stroke) {
  if(!stroke.points?.length) return;
  const color=COLORS[stroke.color]||COLORS.ink, width=stroke.width||7;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;
  const points=stroke.points;
  if(stroke.tool==='star') {
    let previous=null;
    for(const p of points) {if(previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<Math.max(12,width*2))continue;star(ctx,p.x,p.y,Math.max(7,width*1.3));ctx.stroke();previous=p;}
  } else if(stroke.tool==='circle'||stroke.tool==='square') {
    const a=points[0],b=points.at(-1),x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.max(0.1,Math.abs(a.x-b.x)),h=Math.max(0.1,Math.abs(a.y-b.y));
    if(stroke.brush==='neon'){ctx.shadowBlur=width*2;ctx.shadowColor=color;}
    if(stroke.brush==='highlighter'){ctx.globalAlpha=.4;ctx.lineWidth*=2;}
    ctx.beginPath();if(stroke.tool==='circle')ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);else ctx.rect(x,y,w,h);ctx.stroke();
  } else {
    const pressure=pressurePoints(points,width);
    switch(stroke.brush) {
      case 'marker':variableLine(ctx,pressure,color,1.48,.78);variableLine(ctx,pressure,color,.72,1);break;
      case 'highlighter':variableLine(ctx,pressure,color,2.2,.34,'square');break;
      case 'crayon':
        for(const [x,y] of [[-1.5,.8],[1.1,-1.2],[.4,1.7]]){ctx.save();ctx.translate(x,y);variableLine(ctx,pressure,color,.82,.44);ctx.restore();}break;
      case 'dotted': {
        let previous=null;ctx.globalAlpha=.9;
        for(const p of pressure){if(previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<Math.max(6,p.w*2))continue;ctx.beginPath();ctx.arc(p.x,p.y,p.w/2,0,Math.PI*2);ctx.fill();previous=p;}break;
      }
      case 'neon':ctx.shadowBlur=width*2;ctx.shadowColor=color;variableLine(ctx,pressure,color,3.2,.22);variableLine(ctx,pressure,color,1.8,.52);variableLine(ctx,pressure,color,.62,1);break;
      default:variableLine(ctx,pressure,color,1,1);
    }
  }
  ctx.restore();
}

export function renderArtwork(canvas, record, {grid=true,fit=.86,blank=false,paper='#fafaf5'}={}) {
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
  if(grid){ctx.strokeStyle='#e8edf1';ctx.lineWidth=Math.max(.5,w/700);const step=w/12;ctx.beginPath();for(let x=step;x<w;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=step;y<h;y+=step){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();}
  if(blank||!record) return;
  const size=record.canvas||SOURCE_SIZE,scale=Math.min(w/size.width,h/size.height)*fit;
  ctx.save();ctx.translate((w-size.width*scale)/2,(h-size.height*scale)/2);ctx.scale(scale,scale);
  for(const stroke of record.strokes)drawStroke(ctx,stroke);
  ctx.restore();
}

export function dailyIndex(date, count) {
  const ordinal=Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.parse('0001-01-01T00:00:00Z'))/86400000)+1;
  return ordinal%count;
}

export function replayDuration(pointCount) { return Math.min(6000,Math.max(2200,pointCount*12)); }

export function makeReplayPayload(record, locale, copy) {
  let tolerance=.35;
  for(let attempt=0;attempt<9;attempt++) {
    const strokes=record.strokes.map(s=>{
      let points=s.tool==='pen'||s.tool==='star'?simplify(s.points,tolerance,true):s.points;
      if(points.length>650){const step=(points.length-1)/649;points=Array.from({length:650},(_,i)=>points[Math.round(i*step)]);}
      return {width:s.width,color:s.color,tool:s.tool,brush:s.brush,points:points.map(p=>({x:p.x,y:p.y,t:p.t}))};
    });
    const payload={title:record.title||copy.defaultTitle,prompt:record.prompt||record.title||copy.defaultTitle,tag:record.tag||copy.free,
      comment:copy.verdict,persona:'friendly',locale,challengeID:record.challengeID||'free-drawing',canvas:record.canvas||SOURCE_SIZE,strokes};
    const bytes=new TextEncoder().encode(JSON.stringify(payload)).length;
    if(bytes<=180000&&strokes.reduce((n,s)=>n+s.points.length,0)<=20000) return payload;
    tolerance*=2;
  }
  throw new Error('too_large');
}

export function validateReplay(payload) {
  if(!payload?.canvas||!Number.isFinite(payload.canvas.width)||!Number.isFinite(payload.canvas.height)||payload.canvas.width<=0||payload.canvas.height<=0||payload.canvas.width>4096||payload.canvas.height>4096) return false;
  if(!Array.isArray(payload.strokes)||payload.strokes.length===0||payload.strokes.length>180) return false;
  let total=0;
  return payload.strokes.every(s=>Number.isFinite(s.width)&&s.width>=1&&s.width<=80&&Array.isArray(s.points)&&s.points.length>0&&s.points.length<=650&&s.points.every(p=>{total++;return total<=20000&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.t);}));
}
