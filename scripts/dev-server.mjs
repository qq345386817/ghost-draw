import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const port=Number(process.env.PORT||8877);
http.createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root)throw new Error('path');
  if(pathname.endsWith('/'))file=path.join(file,'index.html');
  else if(!path.extname(file))file+='.html';
  await stat(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Ghost Draw: http://127.0.0.1:${port}/zh-Hans/`));
