import {createElement,Pencil,Circle,Square,Star,Undo2,Redo2,Trash2,Play,Pause,Download,Link,Share2,X,Globe,Settings2,ArrowRight,Check,LoaderCircle,ExternalLink} from 'lucide';
const icons={pencil:Pencil,circle:Circle,square:Square,star:Star,undo:Undo2,redo:Redo2,trash:Trash2,play:Play,pause:Pause,download:Download,link:Link,share:Share2,close:X,globe:Globe,settings:Settings2,arrow:ArrowRight,check:Check,loading:LoaderCircle,external:ExternalLink};
export function icon(name){const svg=createElement(icons[name]||Pencil);svg.setAttribute('aria-hidden','true');return svg;}
export function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
export function button(label,action,{symbol,primary=false,iconOnly=false}={}){
  const b=node('button',primary?'button primary':'button');b.type='button';b.title=label;b.setAttribute('aria-label',label);
  if(symbol)b.append(icon(symbol));if(!iconOnly)b.append(node('span',null,label));else b.classList.add('icon-button');
  if(action)b.addEventListener('click',action);return b;
}
export function toast(message){const e=document.getElementById('toast');e.textContent=message;e.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{e.hidden=true;},5000);}
export function openDialog(title,body,copy,{onClose}={}){
  for(const existing of document.querySelectorAll('dialog[open]'))existing.close();
  const dialog=document.createElement('dialog');dialog.className='game-dialog';
  const header=node('div','dialog-header');const heading=node('h2',null,title);heading.id='dialog-'+crypto.randomUUID();
  dialog.setAttribute('aria-labelledby',heading.id);const close=button(copy.close,()=>dialog.close(),{symbol:'close',iconOnly:true});
  header.append(heading,close);dialog.append(header,body);document.body.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{onClose?.();dialog.remove();},{once:true});dialog.showModal();return dialog;
}
export function confirmAction(title,copy){return new Promise(resolve=>{
  let confirmed=false;const body=node('div','dialog-body');const actions=node('div','dialog-actions');
  const dialog=openDialog(title,body,copy,{onClose:()=>resolve(confirmed)});
  actions.append(button(copy.cancel,()=>dialog.close()),button(copy.delete,()=>{confirmed=true;dialog.close();},{primary:true,symbol:'trash'}));body.append(actions);
});}
export function installIcons(){for(const e of document.querySelectorAll('[data-icon]'))e.replaceChildren(icon(e.dataset.icon));}
