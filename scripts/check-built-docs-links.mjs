#!/usr/bin/env node
// Generated internal link/asset and source edit-target checks, without provider traffic.
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const base = resolve(process.argv[2] ?? fileURLToPath(new URL('../docs-site/build', import.meta.url)));
async function walk(dir) { const out = []; for (const entry of await readdir(dir,{withFileTypes:true})) { const p=resolve(dir,entry.name); if(entry.isDirectory())out.push(...await walk(p));else if(entry.isFile()&&p.endsWith('.html'))out.push(p); }return out; }
const pages=await walk(base);if(!pages.length)throw new Error('Generated documentation is missing.');
const data=new Map(await Promise.all(pages.map(async p=>[p,await readFile(p,'utf8')]))),problems=[];let links=0,assets=0,editLinks=0;
async function target(pathname) { const p=resolve(base,'.'+pathname);if(!p.startsWith(base+sep)&&p!==base)throw new Error('Escaping internal path');for(const candidate of [p,p+'.html',resolve(p,'index.html')]){try{if((await stat(candidate)).isFile())return candidate;}catch{}}return null; }
for(const [page,html] of data){
 for(const match of html.matchAll(/<(a|img|script|link)\b([^>]*?)\b(href|src)=["']([^"']+)["']/g)){
  const [,tag,,attribute,raw]=match,href=raw.replace(/&amp;/g,'&');if(!href||href.startsWith('data:')||href.startsWith('mailto:'))continue;
  if(tag==='a'&&href.startsWith('https://github.com/reasance/simagents.io/edit/')){
   editLinks++;if(href.includes('/../')||!href.startsWith('https://github.com/reasance/simagents.io/edit/main/docs/public/'))problems.push(`${page}: malformed edit link ${href}`);
   const docPath=decodeURIComponent(href.slice('https://github.com/reasance/simagents.io/edit/main/docs/public/'.length));
   const sourceRoot=fileURLToPath(new URL('../docs/public',import.meta.url)),source=resolve(sourceRoot,docPath);
   if(!source.startsWith(sourceRoot+sep))problems.push(`${page}: escaping edit source`);
   try{if(!(await stat(source)).isFile())throw new Error();}catch{problems.push(`${page}: missing edit source ${docPath}`);}continue;
  }
  if(tag==='a'&&href.includes('/../'))problems.push(`${page}: dot-segment link ${href}`);
  const url=new URL(href,'https://doc.simagents.io'+(page.slice(base.length).replace(/index\.html$/,'')||'/'));
  if(url.origin!=='https://doc.simagents.io')continue;
  const file=await target(decodeURIComponent(url.pathname));if(!file){problems.push(`${page}: missing ${attribute} target ${href}`);continue;}
  if(tag==='a'){
   links++;if(url.hash&&file.endsWith('.html')){const content=data.get(file)??await readFile(file,'utf8');const id=decodeURIComponent(url.hash.slice(1));const ids=[...content.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);if(!ids.includes(id))problems.push(`${page}: missing anchor ${href}`);}
  }else assets++;
 }
}
if(!editLinks)problems.push('No documentation edit links were rendered.');
if(problems.length)throw new Error(problems.join('\n'));
console.log(JSON.stringify({status:'passed-generated-doc-links-assets',pages:pages.length,internalLinks:links,assets,editLinks,externalLinks:'Separately checked and documented; never auto-waived.'}));
