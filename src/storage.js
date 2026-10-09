const NAME='ghostdraw-local';
let connection;
async function open() {
  if(connection) return connection;
  connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('drawings',{keyPath:'id'});request.result.createObjectStore('drafts',{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{connection=null;reject(request.error);};
    request.onblocked=()=>{connection=null;reject(new Error('storage_blocked'));};
  });
  return connection;
}
async function transaction(store,method,value) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,method==='getAll'||method==='get'?'readonly':'readwrite');
    const request=tx.objectStore(store)[method](value);let result;
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('storage_aborted'));
  });
}
export const drawingStorage={
  save:record=>transaction('drawings','put',record),
  list:async()=>{const rows=await transaction('drawings','getAll');return rows.sort((a,b)=>b.createdAt-a.createdAt);},
  remove:id=>transaction('drawings','delete',id),
  saveDraft:draft=>transaction('drafts','put',{...draft,id:'current'}),
  loadDraft:()=>transaction('drafts','get','current'),
  discardDraft:()=>transaction('drafts','delete','current')
};
