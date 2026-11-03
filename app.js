const KEY='george-reader-v03';const $=id=>document.getElementById(id);let entries=[];let catalog=[];let hidden=[];try{hidden=JSON.parse(localStorage.getItem('george-reader-hidden')||'[]');if(!Array.isArray(hidden))hidden=[]}catch{}try{entries=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(entries))entries=[]}catch{}const domains={agora:['agora-web.jp'],yahoo:['news.yahoo.co.jp'],note:['note.com']};function valid(url,source){try{const u=new URL(url);return u.protocol==='https:'&&domains[source].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))}catch{return false}}function allEntries(){const map=new Map(entries.map(x=>[x.url,x]));for(const x of catalog){if(hidden.includes(x.url))continue;const prior=map.get(x.url);map.set(x.url,{...x,...prior,published:x.published,relatedUrls:x.relatedUrls})}return [...map.values()].sort((a,b)=>(b.published||b.added||'').localeCompare(a.published||a.added||''))}function update(item){const i=entries.findIndex(x=>x.url===item.url);if(i<0)entries.push(item);else entries[i]=item;persist()}function persist(){localStorage.setItem(KEY,JSON.stringify(entries));render()}const sourceLabels={agora:'アゴラ',yahoo:'Yahoo!ニュース',note:'note'};
function articleGroups(items){
 const byUrl=new Map(items.map(x=>[x.url,x]));
 const neighbors=new Map(items.map(x=>[x.url,new Set()]));
 for(const item of items)for(const url of Array.isArray(item.relatedUrls)?item.relatedUrls:[]){
  const other=byUrl.get(url);
  if(!other||other.source===item.source)continue;
  neighbors.get(item.url).add(url);neighbors.get(url).add(item.url);
 }
 const seen=new Set(),groups=[];
 for(const item of items){
  if(seen.has(item.url))continue;
  const group=[],pending=[item.url];seen.add(item.url);
  while(pending.length){const url=pending.pop();group.push(byUrl.get(url));for(const next of neighbors.get(url))if(!seen.has(next)){seen.add(next);pending.push(next)}}
  groups.push(group);
 }
 return groups;
}
function updateGroup(group,changes){
 const merged=new Map(entries.map(x=>[x.url,x]));
 for(const item of group)merged.set(item.url,{...item,...changes});
 entries=[...merged.values()];persist();
}
function render(){
 const list=$('items');list.replaceChildren();
 const q=$('search').value.toLowerCase(),f=$('filter').value,combined=allEntries();
 const groups=articleGroups(combined);
 const matches=item=>(f==='all'||item.source===f||f==='favorites'&&item.favorite||f==='unread'&&!item.read)&&(item.title+' '+item.url).toLowerCase().includes(q);
 const shown=groups.filter(group=>group.some(matches));
 $('mark-all-read').disabled=!combined.some(x=>!x.read);
 $('count').textContent='('+shown.length+'/'+groups.length+')';
 for(const group of shown){
  const item=group.find(matches),read=group.every(x=>x.read),favorite=group.some(x=>x.favorite);
  const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('div'),tools=document.createElement('div');
  li.className='article-card';
  a.href=item.url;a.target='_blank';a.rel='noopener';a.textContent=item.title||item.url;
  a.onclick=()=>updateGroup(group,{read:true});
  meta.className='meta';meta.textContent=[...new Set(group.map(x=>sourceLabels[x.source]))].join(' / ')+' · '+(read?'既読':group.some(x=>x.read)?'一部既読':'未読')+(item.published?' · '+new Date(item.published).toLocaleDateString('ja-JP'):'')+(favorite?' · ★':'');
  tools.className='tools';
  for(const [label,act,cls] of [
   [read?'未読にする':'既読にする',()=>updateGroup(group,{read:!read}),'secondary'],
   [favorite?'★解除':'☆お気に入り',()=>updateGroup(group,{favorite:!favorite}),'secondary'],
   ['削除',()=>{if(confirm(group.length>1?'この記事を全ての媒体から一覧削除しますか？':'この記事を削除しますか？')){const urls=new Set(group.map(x=>x.url));entries=entries.filter(x=>!urls.has(x.url));hidden=[...new Set([...hidden,...urls])];localStorage.setItem('george-reader-hidden',JSON.stringify(hidden));persist()}},'danger']
  ]){const button=document.createElement('button');button.textContent=label;button.className=cls;button.onclick=act;tools.append(button)}
  li.append(a,meta,tools);
  if(group.length>1){
   const links=document.createElement('div');links.className='related';
   const label=document.createElement('span');label.textContent='読む媒体を選ぶ: ';links.append(label);
   for(const other of group){const link=document.createElement('a');link.href=other.url;link.target='_blank';link.rel='noopener';link.textContent=sourceLabels[other.source]+' ↗';link.onclick=()=>updateGroup(group,{read:true});links.append(link)}
   li.append(links);
  }
  list.append(li);
 }
 if(!shown.length){const li=document.createElement('li');li.textContent='該当する記事はありません';list.append(li)}
}
$('search').oninput=render;$('filter').onchange=render;$('export').onclick=()=>{const b=new Blob([JSON.stringify(allEntries(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='george-reader-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('import').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw Error();const good=data.filter(x=>x&&domains[x.source]&&valid(x.url,x.source)).map(x=>({url:x.url,title:typeof x.title==='string'?x.title.slice(0,250):'',source:x.source,read:!!x.read,favorite:!!x.favorite,added:typeof x.added==='string'?x.added:'',published:typeof x.published==='string'?x.published:''}));entries=[...good,...entries].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i);persist();$('import-status').textContent=good.length+'件読み込みました'}catch{$('import-status').textContent='読み込みに失敗しました'}e.target.value=''};render();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
let refreshing=false;
async function refresh(){
 if(refreshing)return;refreshing=true;$('refresh').disabled=true;
 try{
  const response=await fetch('./data/articles.json',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(data.schemaVersion!==1||!Array.isArray(data.articles))throw Error('invalid catalog');
  catalog=data.articles.filter(x=>x&&domains[x.source]&&valid(x.url,x.source)&&typeof x.title==='string'&&typeof x.published==='string');
  const labels={agora:'アゴラ',yahoo:'Yahoo!ニュース',note:'note'};
  $('sync').textContent='一覧更新: '+new Date(data.updatedAt).toLocaleString('ja-JP')+' · '+catalog.length+'件';
  $('sources').textContent=Object.entries(data.sources||{}).map(([key,s])=>labels[key]+': '+(s.status==='ok'?s.count+'件取得'+(s.pages?'（'+s.pages+'ページ）':''):s.status==='partial'?s.count+'件取得（一部の過去記事は未取得）':'取得できませんでした（保存済みの記事を表示）')).join(' / ');
  render();
 }catch{ $('sync').textContent='新しい一覧を取得できませんでした。保存済みの記事を表示しています。'; }
 finally{refreshing=false;$('refresh').disabled=false}
}
$('refresh').onclick=refresh;refresh();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});


$('mark-all-read').onclick=()=>{const unread=allEntries().filter(x=>!x.read);if(!unread.length)return;const merged=new Map(entries.map(x=>[x.url,x]));for(const item of unread)merged.set(item.url,{...item,read:true});entries=[...merged.values()];persist();$('bulk-status').textContent=unread.length+'件を既読にしました。';};
