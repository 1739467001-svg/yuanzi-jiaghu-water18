import {useState,useMemo,useRef,useEffect,useCallback} from 'react';
import {ArrowUpRight,ArrowRight,Compass,BookOpen,MessageCircle,Sun,Moon,Settings2,Volume2,VolumeX,Plus,Minus,LocateFixed,RotateCcw,ChevronRight,ChevronLeft,Search,Bookmark,MapPin,Users,Send,Sparkles,Leaf,Footprints,Check,Trash2,SlidersHorizontal,ExternalLink,PanelRightClose,PanelRightOpen,X,Clock,Sparkle} from 'lucide-react';
import World from './world/World.jsx';
import {WorldEngine} from './world/engine.js';
import {createWorldLink} from './world/net.js';
import {PLACES,AGENTS,THEMES,MAP_VERSION} from './world/config.js';
import {demoReply} from './demo.mjs';
import {useCatalog} from './content/useCatalog.js';
import {guideReply,GUIDE_AGENT,GUIDE_QUESTIONS} from './content/guide.js';
import {SHARED_EXHIBITION,exhibitionZone,exhibitionZoneCount,exhibitionEntries} from './content/exhibition.js';
import {readStore,writeStore,memoryFor,newMemory,isExpired,memoryRemainingDays,MEMORY_TTL_DAYS} from './storage.js';
import Dialog from './Dialog.jsx';
const staticDemo=import.meta.env.VITE_STATIC_DEMO==='true';
const assetUrl=path=>import.meta.env.BASE_URL+path.replace(/^\//,'');
 const initialEvents=[{id:'welcome',text:'山门已开，欢迎来到原子江湖',kind:'welcome',time:Date.now()}];
function useSaved(key,fallback){const [v,set]=useState(()=>readStore(key,fallback));const update=n=>set(prev=>{const next=typeof n==='function'?n(prev):n;writeStore(key,next);return next;});return [v,update];}
const Avatar=({agent,size=36})=><span className="avatar" style={{'--avatar-color':agent?.color||'#427ab5',width:size,height:size}}><span className="avatar-hat"/><span className="avatar-eyes">••</span></span>;
export default function App(){
 // 联机演示身份：同一标签页刷新后保持（sessionStorage），不同标签页互相独立。
 const selfId=useMemo(()=>{let id=sessionStorage.getItem('atom-jianghu:player-id');if(!id){id='p_'+Math.random().toString(36).slice(2,10);sessionStorage.setItem('atom-jianghu:player-id',id);}return id;},[]);
 const identityRef=useRef({name:'',color:'#427ab5'});
 const directRef=useRef(null);
 const activeDmRef=useRef(null);
 const zoneRef=useRef([]);
 const clockParam=useMemo(()=>{const v=Number(new URLSearchParams(window.location.search).get('clock'));return Number.isFinite(v)&&v>=0&&v<24?v:null;},[]);
 const [timeline,setTimeline]=useState(initialEvents);
 const [peers,setPeers]=useState([]),linkRef=useRef(null);
 // 私聊（联机演示）：点对点邀请→接受→会话；正文只存在于双方面板，公开事件流只记录“开始私下交流”。
 const [dms,setDms]=useState({}),[dmPeer,setDmPeer]=useState(null),[dmDraft,setDmDraft]=useState(''),[incoming,setIncoming]=useState(null);
 const [memoryChoice,setMemoryChoice]=useState(false);
 const [account,setAccount]=useState(null),[authOpen,setAuthOpen]=useState(false),[authMode,setAuthMode]=useState('login'),[authDraft,setAuthDraft]=useState({nickname:'',password:''}),[authBusy,setAuthBusy]=useState(false),[cloudState,setCloudState]=useState(null),[migrateOpen,setMigrateOpen]=useState(false);
 const dmCooldown=useRef({}),blockedRef=useRef(new Set()),dmTimers=useRef({});
 const dmPatch=(id,patch)=>setDms(v=>({...v,[id]:{status:'idle',messages:[],...(v[id]||{}),...patch}}));
 const peerName=id=>peers.find(p=>p.id===id)?.name||'一位侠客';
 const activeDmPeer=useMemo(()=>Object.keys(dms).find(id=>dms[id].status==='active')||null,[dms]);
 activeDmRef.current=activeDmPeer;
 const startPeerDM=useCallback((peerId)=>{
  const link=linkRef.current;if(!link||!peerId)return;
  if(blockedRef.current.has(peerId))return notice('已屏蔽这位侠客，无法发起私聊');
  if((dmCooldown.current[peerId]||0)>Date.now())return notice('对方刚婉拒了邀请，稍后再试');
  const current=dms[peerId]?.status;
  if(current==='active'){setDmPeer(peerId);return;}
  if(current==='inviting')return notice('邀请已发出，等待对方回应');
  const name=peerName(peerId);
  link.sendInvite(peerId);
  dmPatch(peerId,{status:'inviting'});
  notice(`已向${name}发出私聊邀请`);
  clearTimeout(dmTimers.current[peerId]);
  dmTimers.current[peerId]=setTimeout(()=>{setDms(v=>{if(v[peerId]?.status==='inviting'){const n={...v};n[peerId]={...v[peerId],status:'idle'};return n;}return v;});notice('邀请超时未回应');},30000);
 },[dms,peers]);
 const acceptInvite=useCallback(()=>{
  const link=linkRef.current;if(!link||!incoming)return;
  link.sendInviteReply(incoming.from,incoming.session,true);
  dmPatch(incoming.from,{status:'active'});
  setDmPeer(incoming.from);
  netEvent('dm',{id:incoming.from},`${incoming.fromName}与${identityRef.current.name||'你'}开始私下交流`);
  setIncoming(null);
 },[incoming]);
 const declineInvite=useCallback((reason='')=>{
  const link=linkRef.current;if(!link||!incoming)return;
  link.sendInviteReply(incoming.from,incoming.session,false,reason||'此刻不便');
  setIncoming(null);
 },[incoming]);
 const sendDM=useCallback((text=dmDraft)=>{
  const link=linkRef.current;text=text.trim();if(!text||!dmPeer||!link)return;
  const msg=link.sendDM(dmPeer,text);
  if(msg)dmPatch(dmPeer,{messages:[...(dms[dmPeer]?.messages||[]),{id:msg.id,from:'me',body:text,time:msg.time}]});
  setDmDraft('');
 },[dmDraft,dmPeer,dms]);
 const endDM=useCallback((id=dmPeer)=>{if(!id)return;clearTimeout(dmTimers.current[id]);setDms(v=>({...v,[id]:{status:'idle',messages:[]}}));if(dmPeer===id)setDmPeer(null);},[dmPeer]);
 const blockPeer=useCallback((id=dmPeer)=>{
  const link=linkRef.current;if(!id||!link)return;
  blockedRef.current.add(id);link.sendBlock(id);endDM(id);notice('已屏蔽，不会再接收对方的邀请与消息');
 },[endDM]);
 // 收到的私聊与邀请：只处理发给自己的点对点消息。
 const onDirectMessage=useCallback((msg)=>{
  const from=msg.from;
  if(msg.t==='dm'){
   if(blockedRef.current.has(from))return;
   if(dms[from]?.status==='active'||dmPeer===from){dmPatch(from,{messages:[...(dms[from]?.messages||[]),{id:msg.id,from:'peer',body:msg.body,time:msg.time}]});}
   return;
  }
  if(msg.t==='invite'){
   if(blockedRef.current.has(from))return;
   if(activeDmPeer){linkRef.current?.sendInviteReply(from,msg.session,false,'busy');return;}
   const name=peers.find(p=>p.id===from)?.name||'一位侠客';
   setIncoming({from,fromName:name,session:msg.session});
   return;
  }
  if(msg.t==='invite-reply'){
   clearTimeout(dmTimers.current[from]);
   if(msg.accept){
    dmPatch(from,{status:'active'});
    setDmPeer(from);
    netEvent('dm',{id:from},`${peerName(from)}与${identityRef.current.name||'你'}开始私下交流`);
   }else{
    dmPatch(from,{status:'idle'});
    if(msg.reason==='busy')notice(`${peerName(from)}正忙，邀请被婉拒`);
    else{dmCooldown.current[from]=Date.now()+30000;notice(`${peerName(from)}婉拒了邀请`);}
   }
   return;
  }
  if(msg.t==='block'){
   blockedRef.current.add(from);
   endDM(from);
   notice(`${peerName(from)}停止了接收你的消息`);
  }
 },[dms,dmPeer,activeDmPeer,peers]);
 directRef.current=onDirectMessage;
 const netEvent=useCallback((kind,peer,text)=>{const t=text||(kind==='join'?`${peer.name}进入江湖（真人）`:`${peer.name}离开了江湖`);const e={id:`net-${kind}-${peer.id}-${Date.now()}`,text:t,kind:kind==='join'?'welcome':kind==='leave'?'walk':'chat',time:Date.now()};setEvents(p=>[e,...p].slice(0,12));setTimeline(p=>[e,...p].slice(0,100));},[]);
 useEffect(()=>{document.title=`${peers.length?`(${peers.length}) `:''}原子江湖 · 与同路人，共建新江湖`;},[peers.length]);
 const [events,setEvents]=useState(initialEvents),engine=useMemo(()=>new WorldEngine(e=>{setEvents(p=>[e,...p].slice(0,12));setTimeline(p=>[e,...p].slice(0,100));},()=>zoneRef.current),[]),[agents,setAgents]=useState(()=>engine.snapshot());
 const [theme,setTheme]=useSaved('theme','jianghu'),[night,setNight]=useSaved('night',false),[nickname,setNickname]=useSaved('nickname','初来江湖的你'),[playerColor,setPlayerColor]=useSaved('color','#427ab5');
 useEffect(()=>{identityRef.current={name:nickname==='初来江湖的你'?'少侠':nickname,color:playerColor};},[nickname,playerColor]);
 useEffect(()=>{
  const link=createWorldLink({selfId,getIdentity:()=>identityRef.current,onEvent:({kind,peer})=>netEvent(kind,peer),onPeers:setPeers,onDirect:msg=>directRef.current?.(msg)});
  linkRef.current=link;
  if(!link)return()=>{};
  const timer=setInterval(()=>link.publish({...engine.player,id:selfId,name:identityRef.current.name,state:activeDmRef.current?'私人交谈中':engine.player.state}),180);
  const onHide=()=>link.leave();
  window.addEventListener('pagehide',onHide);
  return()=>{clearInterval(timer);window.removeEventListener('pagehide',onHide);link.leave();linkRef.current=null;};
 },[selfId,engine,netEvent]);
 const [bookmarks,setBookmarks]=useSaved('bookmarks',[]),[memories,setMemories]=useSaved('memories',[]),[remember,setRemember]=useSaved('remember',false),[visits,setVisits]=useSaved('visits',[]);
 const [panel,setPanel]=useState(null),[location,setLocation]=useState('town'),[placeId,setPlaceId]=useState(null),[chatId,setChatId]=useState(null),[editionId,setEditionId]=useState('funskills'),[track,setTrack]=useState('全部'),[search,setSearch]=useState(''),[workId,setWorkId]=useState(null),[journalTab,setJournalTab]=useState('收藏作品'),[toast,setToast]=useState(''),[showLabels,setShowLabels]=useState(true),[rail,setRail]=useState(true),[mode,setMode]=useState('demo'),[draft,setDraft]=useState(''),[messages,setMessages]=useState({}),[sending,setSending]=useState(false),[phase,setPhase]=useState(()=>engine.phase().name),[guideOpen,setGuideOpen]=useState(false),[guideDraft,setGuideDraft]=useState(''),[guideMessages,setGuideMessages]=useState([]),[guideSending,setGuideSending]=useState(false),[perf,setPerf]=useState(null),[showPerf,setShowPerf]=useSaved('perf',false);
 const catalogState=useCatalog({staticDemo}),exhibition=catalogState.exhibition?.config||SHARED_EXHIBITION;
 const editions=useMemo(()=>catalogState.catalog?catalogState.catalog.editions.map(e=>({...e,works:e.works.map(w=>({...w,poster:assetUrl(w.poster),thumb:assetUrl(w.thumb)}))})):[],[catalogState.catalog]);
 const allWorks=useMemo(()=>editions.flatMap(e=>e.works),[editions]);
 const [zone,setZone]=useState(0);
 const zoneWorks=useMemo(()=>exhibitionZone(exhibition,zone),[exhibition,zone]);
 zoneRef.current=zoneWorks;
 const sceneWorks=useMemo(()=>zoneWorks.map(w=>({...w,poster:assetUrl(w.poster),thumb:assetUrl(w.thumb)})),[zoneWorks]);
 const exhibitedIds=useMemo(()=>new Set(zoneWorks.map(w=>w.id)),[zoneWorks]);
 const zoneCount=exhibitionZoneCount(exhibition);
 useEffect(()=>{engine.player.name=nickname==='初来江湖的你'?'你':nickname||'你';},[nickname,engine]);
 useEffect(()=>{if(clockParam!==null)engine.clock=clockParam;},[clockParam,engine]);
 useEffect(()=>{const t=setInterval(()=>setPhase(engine.phase().name),4000);return()=>clearInterval(t);},[engine]);
 const apiRef=useRef(),abortRef=useRef(),chatScroll=useRef(),toastTimer=useRef(),memoryRev=useRef(0);
 const currentEdition=editions.find(e=>e.id===editionId)||editions[0]||null,work=allWorks.find(w=>w.id===workId),place=PLACES.find(p=>p.id===placeId),chatAgent=AGENTS.find(a=>a.id===chatId);
 const filtered=useMemo(()=>(currentEdition?currentEdition.works:[]).filter(w=>(track==='全部'||w.track===track)&&(!search||`${w.title}${w.author}${w.description}${w.tags.join('')}`.toLowerCase().includes(search.toLowerCase()))),[currentEdition,track,search]);
 function notice(text){setToast(text);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3500);}
 useEffect(()=>{if(!staticDemo)fetch('/api/status').then(r=>r.ok?r.json():null).then(d=>{if(d)setMode(d.mode);}).catch(()=>{});return()=>{clearTimeout(toastTimer.current);abortRef.current?.abort();};},[]);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('work');const w=allWorks.find(w=>w.id===id);if(w){setEditionId(w.editionId);setLocation('hall');setPanel('gallery');setWorkId(id);}else setWorkId(null);},[allWorks]);
 useEffect(()=>{if(catalogState.source==='snapshot-fallback')notice('内容接口暂不可用，已切换本地内容快照，作品阅读不受影响');else if(catalogState.exhibition?.mismatch)notice('展陈布局版本与内容服务不一致，请刷新或联系运营核对');},[catalogState.source,catalogState.exhibition?.mismatch]);
 useEffect(()=>{if(chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight;},[messages,sending]);
 useEffect(()=>{function nav(){const id=new URLSearchParams(window.location.search).get('work');setWorkId(allWorks.some(w=>w.id===id)?id:null);}window.addEventListener('popstate',nav);return()=>window.removeEventListener('popstate',nav);},[]);
 function closeChat(){abortRef.current?.abort();setSending(false);if(chatId)engine.release(chatId);setChatId(null);setPanel(null);setDraft('');}
 function closePanel(){if(panel==='chat')closeChat();else setPanel(null);}
 function openPanel(id){if(chatId)closeChat();setPanel(id);}
 function switchZone(next){const total=exhibitionZoneCount(exhibition);const clamped=Math.max(0,Math.min(total-1,next));if(clamped===zone)return;setZone(clamped);notice(`公共展陈已切换到展区 ${clamped+1}/${total}（全房间一致）`);}
 function enterHall(){if(chatId)closeChat();setLocation('hall');setPanel('gallery');setPlaceId(null);notice('已进入武林大会展示馆');}
 function openWork(id){const w=allWorks.find(w=>w.id===id);if(!w)return;setWorkId(id);const url=new URL(window.location.href);url.searchParams.set('work',id);history.pushState({},'',url);setVisits(v=>[{id,time:Date.now()},...v.filter(x=>x.id!==id)].slice(0,50));}
 function closeWork(){setWorkId(null);const url=new URL(window.location.href);url.searchParams.delete('work');history.replaceState({},'',url);}
 // 云端优先：登录后收藏/记忆以账号数据为准，未登录用本机存储。
 const effectiveBookmarks=useMemo(()=>account&&cloudState?cloudState.bookmarks:bookmarks,[account,cloudState,bookmarks]);
 const effectiveMemories=useMemo(()=>account&&cloudState?cloudState.memories:memories,[account,cloudState,memories]);
 const toggleBookmark=useCallback((id)=>{
  if(account){
   const next=effectiveBookmarks.includes(id)?effectiveBookmarks.filter(x=>x!==id):[id,...effectiveBookmarks];
   setCloudState(s=>s?{...s,bookmarks:next}:s);
   fetch('/api/me/bookmarks',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookmarks:next,baseVersion:cloudState?.version})}).then(r=>r.json()).then(d=>{if(d.state)setCloudState(d.state);else notice(d.error||'保存失败，请刷新');}).catch(()=>notice('网络异常，收藏未保存'));
   return;
  }
  setBookmarks(v=>v.includes(id)?v.filter(x=>x!==id):[id,...v]);
 },[account,effectiveBookmarks,cloudState]);

 function startChat(id){if(chatId)closeChat();engine.hold(id);setChatId(id);setPanel('chat');setMessages(v=>({...v,[id]:v[id]||[{role:'assistant',content:AGENTS.find(a=>a.id===id).line}]}));setDraft('');}
 // 账号（联机产品形态）：登录态来自服务端会话 Cookie；游客只能用本机存储。
 const loadCloud=useCallback(async()=>{try{const d=await (await fetch('/api/me')).json();if(d.state)setCloudState(d.state);}catch{}},[account]);
 const submitAuth=useCallback(async(mode=authMode)=>{
  const nickname=authDraft.nickname.trim(),password=authDraft.password;
  if(!nickname||!password)return notice('请填写昵称和密码');
  setAuthBusy(true);
  try{
   const r=await fetch(mode==='register'?'/api/auth/register':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,password})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'操作失败');
   setAccount(d.user);setAuthOpen(false);setAuthDraft({nickname:'',password:''});
   notice(mode==='register'?'注册成功，已登录':'欢迎回来，'+d.user.nickname);
   const hasLocal=bookmarks.length||memories.length;
   if(hasLocal)setMigrateOpen(true);else loadCloud();
  }catch(e){notice(e.message);}
  setAuthBusy(false);
 },[authDraft,authMode,bookmarks,memories]);
 const logout=useCallback(async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});setAccount(null);setCloudState(null);notice('已退出登录；本机记录仍在此浏览器');},[]);
 const doMigrate=useCallback(async()=>{
  try{
   const r=await fetch('/api/me/migrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookmarks,memories})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'迁移失败');
   setMigrateOpen(false);
   const memCount=(d.imported&&d.imported.memories)||0;
   const bmCount=(d.imported&&d.imported.bookmarks)||0;
   notice(memCount+bmCount?('已迁移 '+memCount+' 条记忆与 '+bmCount+' 条收藏到账号'):'账号中已有这些记录，无需重复迁移');
   await loadCloud();
  }catch(e){notice(e.message);}
 },[bookmarks,memories]);

 // 登录态探测：放在 loadCloud 定义之后，避免 TDZ。
 useEffect(()=>{if(staticDemo)return;fetch('/api/auth/me').then(r=>r.ok?r.json():null).then(d=>{if(d?.user){setAccount(d.user);loadCloud();}}).catch(()=>{});},[staticDemo]); function openGuide(){if(chatId)closeChat();setGuideOpen(true);setGuideMessages(v=>v.length?v:[{role:'assistant',content:'我是知微，守馆人。想先从赛事结构看起，还是直接找某件作品？',workIds:[],intent:'intro'}])}
 function sendGuide(text=guideDraft){text=text.trim();if(!text||guideSending)return;setGuideDraft('');setGuideMessages(v=>[...v,{role:'user',content:text}]);setGuideSending(true);
  setTimeout(()=>{const r=guideReply({text,memories:remember?memoryFor(memories,GUIDE_AGENT.id):[]});setGuideMessages(v=>[...v,{role:'assistant',content:r.text,workIds:r.workIds,intent:r.intent}]);setGuideSending(false);},420);}
 function guideTakeMe(id){if(sceneWorks.some(w=>w.id===id)){apiRef.current?.focusWork?.(id);setGuideOpen(false);notice('知微带你前往展位');}else{openWork(id);notice('该作品未在本届展位，已打开作品详情');}}
 function openPlace(id){setPlaceId(id);openPanel('place');}
 async function sendMessage(text=draft){text=text.trim();if(!text||sending||!chatId)return;const id=chatId,rev=memoryRev.current;const historyMessages=messages[id]||[];setDraft('');setSending(true);setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'user',content:text}]}));const controller=new AbortController();abortRef.current=controller;
  try{let d;if(staticDemo){d=demoReply({message:text,agentId:id,memories:remember?memoryFor(memories,id):[]});}else{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,agentId:id,history:historyMessages,memories:remember?memoryFor(memories,id):[]}),signal:controller.signal});d=await r.json();if(!r.ok)throw new Error(d.error||'暂时无法回复');}if(controller.signal.aborted||rev!==memoryRev.current)return;setMode(d.mode);setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'assistant',content:d.text,workIds:d.workIds}]}));
   if(remember&&/我.*(喜欢|感兴趣|想学|在做)|记住/.test(text)){setMemories(v=>[...v,newMemory({agentId:id,text})].slice(-60));}
  }catch(e){if(e.name!=='AbortError')setMessages(v=>({...v,[id]:[...(v[id]||[]),{role:'assistant',content:e.message,error:true}]}));}finally{if(abortRef.current===controller)setSending(false);}
 }
 function deleteMemory(id){memoryRev.current++;abortRef.current?.abort();setSending(false);setMemories(m=>id?m.filter(x=>x.id!==id):[]);setMessages({});notice(id?'记忆已删除，相关对话上下文已清除':'所有私人记忆与对话上下文已清除');}
 function changeRemember(value){memoryRev.current++;abortRef.current?.abort();setSending(false);setRemember(value);setMessages({});if(!value&&memories.length)setMemoryChoice(true);}
 async function share(){try{await navigator.clipboard.writeText(window.location.href);notice('作品链接已复制');}catch{notice('可复制地址栏中的作品链接');}}
 function workCard(w){return <button className="work-card" key={w.id} onClick={()=>openWork(w.id)}><div className="work-image"><img src={w.thumb} alt={w.title} loading="lazy"/><span style={{boxShadow:`inset 3px 0 ${(currentEdition?.trackColors||{})[w.track]||'transparent'}`}}>{w.track}</span>{exhibitedIds.has(w.id)&&<span className="exhibiting-badge">展陈中</span>}{effectiveBookmarks.includes(w.id)&&<Bookmark size={17} fill="currentColor"/>}</div><div className="work-copy"><h3>{w.title}</h3><p>{w.tagline}</p><footer><span>{w.author}</span><ArrowUpRight size={16}/></footer></div></button>;}
 if(catalogState.status!=='ready')return <div className={`app booting ${night?'night':''}`}><div className="boot-card"><span className="boot-brand"><img src={assetUrl(night?'/brand/atomhub-lockup-white.png':'/brand/atomhub-lockup-black.png')} alt="原子公社 AtomHub 官方标识"/><span className="boot-seal">原<span>子</span></span></span><h1>原子江湖</h1><p>正在读取已发布的赛事与作品…</p></div></div>;
 return <div className={`app ${night?'night':''}`}>
  <header className="topbar">
   <button className="brand" onClick={()=>{closePanel();setLocation('town');apiRef.current?.reset();}} aria-label="回到原子江湖"><span className="brand-seal">原<span>子</span></span><span className="brand-word">原子江湖<small>ATOMHUB · A LIVING WORLD</small></span></button>
   <nav aria-label="主导航"><button className={location==='town'&&!['journal','about'].includes(panel)?'active':''} onClick={()=>{closePanel();setLocation('town');}}><Compass size={17}/>漫游小镇</button><button className={location==='hall'?'active':''} onClick={enterHall}><BookOpen size={17}/>武林大会</button><button className={panel==='journal'?'active':''} onClick={()=>openPanel('journal')}><Bookmark size={16}/>游历手札{bookmarks.length>0&&<b>{bookmarks.length}</b>}</button></nav>
