import {useEffect,useState,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
const BADGE={已发布:'pub',草稿:'draft',待审核:'review',已撤回:'withdrawn'};
const STATUS_ACTIONS=[['已发布','发布','primary'],['待审核','送审',''],['草稿','存为草稿',''],['已撤回','撤回','danger']];
const TABS=['目录','导入','版本','审计'];
async function api(path,body){
 const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||`接口返回 ${r.status}`);
 return d;
}
function Admin(){
 const [state,setState]=useState(null),[toast,setToast]=useState(''),[tab,setTab]=useState('目录'),[openEdition,setOpenEdition]=useState(null),[error,setError]=useState('');
 const [plan,setPlan]=useState(null),[planning,setPlanning]=useState(false),[applying,setApplying]=useState(false),[label,setLabel]=useState('');
 const [auth,setAuth]=useState(null),[loginDraft,setLoginDraft]=useState({nickname:'',password:''}),[loginBusy,setLoginBusy]=useState(false),[loginError,setLoginError]=useState(''),[loginMode,setLoginMode]=useState('login');
 const canOperate=!!(auth?.user&&(auth.user.role==='operator'||auth.user.role==='admin'));
 const reload=useCallback(async()=>{
  try{setAuth(await (await fetch('/api/auth/me')).json());}catch{}
  try{setState(await api('/api/admin/content'));setError('');}
  catch(e){if(!/登录|权限/.test(e.message))setError(e.message+'——本页只在开发服务器（npm run dev）下可用，静态构建不包含运营接口。');}
 },[]);
 useEffect(()=>{reload();},[reload]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(t);},[toast]);
 async function doLogin(){
  setLoginBusy(true);setLoginError('');
  try{
   const r=await fetch('/api/auth/'+(loginMode==='login'?'login':'register'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(loginDraft)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||'登录失败');
   setLoginDraft({nickname:'',password:''});
   await reload();
  }catch(e){setLoginError(e.message);}
  setLoginBusy(false);
 }
 async function doPromote(){
  try{
   const r=await fetch('/api/admin/promote',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'提升失败');
   setToast('已提升为运营角色');
   await reload();
  }catch(e){setToast(e.message);}
 }
 async function act(scope,id,status){
  try{await api('/api/admin/publication',{scope,id,status});setToast(`${scope==='edition'?'赛事':'作品'} ${id} 已设为「${status}」`);await reload();}
  catch(e){setToast(e.message);}
 }
 if(!auth)return <div className="wrap"><div className="banner">正在检查登录状态…</div></div>;
 if(!auth.user)return <div className="wrap"><header className="top"><div className="lockup"><span className="seal">原<span>子</span></span><h1>运营后台 · 原子江湖<small>开发态 · ATOMHUB CONTENT OPS</small></h1></div><div className="links"><a href="/">打开江湖</a></div></header><div className="edition" style={{maxWidth:420,margin:'40px auto'}}><header><h2>登录</h2></header><p className="meta">运营后台需要登录。演示环境下登录后可直接提升为运营角色。</p><label className="label-input-wrap">昵称<input className="label-input" value={loginDraft.nickname} onChange={e=>setLoginDraft(d=>({...d,nickname:e.target.value}))} placeholder="昵称"/></label><label className="label-input-wrap">密码<input className="label-input" type="password" value={loginDraft.password} onChange={e=>setLoginDraft(d=>({...d,password:e.target.value}))} placeholder="密码"/></label><div className="actions"><button className="primary" disabled={loginBusy} onClick={doLogin}>{loginBusy?'处理中…':loginMode==='login'?'登录':'注册并登录'}</button><button onClick={()=>setLoginMode(loginMode==='login'?'register':'login')}>{loginMode==='login'?'去注册':'去登录'}</button></div>{loginError&&<p className="meta" style={{color:'#b07a66'}}>{loginError}</p>}</div></div>;
 if(!canOperate)return <div className="wrap"><header className="top"><div className="lockup"><span className="seal">原<span>子</span></span><h1>运营后台 · 原子江湖<small>开发态 · ATOMHUB CONTENT OPS</small></h1></div><div className="links"><a href="/">打开江湖</a></div></header><div className="edition" style={{maxWidth:460,margin:'40px auto'}}><header><h2>需要运营权限</h2></header><p className="meta">当前账号「{auth.user.nickname}」是成员，没有运营权限。演示环境下可自助提升为运营角色；生产环境应由管理员分配。</p><div className="actions"><button className="primary" onClick={doPromote}>提升为运营角色</button></div></div></div>;
 if(error)return <div className="wrap"><header className="top"><div className="lockup"><span className="seal">原<span>子</span></span><h1>运营后台 · 原子江湖<small>开发态 · ATOMHUB CONTENT OPS</small></h1></div><div className="links"><a href="/">打开江湖</a></div></header><div className="banner">{error}</div></div>;
 if(!state)return <div className="wrap"><div className="banner">正在读取内容目录…</div></div>;
 return <div className="wrap">
  <header className="top"><div className="lockup"><span className="seal">原<span>子</span></span><h1>运营后台 · 原子江湖<small>开发态 · 快照 {state.snapshotId}{state.persisted?' · 覆盖已持久化':' · 内存态'}</small></h1></div><div className="links"><a href="/" target="_blank" rel="noreferrer">打开江湖</a><a href="/?hall=1" target="_blank" rel="noreferrer">看展示馆</a></div></header>
  <div className="banner">发布覆盖、版本与审计持久化在 data/ops-state.json，重启不丢失；导入任务会写 editions.json 并复制媒体。撤回与回滚对内容接口、共享展陈与导览立即生效——前台刷新即可见。静态构建不包含运营接口。</div>
  <nav className="tabs">{TABS.map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>

  {tab==='目录'&&<div className="grid">
   {state.editions.map(e=><section className="edition" key={e.id}>
    <header><h2>{e.title}</h2><span className={`badge ${BADGE[e.publicationStatus]}`}>{e.publicationStatus}</span><span className="badge" style={{background:'#eef0e6',color:'#6b7e65'}}>{e.eventStage}</span><span style={{fontSize:11,color:'#8b958b'}}>{e.works.length} 份作品 · {e.tracks.length} 赛道 · v{e.contentVersion}</span></header>
    <p className="meta">{e.subtitle}｜{e.description}</p>
    <div className="actions">
     {STATUS_ACTIONS.map(([status,text,cls])=><button key={status} className={cls} disabled={e.publicationStatus===status} onClick={()=>act('edition',e.id,status)}>{text}</button>)}
     <button onClick={()=>setOpenEdition(openEdition===e.id?null:e.id)}>{openEdition===e.id?'收起作品':'展开作品'}</button>
    </div>
    {openEdition===e.id&&<table><thead><tr><th>作品</th><th>作者</th><th>赛道</th><th>状态</th><th>操作</th></tr></thead><tbody>
     {e.works.map(w=><tr key={w.id}><td>{w.title}</td><td>{w.author}</td><td>{w.track}</td><td><span className={`badge ${BADGE[w.publicationStatus]}`}>{w.publicationStatus}</span></td><td className="actions-cell">{STATUS_ACTIONS.map(([status,text,cls])=><button key={status} className={cls} disabled={w.publicationStatus===status} onClick={()=>act('work',w.id,status)}>{text}</button>)}</td></tr>)}
     {e.works.length===0&&<tr><td colSpan={5}>本届暂无作品记录（作品整理中）。</td></tr>}
    </tbody></table>}
   </section>)}
  </div>}

  {tab==='导入'&&<section className="edition">
   <header><h2>来源数据导入</h2><span className="badge" style={{background:'#eef0e6',color:'#6b7e65'}}>繁星之夜-showcase · hackathon-showcase</span></header>
   <p className="meta">先做差异预览，再应用导入。预览不写任何文件；应用会写 editions.json 并复制媒体到 public/works。已有记录的发布状态保留，新记录默认“待审核”；微信号与二维码不会进入目录；来源中已下线的记录保留在文件中等待显式处理，不静默丢弃。</p>
   <div className="actions">
    <button className="primary" disabled={planning} onClick={async()=>{setPlanning(true);try{setPlan((await api('/api/admin/import/preview',{})).plan);setToast('差异预览已生成');}catch(e){setToast(e.message);}setPlanning(false);}}>{planning?'预览中…':'生成差异预览'}</button>
    <button className="danger" disabled={applying||!plan} onClick={async()=>{setApplying(true);try{const r=await api('/api/admin/import/apply',{});setToast(`已应用导入：${r.summary.editions} 届 / ${r.summary.works} 条，即将刷新`);setTimeout(()=>location.reload(),1400);}catch(e){setToast(e.message);}setApplying(false);}}>{applying?'应用中…':'应用导入'}</button>
   </div>
   {plan&&<table><thead><tr><th>来源</th><th>新增</th><th>更新</th><th>下线保留</th><th>剔除私人字段</th></tr></thead><tbody>
    {plan.editions.map(e=><tr key={e.id}><td>{e.id}（{e.title}）</td><td>{e.newWorks.length}</td><td>{e.updatedWorks.length}</td><td>{e.staleWorks.length}</td><td>{e.privateDropped}</td></tr>)}
    <tr><td>合计</td><td>{plan.totals.newWorks}</td><td>{plan.totals.updatedWorks}</td><td>{plan.totals.staleWorks}</td><td>{plan.totals.privateDropped}</td></tr>
   </tbody></table>}
   {plan&&<p className="meta">手工维护、不随展示站导入的赛事：{plan.manualKept.length?plan.manualKept.join('、'):'无'}。</p>}
  </section>}

  {tab==='版本'&&<section className="edition">
   <header><h2>发布版本</h2><span className="badge" style={{background:'#eef0e6',color:'#6b7e65'}}>当前生效覆盖的快照</span></header>
   <p className="meta">把当前生效的发布覆盖存为一个版本（含名称），需要时回滚。回滚恢复该版本记录的全部覆盖，不影响 editions.json 本身。</p>
   <div className="actions">
    <input className="label-input" value={label} onChange={e=>setLabel(e.target.value)} placeholder="版本名称，如：繁星之夜全量发布" maxLength={40}/>
    <button className="primary" onClick={async()=>{try{const r=await api('/api/admin/version',{label});setToast(`已创建版本 ${r.id}`);setLabel('');await reload();}catch(e){setToast(e.message);}}}>创建版本</button>
   </div>
   {state.versions.length===0&&<p className="meta">还没有发布版本。</p>}
   {state.versions.map(v=><div className="version-row" key={v.id}>
    <div><strong>{v.label}</strong><small>{new Date(v.time).toLocaleString('zh-CN')} · 赛事覆盖 {Object.keys(v.editionOverrides).length} · 作品覆盖 {Object.keys(v.workOverrides).length}</small></div>
    <button onClick={async()=>{try{await api('/api/admin/rollback',{id:v.id});setToast(`已回滚到 ${v.id}`);await reload();}catch(e){setToast(e.message);}}}>回滚到此版本</button>
   </div>)}
  </section>}

  {tab==='审计'&&<section className="edition">
   <header><h2>审计流水</h2><span className="badge" style={{background:'#eef0e6',color:'#6b7e65'}}>最近 {Math.min(state.audit.length,50)} 条</span></header>
   {state.audit.length?<ol className="audit-list">{state.audit.slice(0,50).map((a,i)=><li key={i}><small>{new Date(a.time).toLocaleString('zh-CN')}</small>{a.actor}｜{a.action}｜{a.target}｜{a.before||'—'} → {a.after||'—'}</li>)}</ol>:<p className="meta">暂无操作记录。</p>}
   <div className="actions" style={{marginTop:12}}><button className="danger" onClick={async()=>{await api('/api/admin/reset',{});setToast('已清除全部发布覆盖');reload();}}>清除全部覆盖</button><button onClick={reload}>刷新目录</button></div>
  </section>}

  {toast&&<div className="toast">{toast}</div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<Admin/>);
