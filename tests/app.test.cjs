const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
class Element{
 constructor(){this.value='';this.children=[];this.textContent=''}
 append(...x){this.children.push(...x)}
 replaceChildren(){this.children=[]}
}
async function boot(fail=false,related=false){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 get('filter').value='all';
 const url='https://note.com/g_kujo_ir/n/nabc';
 const storage=new Map([['george-reader-v03',JSON.stringify([{url,title:'Saved',source:'note',read:true,favorite:true}])]]);
 const otherUrl='https://news.yahoo.co.jp/articles/abc';
 const articles=[{url,title:'New title',source:'note',published:'2026-11-01T00:00:00Z'}, {url:related?otherUrl:'https://note.com/g_kujo_ir/n/ndef',title:'Other',source:related?'yahoo':'note',published:'2026-11-02T00:00:00Z'}];
 if(related){articles[0].relatedUrls=[otherUrl];articles[1].relatedUrls=[url]}
 const context=vm.createContext({document:{getElementById:get,createElement:()=>new Element(),addEventListener(){}},navigator:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URL,Blob,Date,Map,setTimeout,confirm:()=>true,fetch:async()=>{if(fail)throw Error();return {ok:true,json:async()=>({schemaVersion:1,updatedAt:'2026-11-02T00:00:00Z',sources:{note:{status:'ok',count:2}},articles})}}});
 vm.runInContext(fs.readFileSync('app.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 return {get,context,storage};
}
test('automatic load merges v0.3 flags, sorts and preserves favorite changes',async()=>{
 const {get,storage}=await boot();
 assert.equal(get('count').textContent,'(2/2)');
 assert.equal(get('items').children[0].children[0].textContent,'Other');
 assert.match(get('items').children[1].children[1].textContent,/既読.*★/);
 get('items').children[0].children[2].children[1].onclick();
 assert.equal(JSON.parse(storage.get('george-reader-v03')).find(x=>x.title==='Other').favorite,true);
 get('filter').value='favorites';get('filter').onchange();
 assert.equal(get('count').textContent,'(2/2)');
});
test('failure preserves saved entries and shows status',async()=>{
 const {get}=await boot(true);
 assert.equal(get('count').textContent,'(1/1)');assert.match(get('sync').textContent,/取得できません/);
});
test('related media share one card without rewriting existing flags on load',async()=>{
 const {get,storage}=await boot(false,true);
 assert.equal(get('count').textContent,'(1/1)');
 const card=get('items').children[0];
 assert.match(card.children[1].textContent,/一部既読.*★/);
 assert.equal(card.children[3].children.length,3);
 assert.match(card.children[3].children[1].textContent,/Yahoo/);
 assert.equal(JSON.parse(storage.get('george-reader-v03')).length,1);
 card.children[3].children[1].onclick();
 const rows=JSON.parse(storage.get('george-reader-v03'));
 assert.ok(rows.every(x=>x.read));
 assert.equal(rows.find(x=>x.source==='note').favorite,true);
 assert.equal(rows.find(x=>x.source==='yahoo').favorite,undefined);
 get('filter').value='unread';get('filter').onchange();
 assert.equal(get('count').textContent,'(0/1)');
});

test('group filters keep all media choices and favorite changes apply to entire card',async()=>{
 const {get,storage}=await boot(false,true);
 get('filter').value='note';get('filter').onchange();
 assert.equal(get('items').children[0].children[0].href,'https://note.com/g_kujo_ir/n/nabc');
 assert.equal(get('items').children[0].children[3].children.length,3);
 get('items').children[0].children[2].children[1].onclick();
 assert.ok(JSON.parse(storage.get('george-reader-v03')).every(x=>!x.favorite));
 get('items').children[0].children[2].children[1].onclick();
 assert.ok(JSON.parse(storage.get('george-reader-v03')).every(x=>x.favorite));
 get('search').value='Other';get('filter').value='all';get('search').oninput();
 assert.equal(get('count').textContent,'(1/1)');
 get('items').children[0].children[2].children[2].onclick();
 assert.equal(get('count').textContent,'(0/0)');
 assert.equal(JSON.parse(storage.get('george-reader-hidden')).length,2);
 await get('refresh').onclick();assert.equal(get('count').textContent,'(0/0)');
});

test('grouping handles asymmetric relations and missing URLs without merging unrelated cards',async()=>{
 const {context}=await boot();
 const groups=vm.runInContext(`articleGroups([
 {url:'a',source:'agora',relatedUrls:['b','missing']},
 {url:'b',source:'yahoo',relatedUrls:['c']},
 {url:'c',source:'note'},
 {url:'d',source:'note',title:'Similar headline'}])`,context);
 assert.equal(groups.length,2);assert.equal(groups[0].length,3);assert.equal(groups[1].length,1);
});

test('mark all read covers filtered-out articles and preserves favorites after refresh',async()=>{
 const {get,storage}=await boot();
 get('filter').value='favorites';get('filter').onchange();
 get('search').value='Saved';get('search').oninput();
 get('mark-all-read').onclick();
 let rows=JSON.parse(storage.get('george-reader-v03'));
 assert.equal(rows.length,2);
 assert.ok(rows.every(x=>x.read));
 assert.equal(rows.find(x=>x.title==='Saved').favorite,true);
 assert.equal(get('mark-all-read').disabled,true);
 assert.match(get('bulk-status').textContent,/1件/);
 await get('refresh').onclick();
 get('filter').value='unread';get('search').value='';get('filter').onchange();
 assert.equal(get('count').textContent,'(0/2)');
});

test('mark all read excludes hidden articles',async()=>{
 const {get,storage}=await boot();
 get('items').children[0].children[2].children[2].onclick();
 const hidden=storage.get('george-reader-hidden');
 assert.equal(get('mark-all-read').disabled,true);
 get('mark-all-read').onclick();
 assert.equal(storage.get('george-reader-hidden'),hidden);
 assert.equal(JSON.parse(storage.get('george-reader-v03')).length,1);
});