<div className="top-actions"><span className="world-status" title={account?'已登录：收藏与记忆可同步到账号（仍在此开发服务器）':'未登录的访客：可漫游、看展、阅读与分享；收藏与记忆仅存本浏览器，不与账号同步'}><i/>{peers.length?`${account?'成员':'访客'} · 联机演示 ${peers.length} 人同行`:(account?'成员 · 已登录':'访客 · 本地世界')}</span>{account?<button className="profile-button" onClick={logout} aria-label="退出登录"><Avatar size={34}/><span>{account.nickname}</span><ChevronRight size={14}/></button>:<button className="profile-button" onClick={()=>{setAuthMode('login');setAuthOpen(true);}} aria-label="登录或注册"><Avatar size={34}/><span>登录 / 注册</span><ChevronRight size={14}/></button>}</div>
  </header>
  <main className={`world-layout ${rail?'':'rail-hidden'}`}>
   <div className="world-stage">
    <World engine={engine} theme={theme} night={night} location={location} works={sceneWorks} peers={peers} onPlace={openPlace} onAgent={startChat} onWork={openWork} onPeer={peer=>startPeerDM(peer.id)} onViewer={v=>v.workId&&openWork(v.workId)} onSnapshot={setAgents} onPerf={setPerf} perfWatch={showPerf} apiRef={apiRef} playerColor={playerColor} labels={showLabels}/>
    <div className="scene-intro"><span className="eyebrow"><span className="tiny-star">✳</span> 人与 AGENT 共建的开源学习社区</span><h1>{location==='town'?'山水有相逢，江湖有同路。':'让每一个好想法，被看见。'}</h1><p>{location==='town'?'在这里歇歇脚，聊聊想法，和有趣的灵魂一起创造。':'走近展台，发现来自真实赛事的作品与创作者。'}</p></div>
    <div className="scene-weather">{night?<Moon size={17}/>:<Sun size={18}/>}<span>{phase}<small>{night?'灯火可亲 · 夜景':'草木葱茏 · 日景'}</small></span></div>
    {location==='hall'&&<button className="back-to-town" onClick={()=>{setLocation('town');closePanel();}}><ChevronLeft size={16}/>返回小镇</button>}
    {location==='hall'&&zoneCount>1&&<div className="zone-pager"><button aria-label="上一展区" disabled={zone===0} onClick={()=>switchZone(zone-1)}><ChevronLeft size={15}/></button><span>公共展区 <b>{zone+1}</b> / {zoneCount}<small>全房间一致 · 共 {exhibitionEntries(exhibition).length} 件</small></span><button aria-label="下一展区" disabled={zone>=zoneCount-1} onClick={()=>switchZone(zone+1)}><ChevronRight size={15}/></button></div>}
    {location==='hall'&&<button className="guide-entry" onClick={openGuide}><Sparkles size={15}/>呼唤{GUIDE_AGENT.name}导览</button>}
    <div className="map-caption"><div className="compass-mark"><span>N</span><Compass size={37} strokeWidth={1}/></div><div><span className="eyebrow">{location==='town'?'THE ATOM VILLAGE':'THE EXHIBITION HALL'}</span><h2>{location==='town'?'原子公社 · 江湖初见':'武林大会 · 灵感长廊'}</h2><p><MapPin size={13}/>{location==='town'?'原子广场':'比赛展示馆'}<span>·</span>{location==='town'?'8 位 AI 侠客在此生活':`${filtered.length} 份作品可供探索`}</p></div></div>
    <div className="world-tools"><button aria-label="放大地图" onClick={()=>apiRef.current?.zoom(.85)}><Plus size={18}/></button><button aria-label="缩小地图" onClick={()=>apiRef.current?.zoom(1.15)}><Minus size={18}/></button><span/><button aria-label="回到我的角色" onClick={()=>apiRef.current?.locate()}><LocateFixed size={18}/></button><button aria-label="重置视角" onClick={()=>apiRef.current?.reset()}><RotateCcw size={17}/></button><span/><button aria-label={night?'切换日景':'切换夜景'} onClick={()=>setNight(v=>!v)}>{night?<Sun size={18}/>:<Moon size={18}/>}</button><button aria-label="小镇设置" onClick={()=>openPanel('settings')}><Settings2 size={18}/></button></div>
    <div className="controls-tip"><span className="mouse-icon"/>点击地面行走<span>·</span>拖动旋转<span>·</span>滚轮缩放</div>
    {showPerf&&<div className={`perf-hud${perf?.degraded?' degraded':''}`}><b>{perf?.fps??'—'} FPS</b><span>{perf?.degraded?'已自动降级（阴影/粒子/像素比）':'画质全开'}</span></div>}
   </div>
   <button className="rail-toggle icon-button" aria-label={rail?'收起侧栏':'展开侧栏'} onClick={()=>setRail(v=>!v)}>{rail?<PanelRightClose size={18}/>:<PanelRightOpen size={18}/>}</button>
   {rail&&<aside className="right-rail">
    <section className="welcome-card"><span className="eyebrow">初入江湖 · 幸会少侠</span><h2>相逢即是<br/>江湖同路人<span>。</span></h2><div className="hero-art"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社白蓝斗笠侠客 IP"/><span className="ip-note">原子公社 · 原创 IP</span></div><p>我是阿原，你的点灯人。<br/>一盏茶的工夫，认识这片新江湖。</p><button className="primary-button" onClick={()=>startChat('ayuan')}><MessageCircle size={17}/>和阿原聊聊<ArrowUpRight size={17}/></button><button className="text-button" onClick={()=>openPanel('about')}>先了解原子公社<ArrowRight size={15}/></button></section>
    <section className="rail-section happenings"><header><h3><span className="green-dot"/>江湖此刻</h3><span>模拟动态</span></header><div className="event-list">{events.slice(0,3).map((e,i)=><div className="event" key={e.id}><span className={`event-icon ${e.kind}`}>{e.kind==='chat'?<MessageCircle size={13}/>:e.kind==='welcome'?<Leaf size={13}/>:e.kind==='phase'?<Clock size={13}/>:e.kind==='view'?<BookOpen size={13}/>:<Footprints size={13}/>}</span><div><p>{e.text}</p><small>{i===0?'刚刚':'片刻前'}</small></div></div>)}</div></section>
    <section className="rail-section nearby"><header><h3>遇见同行侠客</h3><button onClick={()=>openPanel('people')} aria-label="查看所有侠客">全部 <ArrowRight size={13}/></button></header><div className="nearby-avatars">{AGENTS.slice(0,5).map(a=><button key={a.id} title={`${a.name} · ${agents.find(x=>x.id===a.id)?.state}`} onClick={()=>startChat(a.id)}><Avatar agent={a} size={38}/><small>{a.name}</small></button>)}</div><p><i/>8 位 AI 伙伴 · 随时可以打个招呼</p></section>
    <button className="exhibition-promo" onClick={enterHall}><span className="promo-icon"><BookOpen size={22}/></span><span><small>灵感在这里相遇</small><strong>去武林大会逛逛</strong></span><ArrowUpRight size={20}/></button>
    <footer className="rail-footer">每个人都是一颗原子，聚在一起便是江湖。<small className="version-line">内容快照 {catalogState.catalog?.snapshotId||'—'} · 地图 {MAP_VERSION} · 展陈 v{exhibition.layoutVersion} · {staticDemo?'静态演示':catalogState.source==='api'?'内容接口':'本地快照降级'}</small><button onClick={()=>openPanel('about')}>关于这个世界 ↗</button></footer>
   </aside>}
  </main>
  {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
  {panel==='gallery'&&<Dialog title="武林大会展示馆" subtitle="EXHIBITIONS · 真实作品，长久相逢" onClose={closePanel} className="gallery-dialog" hidden={!!work}><div className="edition-tabs">{editions.map(e=><button key={e.id} className={e.id===editionId?'active':''} onClick={()=>{setEditionId(e.id);setTrack('全部');setSearch('');}}>{e.title}<span>{e.works.length?`${e.works.length} 份作品`:'介绍整理中'}</span></button>)}</div><div className="edition-intro"><span className="eyebrow">{currentEdition.subtitle}</span><p>{currentEdition.description}</p></div><div className="gallery-tools"><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索作品、作者或灵感…" aria-label="搜索作品"/>{search&&<button onClick={()=>setSearch('')} aria-label="清空搜索"><X size={15}/></button>}</div><select value={track} onChange={e=>setTrack(e.target.value)} aria-label="筛选赛道"><option>全部</option>{currentEdition.tracks.map(t=><option key={t}>{t}</option>)}</select></div><div className="result-line"><span>{currentEdition.works.length?`${filtered.length} 份作品`:'本届作品整理中'}</span><span>公共展陈 展区 {zone+1}/{zoneCount} · 全房间一致，筛选只影响本面板</span></div><div className="work-grid">{filtered.map(workCard)}{filtered.length===0&&<div className="empty-state"><Search/><h3>{currentEdition.works.length?'暂未找到相关作品':'本届作品整理中'}</h3><p>{currentEdition.works.length?'试试其他关键词或切换赛道。':'赛事介绍已经发布；参赛作品与结果资料核对后上线。'}</p>{currentEdition.works.length>0&&<button className="secondary-button" onClick={()=>{setSearch('');setTrack('全部');}}>清除筛选</button>}</div>}</div><p className="source-note">{currentEdition.note}</p><button className="secondary-button gallery-walk" onClick={closePanel}><Footprints size={16}/>收起目录，看看 3D 展厅</button></Dialog>}
  {work&&<Dialog title={work.title} subtitle={`${editions.find(e=>e.id===work.editionId).title} / ${work.track}`} onClose={closeWork} className="work-dialog"><div className="work-detail"><a href={work.poster} target="_blank" rel="noreferrer" className="poster-link"><img src={work.poster} alt={`${work.title}原始作品海报`}/><span><ExternalLink size={14}/>打开原图</span></a><div className="work-description"><div className="author-line"><Avatar size={32}/><div><small>作品作者</small><p>{work.author}</p></div></div><blockquote>{work.tagline}</blockquote>{work.highlight&&<p className="work-highlight">{work.highlight}</p>}<h3>关于这个作品</h3><p>{work.description}</p><div className="tag-list">{work.tags.map(t=><span key={t}>{t}</span>)}</div><div className="detail-actions"><button className="primary-button" onClick={()=>toggleBookmark(work.id)}><Bookmark size={17} fill={effectiveBookmarks.includes(work.id)?'currentColor':'none'}/>{effectiveBookmarks.includes(work.id)?'已收入手札':'收藏到手札'}</button><button className="secondary-button" onClick={share}><ArrowUpRight size={17}/>分享作品</button></div><p className="source-note">来源：原赛事展示资料。作品效果与成果为作者资料陈述。{account?'收藏已同步到账号。':'收藏保存在此浏览器。'}</p></div></div></Dialog>}
  {panel==='place'&&place&&<Dialog title={place.name} subtitle="江湖地图 · 一处相逢" onClose={closePanel} className="small-dialog"><div className="place-detail"><div className={`place-illustration ${place.id}`}><span>{place.id==='hall'?'展':place.id==='tea'?'茶':place.id==='library'?'书':place.id==='workshop'?'创':place.id==='future-lodge'?'待':'星'}</span></div>{place.status==='placeholder'&&<span className="placeholder-badge">占位建筑 · 等待功能定义</span>}<h3>{place.subtitle}</h3><p>{place.description}</p><div className="detail-actions">{place.status==='placeholder'?<button className="secondary-button" onClick={()=>{setPanel(null);apiRef.current?.focus(place.id);notice('正在前往这座待定建筑');}}><Footprints size={16}/>去看看占位空间</button>:<button className="primary-button" onClick={()=>{if(place.id==='hall')enterHall();else if(place.id==='tea')startChat('qinghe');else if(place.id==='workshop')startChat('xingzhou');else openPanel('about');}}>{place.id==='hall'?'进入展示馆':place.id==='tea'||place.id==='workshop'?'与伙伴交流':'了解更多'}<ArrowUpRight size={17}/></button>}<button className="secondary-button" onClick={()=>{setPanel(null);apiRef.current?.focus(place.id);notice(`正在前往${place.short}`);}}><Footprints size={16}/>走过去</button></div></div></Dialog>}
  {panel==='chat'&&chatAgent&&<Dialog title={`与${chatAgent.name}聊聊`} subtitle={`${chatAgent.role} · AI 角色`} onClose={closeChat} className="chat-dialog" hidden={!!work}><div className="chat-mode"><span className="green-dot"/>{mode==='model'?'模型对话已连接':'本地资料演示 · 尚未连接语言模型'}</div><details className="public-memories"><summary>江湖见闻 · 公开活动记录</summary>{(agents.find(a=>a.id===chatId)?.memory||[]).length?(agents.find(a=>a.id===chatId)?.memory||[]).slice(-3).map((m,i)=><p key={i}>{m}</p>):<p>还没有与其他侠客交流的公开记录。</p>}</details><div className="chat-messages" ref={chatScroll} aria-live="polite">{(messages[chatId]||[]).map((m,i)=><div key={i} className={`message ${m.role} ${m.error?'error':''}`}>{m.role==='assistant'&&<Avatar agent={chatAgent} size={30}/>}<div className="message-body"><p>{m.content}</p>{m.workIds?.map(id=>{const w=allWorks.find(w=>w.id===id);return w?<button key={id} className="chat-work" onClick={()=>openWork(id)}><img src={w.thumb} alt=""/><span>{w.title}<small>{w.track}</small></span><ArrowUpRight size={15}/></button>:null;})}</div></div>)}{sending&&<div className="typing">{chatAgent.name}正在整理思绪<span>···</span></div>}</div><div className="quick-questions">{['推荐效率工具作品','介绍原子公社','你还记得我吗？'].map(q=><button key={q} disabled={sending} onClick={()=>sendMessage(q)}>{q}</button>)}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();sendMessage();}}><input aria-label="聊天消息" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="聊聊你的想法…" maxLength={1000}/><button aria-label="发送消息" disabled={sending||!draft.trim()}><Send size={19}/></button></form><label className="memory-consent"><input type="checkbox" checked={remember} onChange={e=>changeRemember(e.target.checked)}/>记住我主动表达的兴趣，仅保存在此浏览器</label></Dialog>}
  {guideOpen&&<Dialog title={`与${GUIDE_AGENT.name}导览`} subtitle="STRUCTURED FIRST · 先查事实，再聊兴趣" onClose={()=>setGuideOpen(false)} className="chat-dialog guide-dialog" hidden={!!work}><div className="chat-mode"><span className="green-dot"/>结构化导览 · 只回答已发布资料里的内容</div><div className="chat-messages" aria-live="polite">{guideMessages.map((m,i)=><div key={i} className={`message ${m.role}`}>{m.role==='assistant'&&<Avatar agent={GUIDE_AGENT} size={30}/>}<div className="message-body"><p>{m.content}</p>{m.workIds?.map(id=>{const w=allWorks.find(x=>x.id===id);return w?<div className="chat-work guide-cite" key={id}><button className="cite-open" onClick={()=>openWork(id)}><img src={w.thumb} alt=""/><span>{w.title}<small>{w.track}</small></span><ArrowUpRight size={15}/></button><button className="cite-take" onClick={()=>guideTakeMe(id)}><Footprints size={13}/>{sceneWorks.some(s=>s.id===id)?'带我去':'直接阅读'}</button></div>:null;})}</div></div>)}{guideSending&&<div className="typing">{GUIDE_AGENT.name}正在查阅展陈资料<span>···</span></div>}</div><div className="quick-questions">{GUIDE_QUESTIONS.map(q=><button key={q} disabled={guideSending} onClick={()=>sendGuide(q)}>{q}</button>)}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();sendGuide();}}><input aria-label="导览问题" value={guideDraft} onChange={e=>setGuideDraft(e.target.value)} placeholder="问赛道、问作品，或说“带我看看《…》”" maxLength={200}/><button aria-label="发送导览问题" disabled={guideSending||!guideDraft.trim()}><Send size={19}/></button></form><p className="memory-consent">自由对话请找{GUIDE_AGENT.name}私聊；导览回答基于结构化资料与检索，奖项与结果未收录时会直说。</p></Dialog>}
  {authOpen&&<Dialog title={authMode==='login'?'登录原子江湖':'注册账号'} subtitle="ACCOUNT · 账号在此开发服务器，正式版将接入社区账号体系" onClose={()=>setAuthOpen(false)} className="small-dialog auth-dialog"><div className="auth-body">
   <label>昵称<input value={authDraft.nickname} onChange={e=>setAuthDraft(d=>({...d,nickname:e.target.value}))} placeholder="2—20 位，中文/字母/数字" maxLength={20} aria-label="昵称"/></label>
   <label>密码<input type="password" value={authDraft.password} onChange={e=>setAuthDraft(d=>({...d,password:e.target.value}))} placeholder="至少 8 位" maxLength={64} aria-label="密码"/></label>
   <p className="auth-note">{authMode==='login'?'还没有账号？切换到注册即可，首次注册自动登录。':'注册即表示同意在此开发服务器保存你的收藏与记忆；可随时退出登录。'}</p>
   <div className="detail-actions">
    <button className="primary-button" disabled={authBusy} onClick={()=>submitAuth(authMode)}>{authBusy?'处理中…':authMode==='login'?'登录':'注册并登录'}</button>
    <button className="secondary-button" onClick={()=>setAuthMode(authMode==='login'?'register':'login')}>{authMode==='login'?'去注册':'去登录'}</button>
   </div>
   {staticDemo&&<p className="auth-note">静态演示模式不提供账号服务；请使用 npm run dev 体验登录与云端同步。</p>}
  </div></Dialog>}
  {migrateOpen&&<Dialog title="迁移本机记录到账号" subtitle="MIGRATE · 由你选择，不做静默归并" onClose={()=>setMigrateOpen(false)} className="small-dialog auth-dialog"><div className="auth-body">
   <p className="auth-note">检测到本浏览器存有 {bookmarks.length} 条收藏与 {memories.length} 条记忆。你可以把它们迁入账号（跨设备可见），或保留在本地。</p>
   <div className="detail-actions"><button className="primary-button" onClick={doMigrate}>迁移到账号</button><button className="secondary-button" onClick={()=>{setMigrateOpen(false);notice('已保留在本机，未迁移');}}>仅保留在本机</button></div>
  </div></Dialog>}
  {incoming&&<Dialog title={`${incoming.fromName}邀请你私下交流`} subtitle="PRIVATE INVITE · 一对一私聊" onClose={()=>declineInvite()} className="small-dialog invite-dialog"><div className="invite-body"><p>{incoming.fromName}想和你单独说说话。<br/>接受后开始一对一私聊；婉拒不会打扰对方。</p><div className="detail-actions"><button className="primary-button" onClick={acceptInvite}>接受邀请<ArrowUpRight size={17}/></button><button className="secondary-button" onClick={()=>declineInvite('此刻不便')}>婉拒</button></div></div></Dialog>}
  {dmPeer&&dms[dmPeer]&&dms[dmPeer].status==='active'&&<Dialog title={`与${peerName(dmPeer)}私聊`} subtitle="PRIVATE · 一对一 · 内容不进入公开动态" onClose={()=>setDmPeer(null)} className="chat-dialog dm-dialog"><div className="chat-mode"><span className="green-dot"/>私人会话进行中 · 只有你们双方能看到正文</div><div className="chat-messages">{dms[dmPeer].messages.map((m,i)=><div key={i} className={`message ${m.from==='me'?'user':'assistant'}`}>{m.from==='peer'&&<Avatar agent={{color:peers.find(p=>p.id===dmPeer)?.color||'#427ab5'}} size={30}/>}<div className="message-body"><p>{m.body}</p><small>{new Date(m.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div></div>)}{dms[dmPeer].messages.length===0&&<p className="guide-intro">私聊已建立。说点什么吧——这些话只有你们两人可见。</p>}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();sendDM();}}><input aria-label="私聊消息" value={dmDraft} onChange={e=>setDmDraft(e.target.value)} placeholder="只有对方能看到的悄悄话…" maxLength={500}/><button aria-label="发送私聊" disabled={!dmDraft.trim()}><Send size={19}/></button></form><div className="dm-actions"><button className="secondary-button" onClick={()=>endDM()}>结束交谈</button><button className="danger-button" onClick={()=>blockPeer()}>屏蔽此人</button></div></Dialog>}
  {panel==='people'&&<Dialog title="同行侠客" subtitle="每个相逢，都可能是共创的开始" onClose={closePanel} className="people-dialog"><div className="people-list">{AGENTS.map(a=><button key={a.id} onClick={()=>startChat(a.id)}><Avatar agent={a} size={52}/><span><strong>{a.name}<i>AI</i></strong><p>{a.role}</p><small>{agents.find(x=>x.id===a.id)?.state}</small></span><MessageCircle size={20}/></button>)}</div><p className="source-note">角色为虚构 AI 伙伴，不代表真实主理人或作者。当前世界运行在本地浏览器。</p></Dialog>}
  {panel==='journal'&&<Dialog title="游历手札" subtitle="你的相逢与发现，留在这里" onClose={closePanel} className="journal-dialog" hidden={!!work}><div className="journal-tabs">{['收藏作品','最近看过','侠客见闻','私人记忆'].map(t=><button className={journalTab===t?'active':''} key={t} onClick={()=>setJournalTab(t)}>{t}</button>)}</div>{journalTab==='私人记忆'?<div className="memory-list"><p>只有对应侠客会在你开启记忆时使用这些记录；记录到期后自动停止参与回忆，删除会同步清除当前对话上下文。</p>{memoryChoice&&<div className="memory-choice"><strong>已停止保存新的兴趣记忆</strong><p>你可以保留已有记录（仍在本地，重新开启后继续生效），或立即全部删除。</p><div className="detail-actions"><button className="secondary-button" onClick={()=>{setMemoryChoice(false);notice('已保留已有记录');}}>保留已有记录</button><button className="danger-button" onClick={()=>{setMemoryChoice(false);deleteMemory();}}>同时删除全部</button></div></div>}{(()=>{const live=effectiveMemories.filter(m=>!isExpired(m));const expired=effectiveMemories.length-live.length;return live.length===0?<div className="empty-state"><Sparkles/><h3>{expired?'所有记忆已到期':'还没有保存的记忆'}</h3><p>{expired?'到期记录不再参与回忆，可删除或重新开启记忆。':'与侠客聊天时，你可以主动开启兴趣记忆。'}</p></div>:<>{live.map(m=><article key={m.id}><Avatar agent={AGENTS.find(a=>a.id===m.agentId)}/><div><small>{AGENTS.find(a=>a.id===m.agentId)?.name} · {m.source} · 剩余 {memoryRemainingDays(m)} 天</small><p>{m.text}</p></div><button aria-label="删除这条记忆" className="icon-button" onClick={()=>deleteMemory(m.id)}><Trash2 size={16}/></button></article>)}<button className="danger-button" onClick={()=>deleteMemory()}>删除全部私人记忆</button></>;})()}</div>:journalTab==='侠客见闻'?<div className="timeline-list"><p className="timeline-note">AI 侠客的公开行程与社交动态，由本机模拟状态产生；不含私人聊天内容，仅本次到访可见。</p>{timeline.map(e=><article key={e.id} className={`timeline-item ${e.kind}`}><span className="timeline-icon">{e.kind==='chat'?<MessageCircle size={13}/>:e.kind==='welcome'?<Leaf size={13}/>:e.kind==='phase'?<Clock size={13}/>:e.kind==='view'?<BookOpen size={13}/>:<Footprints size={13}/>}</span><div><p>{e.text}</p><small>{e.kind==='chat'?'公开社交':e.kind==='walk'?'行程':e.kind==='phase'?'时辰流转':e.kind==='view'?'AI 观展':e.kind==='view-cancel'?'观展取消':'开山迎客'} · {new Date(e.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div></article>)}</div>:<div className="work-grid">{(journalTab==='收藏作品'?effectiveBookmarks:visits.map(v=>v.id)).map(id=>allWorks.find(w=>w.id===id)).filter(Boolean).map(workCard)}{(journalTab==='收藏作品'?effectiveBookmarks:visits).length===0&&<div className="empty-state"><BookOpen/><h3>手札的第一页，等你来写</h3><p>去展馆发现一个喜欢的作品吧。</p><button className="primary-button" onClick={enterHall}>去看看作品<ArrowRight size={16}/></button></div>}</div>}<p className="source-note">{account?`记录已与账号 ${account.nickname} 同步（开发服务器）。`:'记录仅保存在此浏览器；登录后可同步到账号。'}</p></Dialog>}
  {panel==='settings'&&<Dialog title="定制这片江湖" subtitle="你的侠客，你的小世界" onClose={closePanel} className="settings-dialog"><div className="settings-content"><h3>侠客名帖</h3><div className="profile-editor"><Avatar size={64} agent={{color:playerColor}}/><label>我的昵称<input value={nickname} onChange={e=>setNickname(e.target.value.slice(0,20))} maxLength={20} aria-label="我的昵称"/></label></div><label>衣带颜色</label><div className="color-options">{['#427ab5','#719783','#a17b9e','#b68b54','#be7770'].map(c=><button key={c} aria-label={`衣带颜色 ${c}`} className={c===playerColor?'active':''} style={{background:c}} onClick={()=>setPlayerColor(c)}>{c===playerColor&&<Check size={18}/>}</button>)}</div><h3>世界主题</h3><p className="setting-description">切换建筑与环境配色，保留原子公社的场景布局和真实作品。</p><div className="theme-options">{Object.entries(THEMES).map(([id,t])=><button key={id} className={id===theme?'active':''} onClick={()=>setTheme(id)}><span style={{background:t.roof}}/>{t.name}{theme===id&&<Check size={15}/>}</button>)}</div><label className="setting-toggle"><span>地图建筑标签</span><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/></label><label className="setting-toggle"><span>性能指示器（帧率与降级状态）</span><input type="checkbox" checked={showPerf} onChange={e=>setShowPerf(e.target.checked)}/></label><label className="setting-toggle"><span>灯火夜景</span><input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/></label><button className="secondary-button" onClick={()=>{setTheme('jianghu');setPlayerColor('#427ab5');setNight(false);setShowLabels(true);apiRef.current?.reset();}}>恢复默认场景</button></div></Dialog>}
  {panel==='about'&&<Dialog title="聚是一团火，散作满天星" subtitle="原子公社 ATOMHUB · 品牌与共建" onClose={closePanel} className="about-dialog"><div className="about-content"><img src={assetUrl('/brand/hero-ip.webp')} alt="原子公社侠客 IP"/><div><span className="eyebrow">人与 AGENT 共建的开源学习社区</span><img className="brand-lockup" src={assetUrl(night?'/brand/atomhub-lockup-white.png':'/brand/atomhub-lockup-black.png')} alt="原子公社 AtomHub 官方 Logo"/><h3>每个人都是一颗原子。</h3><p>人在这里提供经验与认知，Agent 带来效率与协助。一起分享真实案例、探索 AI 工具，把新的想法做成能解决问题的作品。</p><div className="values">{['个体至上','开放共享','务实求真','互助共赢','持续进化'].map((v,i)=><span key={v}><small>0{i+1}</small>{v}</span>)}</div><p>主理人是社区的“点灯人”。小镇将这份迎新与连接的职责交给阿原，将开放学习、共创实践和成果展示分别放进书院、工坊与比赛展示馆。</p><p className="source-note">品牌依据：《原子公社对外介绍 v2.2》 第 1、5—10、21 页。IP 来自你提供的素材。此版本为本地 3D 原型；真人联机、云端记忆及运营发布后台尚未接入。</p><a href="https://github.com/a16z-infra/ai-town" target="_blank" rel="noreferrer" className="text-button">技术参考 · AI Town<ExternalLink size={14}/></a></div></div></Dialog>}
 </div>;
}
