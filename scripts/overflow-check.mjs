// Is anything on a route wider than the phone it is being read on?
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
const ORIGIN = 'http://localhost:5173';
function env(n){for(const f of ['.env.local','.env']){let t;try{t=readFileSync(f,'utf8').replace(/^﻿/,'')}catch{continue}
const l=t.split(/\r?\n/).find(x=>x.startsWith(n+'='));if(l)return l.slice(n.length+1).trim().replace(/^["']|["']$/g,'')}return''}
const anon=env('VITE_SUPABASE_ANON_KEY');
const ref=JSON.parse(Buffer.from(anon.split('.')[1],'base64').toString('utf8')).ref;
const url=env('VITE_SUPABASE_URL')||`https://${ref}.supabase.co`;
const creds=JSON.parse(readFileSync('artist-credentials.json','utf8'));
const row=creds.find(c=>c.name===(process.env.AS||'N3M3SIS'));
const sb=createClient(url,anon,{auth:{persistSession:false}});
const {data}=await sb.auth.signInWithPassword({email:row.email,password:row.password});
const s=data.session;
const storageState={cookies:[],origins:[{origin:ORIGIN,localStorage:[{name:`sb-${ref}-auth-token`,value:JSON.stringify({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,expires_in:s.expires_in,token_type:'bearer',user:s.user})}]}]};
const b=await chromium.launch({channel:'chrome'});
const ctx=await b.newContext({viewport:{width:Number(process.env.WIDTH||390),height:844},storageState});
const p=await ctx.newPage();
const route = '/' + (process.env.ROUTE || 'artist/11').replace(/^[/]+/, '');
await p.goto(ORIGIN + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(9000);
const out=await p.evaluate(()=>{
  const vw=document.documentElement.clientWidth;
  const scroller=(el)=>{let n=el.parentElement;while(n&&n!==document.body){const ov=getComputedStyle(n).overflowX;if(ov==='auto'||ov==='scroll')return true;n=n.parentElement}return false};
  const bad=[];
  for(const el of document.querySelectorAll('body *')){
    const r=el.getBoundingClientRect();
    if(r.width===0||r.height===0)continue;
    if(r.right>vw+1&&!scroller(el)) bad.push(el);
  }
  const chain=(el)=>{const out=[];let n=el;for(let i=0;i<6&&n&&n!==document.body;i++){const r=n.getBoundingClientRect();out.push(n.tagName.toLowerCase()+'.'+String(n.className||'').split(' ').slice(0,4).join('.')+' ['+Math.round(r.left)+','+Math.round(r.right)+'] w='+Math.round(r.width));n=n.parentElement}return out};
  const widest=bad.sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right)[0];
  return {vw,count:bad.length,
    offenders:bad.slice(0,6).map(e=>({tag:e.tagName.toLowerCase(),cls:String(e.className||'').slice(0,70),right:Math.round(e.getBoundingClientRect().right),text:(e.textContent||'').trim().slice(0,30)})),
    widestChain: widest?chain(widest):null};
});
console.log(JSON.stringify(out,null,2));
if (process.env.SHOT) {
  if (process.env.SCROLL_TO) {
    await p.locator(process.env.SCROLL_TO).first().scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(1500);
  }
  await p.screenshot({ path: process.env.SHOT, timeout: 30000 });
  console.log('shot -> ' + process.env.SHOT);
}
await b.close();
