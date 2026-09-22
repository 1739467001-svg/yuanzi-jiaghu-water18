import {useEffect,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PLACES,THEMES} from './config.js';
import {findPath,hallWalkable,terrainHeight} from './engine.js';
import {box,ball,cylinder,mesh,material,building,tree,character,bridge,atomSculpture,textSign,lantern} from './models.js';
import {loadManifest,findAsset,resolveAsset} from './assets.js';
const assetUrl=path=>import.meta.env.BASE_URL+path.replace(/^\//,'');
import {trackColorOf} from '../content/catalog.js';
function bubbleTexture(text){
 const c=document.createElement('canvas');c.width=256;c.height=92;const x=c.getContext('2d');
 x.fillStyle='#fbfaf0f2';x.strokeStyle='#aebda0';x.lineWidth=3;
 x.beginPath();x.moveTo(26,10);x.lineTo(230,10);x.quadraticCurveTo(244,10,244,24);x.lineTo(244,56);x.quadraticCurveTo(244,70,230,70);x.lineTo(146,70);x.lineTo(130,82);x.lineTo(118,70);x.lineTo(26,70);x.quadraticCurveTo(12,70,12,56);x.lineTo(12,24);x.quadraticCurveTo(12,10,26,10);x.closePath();x.fill();x.stroke();
 x.fillStyle='#41564a';x.font='500 29px "PingFang SC","Noto Sans SC",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,128,41,214);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
function skyTexture(){
 // 相机俯角固定（小镇约 -31°、展馆约 -32°），画面顶部天空带对应球面 UV v≈0.38-0.47（canvas 行 540-635）。
 const c=document.createElement('canvas');c.width=2048;c.height=1024;const x=c.getContext('2d');
 const g=x.createLinearGradient(0,0,0,1024);g.addColorStop(0,'#0b1027');g.addColorStop(.45,'#0e1730');g.addColorStop(.62,'#141d38');g.addColorStop(.78,'#1a2440');g.addColorStop(1,'#22304e');
 x.fillStyle=g;x.fillRect(0,0,2048,1024);
 let seed=7;const rnd=()=>((seed=seed*1103515245+12345&0x7fffffff)/0x7fffffff);
 for(let i=0;i<200;i++){const u=rnd()*2048,y=500+rnd()*190,bright=.45+rnd()*.55;const r=rnd()<.78?1:2;const warm=rnd()<.3;
  x.fillStyle=warm?`rgba(255,216,150,${bright})`:`rgba(216,230,255,${bright})`;
  x.beginPath();x.arc(u,y,r,0,7);x.fill();
  if(r===2){x.fillStyle=`rgba(216,230,255,${bright*.28})`;x.beginPath();x.arc(u,y,4.5,0,7);x.fill();}}
 const mx=620,my=578,mr=14;
 const halo=x.createRadialGradient(mx,my,mr,mx,my,mr*7);halo.addColorStop(0,'rgba(242,238,219,.34)');halo.addColorStop(1,'rgba(242,238,219,0)');x.fillStyle=halo;x.beginPath();x.arc(mx,my,mr*7,0,7);x.fill();
 x.fillStyle='#f2eedb';x.beginPath();x.arc(mx,my,mr,0,7);x.fill();
 x.fillStyle='rgba(224,219,197,.65)';x.beginPath();x.arc(mx-3,my-2,2.4,0,7);x.fill();x.beginPath();x.arc(mx+4,my+3,1.6,0,7);x.fill();
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
export default function World({engine,theme,night,location,works,peers=[],onPlace,onAgent,onWork,onPeer,onViewer,onSnapshot,onPerf,perfWatch=false,apiRef,playerColor,labels=true}){
 const host=useRef(),callbacks=useRef({}),[pins,setPins]=useState([]),[error,setError]=useState(false);callbacks.current={onPlace,onAgent,onWork,onPeer,onViewer,onSnapshot,onPerf};
 const latest=useRef({peers});latest.current.peers=peers;latest.current.perfWatch=perfWatch;
 useEffect(()=>{
  const el=host.current;let alive=true,renderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{setError(true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=night?1.15:1.25;el.appendChild(renderer.domElement);
  const palette=THEMES[theme]||THEMES.jianghu,scene=new T.Scene();const nightSky=night?(location==='hall'?'#0b1027':'#141f33'):palette.sky;scene.background=new T.Color(nightSky);scene.fog=new T.Fog(nightSky,105,245);
  const camera=new T.PerspectiveCamera(37,1,.1,260);camera.position.set(32,30,39);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=19;controls.maxDistance=160;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.22;controls.enablePan=false;controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.ROTATE};
  scene.add(new T.HemisphereLight(night?'#9fbfce':'#fff8e3',night?'#263b3d':'#9ba994',night?1.5:2.2));const sun=new T.DirectionalLight(night?'#b7d4f0':'#fff1ce',night?1:3.4);sun.position.set(-16,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:1,far:80});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);
  const base=new T.Group();scene.add(base);const interactive=[],pinSources=[],agentModels=new Map(),peerModels=new Map();
  const ground=box(base,0,-.45,0,39,.8,31,night?'#6d8177':palette.grass);ground.userData.kind='ground';interactive.push(ground);
  box(base,0,-.95,0,39.1,.22,31.1,'#c3bfa7');box(base,0,-1.3,0,38.4,.6,30.4,'#d6cfb8');
  const backdrop=box(scene,0,-1.72,0,1000,.1,1000,night?(location==='hall'?'#0b1027':'#141f33'):palette.sky);backdrop.receiveShadow=true;
 // 跟随相机的星空穹顶：最后渲染且只填充尚未着色的天空楔形，庭院与展馆共用。
 let skyDome;
 if(night){skyDome=new T.Mesh(new T.SphereGeometry(60,24,16),new T.MeshBasicMaterial({map:skyTexture(),side:T.BackSide,fog:false,depthWrite:false}));skyDome.renderOrder=999;scene.add(skyDome);}
  const hallPlayer={id:'you',x:0,z:8,angle:0,path:[],state:'看展中'};
  const actorGroup=new T.Group();scene.add(actorGroup);
 // 繁星之夜：夜间星空。小镇稀疏、月亮与流萤；展馆密集并加穹顶，成为一片室内星河。
 let flies;
 if(night&&location==='town'){
   const fn=14,fp=new Float32Array(fn*3),fg=new T.BufferGeometry();fg.setAttribute('position',new T.BufferAttribute(fp,3));flies=new T.Points(fg,new T.PointsMaterial({color:'#ffd98a',size:.22,transparent:true,opacity:.85,fog:false}));scene.add(flies);
 }
  const player=character(playerColor,1.12);player.userData.kind='player';actorGroup.add(player);
  let water,sculpture,bubbles;
  if(location==='town'){
   // The river is blocked by the navigation grid except at the two bridges.
   water=box(base,0,-.02,5,39,.07,3.5,night?'#376d72':'#81b8b2');water.material=new T.MeshStandardMaterial({color:night?'#376d72':'#81b8b2',metalness:.18,roughness:.28});
   for(const z of [3.15,6.85])box(base,0,.03,z,39,.2,.3,'#b5bfac');
   for(let i=0;i<24;i++){const x=-18+(i*7.7)%36,z=4+(i*1.3)%2;box(base,x,.04,z,.4+(i%3)*.28,.014,.04,'#c0d8cc');}
   bridge(base,-4);bridge(base,10);
   box(base,-1,.04,-.5,13,.12,8,'#d4d0b7');box(base,-8,.03,-1,13,.1,2.5,'#d1cdb6');box(base,8,.03,-1,12,.1,2.5,'#d1cdb6');box(base,0,.03,-4,3,.1,5,'#d1cdb6');box(base,-4,.03,10,2.8,.1,9,'#d1cdb6');box(base,10,.03,10,2.8,.1,9,'#d1cdb6');box(base,2,.03,11,18,.1,2.3,'#d1cdb6');
   const stones=new T.InstancedMesh(new T.BoxGeometry(.84,.05,.65),material('#ded9c3'),180),dummy=new T.Object3D();let count=0;
   for(let x=-6;x<6;x++)for(let z=-4;z<5;z++){dummy.position.set(x*.98-.4,.125,z*.76-.5);dummy.rotation.y=((x+z)%3)*.03;dummy.updateMatrix();stones.setMatrixAt(count++,dummy.matrix);}stones.count=count;stones.receiveShadow=true;base.add(stones);
   for(const p of PLACES){const g=building(p,palette.roof);base.add(g);interactive.push(g);pinSources.push({id:p.id,kind:'place',name:p.short,point:new T.Vector3(p.x,p.kind==='hall'?6.9:p.kind==='tea'?6.2:4.9,p.z)});}
   sculpture=atomSculpture(base);
   // 资产管线接入：广场原子核按 manifest 解析（GLB 优先，失败回退程序化占位）。
   loadManifest(assetUrl('/world-assets/manifest.json')).then(manifest=>resolveAsset(findAsset(manifest,'plaza-core'),{base:assetUrl('/')})).then(({object,source})=>{
    if(!alive||!object)return;
    object.position.set(-1,2.62,-0.5);object.scale.setScalar(.34);
    object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    base.add(object);
    if(source==='glb')window.__atomGlbLoaded=(window.__atomGlbLoaded||0)+1;
   }).catch(()=>{});
   // Village entrance and hanging sign.
   for(const x of [1,5]){box(base,x,1.7,12,.3,3.4,.3,'#8f7755');box(base,x,.2,12,.7,.4,.7,'#b7b9a2');}box(base,3,3.35,12,5.3,.35,.55,palette.roof);box(base,3,3.65,12,4.7,.22,.75,palette.roof);textSign(base,'原子江湖',3,2.8,12.22,2.4,.7);lantern(base,.7,2.8,12);lantern(base,5.3,2.8,12);
   [[-17,-11,1.1],[-15,-2,.9],[-17,3,1],[-15,13,1.1],[-8,13,.75],[15,-11,1.3],[17,-7,.9],[17,1,.8],[17,12,1.2],[-7,-12,.8],[7,-12,1.1],[6,9,.7]].forEach((a,i)=>tree(base,...a,i===1||i===7||i===9));
   for(let i=0;i<25;i++){const x=-18+(i*13)%36,z=i%2?-13.5:13.7;if(Math.abs(x-3)<3&&z>0)continue;ball(base,x,.16,z,.45,'#9cae8b',[1,.5,.7]);}
   for(const [x,z] of [[-6,2],[5,1],[-7,9],[7,-3],[15,7]]){cylinder(base,x,.2,z,.3,.4,.4,'#bba889');cylinder(base,x,.8,z,.05,.06,1.2,'#786b50');lantern(base,x,1.5,z);if(night){const l=new T.PointLight('#ffb15f',4,5);l.position.set(x,1.4,z);scene.add(l);}}
   // Tea garden seating and a small market stall.
   for(const [x,z] of [[-13,-1],[-9,1]]){cylinder(base,x,.6,z,.55,.55,.13,'#a88c61');cylinder(base,x,.32,z,.15,.22,.5,'#816c4d');for(const dx of [-.9,.9])cylinder(base,x+dx,.3,z,.3,.32,.4,'#bca87d');}
   box(base,7,.7,-8,2,.15,1,'#ac855c'); // colored below
   const stall=base.children.at(-1);stall.material=material('#ac855c');for(const x of [6.1,7.9])box(base,x,1.3,-8,.08,2,.08,'#897350');box(base,7,2.3,-8,2.4,.15,1.6,'#d6b16f');for(let i=0;i<3;i++)ball(base,6.5+i*.4,.9,-8,.15,['#d89467','#9ca57b','#debf75'][i]);
   for(const a of engine.agents){const model=character(a.color,.95);model.userData={...model.userData,kind:'agent',id:a.id};actorGroup.add(model);agentModels.set(a.id,model);interactive.push(model);}
   // 社交气泡：两位 AI 侠客闲聊时，头顶浮现当前话题。
   bubbles=new Map(engine.agents.map(a=>{const s=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,depthWrite:false,opacity:1}));s.scale.set(3.1,1.12,1);s.visible=false;scene.add(s);return [a.id,{sprite:s,last:''}];}));
  }else{
   ground.material=material('#c5bea9');box(base,0,.02,0,22,.1,18,'#ddd4ba');
   // Open roof museum: actual 3D exhibition stands with the original posters.
   for(const x of [-11,11])for(const z of [-9,0,9]){cylinder(base,x,2,z,.18,.23,4,'#7a6550');box(base,x,4,z,.6,.22,.6,palette.roof);}box(base,0,4,-9,22,.3,.3,'#8f7959');box(base,0,1.8,-9,22,3.6,.25,'#e9dec4');textSign(base,'武 林 大 会 · 作 品 展',0,3.15,-8.83,8,.8);
   for(const [x,z] of [[-5,-7],[5,-7],[-5,7],[5,7]]){lantern(base,x,3.7,z);if(night){const l=new T.PointLight('#ffb15f',5,10);l.position.set(x,3.4,z);scene.add(l);}}
   const loader=new T.TextureLoader();works.slice(0,8).forEach((w,i)=>{
    const x=(i%4)*4.5-6.75,z=i<4?-5:3,g=new T.Group();g.position.set(x,0,z);g.userData={kind:'work',id:w.id};base.add(g);interactive.push(g);
    const tc=trackColorOf(w);
    box(g,0,.35,0,2.6,.7,1.5,'#b8ac8e');box(g,0,.75,0,2.8,.13,1.6,'#f0e4ca');box(g,0,2,0,2.2,2.5,.16,'#7e735d');if(tc)box(g,0,2.11,.09,2.24,.05,.02,tc);
    const poster=new T.Mesh(new T.PlaneGeometry(2.05,2.3),new T.MeshStandardMaterial({color:'#eee4d0'}));poster.position.set(0,2.03,.1);g.add(poster);
    loader.load(w.thumb,tex=>{if(!alive){tex.dispose();return;}tex.colorSpace=T.SRGBColorSpace;const aspect=tex.image.width/tex.image.height;poster.scale.x=Math.min(1,aspect*2.3/2.05);poster.scale.y=Math.min(1,2.05/aspect/2.3);poster.material.map=tex;poster.material.color.set('#ffffff');poster.material.needsUpdate=true;});
    textSign(g,w.title.slice(0,12),0,.52,.77,2.4,.28);pinSources.push({id:w.id,kind:'work',name:w.title,point:new T.Vector3(x,3.7,z)});
    if(tc){const pl=new T.PointLight(tc,night?2.6:1.2,7);pl.position.set(x,2.6,z);scene.add(pl);}
   });
   tree(base,-15,-7,1.4);tree(base,15,-7,1.4);player.position.set(0,0,8);camera.position.set(23,22,29);controls.target.set(0,0,-1);
   // 观展中的 AI 侠客：站在展位前面向海报，头顶浮现观感气泡；点击可打开该作品。
   const hallBubbles=new Map();
   for(const a of engine.agents){
    const m=character(a.color,.95);m.userData={...m.userData,kind:'viewer',id:a.id,workId:null};actorGroup.add(m);agentModels.set(a.id,m);interactive.push(m);
    const s=new T.Sprite(new T.SpriteMaterial({transparent:true,depthTest:true,depthWrite:false,opacity:1}));s.scale.set(3.4,1.22,1);s.visible=false;scene.add(s);hallBubbles.set(a.id,{sprite:s,last:''});
   }
   latest.current.hallBubbles=hallBubbles;
  }
  const ring=new T.Mesh(new T.RingGeometry(.48,.57,40),new T.MeshBasicMaterial({color:'#fdf2b7',side:T.DoubleSide,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.y=.17;scene.add(ring);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),projection=new T.Vector3();let pointerStart=[0,0];
  const down=e=>{pointerStart=[e.clientX,e.clientY];};
  const up=e=>{if(Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(interactive,true);
   for(const hit of hits){let o=hit.object;while(o&&!o.userData.kind)o=o.parent;if(!o)continue;const {kind,id,workId}=o.userData;
    if(kind==='place')callbacks.current.onPlace(id);else if(kind==='agent')callbacks.current.onAgent(id);else if(kind==='viewer')callbacks.current.onViewer?.({id,workId});else if(kind==='peer')callbacks.current.onPeer?.(latest.current.peers.find(p=>p.id===id)||{id,name:'同行侠客'});else if(kind==='work')callbacks.current.onWork(id);else if(kind==='ground'){if(location==='town')engine.movePlayer(hit.point.x,hit.point.z);else hallPlayer.path=findPath([hallPlayer.x,hallPlayer.z],[hit.point.x,hit.point.z],hallWalkable);}break;}
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  let wasNarrow=null;
  function resize(){const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;const narrow=w<550;if(narrow!==wasNarrow){camera.position.set(location==='town'?32:23,location==='town'?30:22,location==='town'?39:29);camera.position.multiplyScalar(narrow?2.05:1);controls.target.set(0,0,0);wasNarrow=narrow;}camera.updateProjectionMatrix();}const observer=new ResizeObserver(resize);observer.observe(el);resize();
  let focusTarget=null,frame,last=performance.now(),lastPins=0;const home=()=>{camera.position.set(location==='town'?32:23,location==='town'?30:22,location==='town'?39:29);if(el.clientWidth<550)camera.position.multiplyScalar(2.05);controls.target.set(0,0,0);focusTarget=null;};
  // 性能监控与自动降级（PRD N01：阴影→粒子→像素比，先保帧率与可读性）。
  const perf={frames:0,mark:performance.now(),fps:60,lowFor:0,degraded:false};
  const degrade=()=>{perf.degraded=true;renderer.setPixelRatio(1);sun.castShadow=false;renderer.shadowMap.enabled=false;scene.traverse(o=>{if(o.isMesh)o.castShadow=false;});if(flies)flies.visible=false;callbacks.current.onPerf?.({fps:perf.fps,degraded:true});};
  window.__atomPerf=()=>({fps:Math.round(perf.fps),degraded:perf.degraded,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio()});
  // 调试/预览开关：?degrade=1 立即应用降级（也用于在低端设备上预览降级观感）。
  if(new URLSearchParams(window.location.search).get('degrade')==='1')degrade();
  apiRef.current={reset:home,zoom:v=>{camera.position.sub(controls.target).multiplyScalar(v).add(controls.target);},focus:id=>{const p=PLACES.find(p=>p.id===id);if(p){focusTarget=new T.Vector3(p.x,1,p.z);engine.movePlayer(...p.entry);}},
  // 导览“带我去”：只接受当前共享展位（前 8 件）中的作品，走到展位前的停留点。
  focusWork:id=>{if(location!=='hall')return false;const i=works.findIndex(w=>w.id===id);if(i<0||i>7)return false;const x=(i%4)*4.5-6.75,z=i<4?-5:3;focusTarget=new T.Vector3(x,1.7,z);hallPlayer.path=findPath([hallPlayer.x,hallPlayer.z],[x,z+2.4],hallWalkable);return true;},
  locate:()=>{const current=location==='town'?engine.player:hallPlayer;focusTarget=new T.Vector3(current.x,1,current.z);}};
  function render(now){if(!alive)return;const dt=Math.min((now-last)/1000,.05);last=now;engine.tick(dt);
   perf.frames++;if(now-perf.mark>=500){perf.fps=perf.frames*1000/(now-perf.mark);perf.frames=0;perf.mark=now;
    if(perf.fps<30&&!perf.degraded)perf.lowFor+=.5;else perf.lowFor=0;
    if(perf.lowFor>=3&&!perf.degraded)degrade();
    else if(latest.current.perfWatch)callbacks.current.onPerf?.({fps:Math.round(perf.fps),degraded:perf.degraded});}
   if(flies){const p=flies.geometry.attributes.position;for(let i=0;i<p.count;i++){const t=now*.00035+i*1.7;p.setXYZ(i,Math.sin(t)*6+((i*7)%13)-6,1.1+Math.sin(now*.0013+i*2.1)*.5,Math.cos(t*1.3)*5+((i*5)%11)-5);}p.needsUpdate=true;}
   if(location==='town'){
    // 远程真人：创建/移除模型，位置与朝向做轻量插值（广播约 5 次/秒）。
    const currentPeers=latest.current.peers||[];const seenIds=new Set();
    for(const p of currentPeers){seenIds.add(p.id);let m=peerModels.get(p.id);
     if(!m){m=character(p.color,.95);m.userData={...m.userData,kind:'peer',id:p.id};actorGroup.add(m);peerModels.set(p.id,m);interactive.push(m);}
     const gy=terrainHeight(p.x,p.z);m.position.x+=(p.x-m.position.x)*.35;m.position.z+=(p.z-m.position.z)*.35;m.position.y=gy;
     let da=p.angle-m.rotation.y;while(da>Math.PI)da-=Math.PI*2;while(da<-Math.PI)da+=Math.PI*2;m.rotation.y+=da*.2;
     m.userData.body.position.y=Math.sin(now*.002+p.x)*.016;m.userData.feet.forEach((f,i)=>{f.position.z=.04+Math.sin(now*.008+i*Math.PI)*.06;});}
    for(const[id,m]of[...peerModels])if(!seenIds.has(id)){actorGroup.remove(m);peerModels.delete(id);const idx=interactive.indexOf(m);if(idx>=0)interactive.splice(idx,1);m.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(x=>x.dispose());}});}
    for(const a of engine.agents){const b=bubbles?.get(a.id);if(!b)continue;const topic=(a.memory.at(-1)||'').split('聊起了')[1]||'';const show=!!a.partner&&!!topic;
     if(show&&b.last!==topic){const short=topic.length>7?topic.slice(0,7)+'…':topic;b.sprite.material.map?.dispose();b.sprite.material.map=bubbleTexture('聊起'+short);b.sprite.material.needsUpdate=true;b.last=topic;}
     b.sprite.visible=show;if(show)b.sprite.position.set(a.x,(terrainHeight(a.x,a.z)||0)+2.85,a.z);}for(const a of [...engine.agents,engine.player]){const m=a.id==='you'?player:agentModels.get(a.id);m.position.set(a.x,terrainHeight(a.x,a.z),a.z);m.rotation.y=a.angle;const moving=a.path.length>0;m.userData.body.position.y=moving?Math.abs(Math.sin(now*.009))* .055:Math.sin(now*.002+a.x)*.016;m.userData.feet.forEach((f,i)=>f.position.z=.04+(moving?Math.sin(now*.01+i*Math.PI)*.13:0));if(a.held)m.userData.arms[0].rotation.z=Math.sin(now*.004)*.4;}
    const dest=engine.player.path.at(-1);ring.visible=!!dest;if(dest)ring.position.set(dest[0],terrainHeight(dest[0],dest[1])+.18,dest[1]);
   }else {engine.advance(hallPlayer,dt,3.2);player.position.set(hallPlayer.x,0,hallPlayer.z);player.rotation.y=hallPlayer.angle;const dest=hallPlayer.path.at(-1);ring.visible=!!dest;if(dest)ring.position.set(dest[0],.18,dest[1]);player.userData.body.position.y=hallPlayer.path.length?Math.abs(Math.sin(now*.009))*.055:0;
    // 观展 AI：按引擎状态站在展位前；观察中抬头看海报，生成中头顶浮现观感气泡。
    const hallBubbles=latest.current.hallBubbles;
    for(const a of engine.agents){
     const m=agentModels.get(a.id);if(!m)continue;
     const show=a.viewing&&Number.isInteger(a.viewing.stand)&&a.viewing.stand>=0&&a.viewing.stand<8;
     m.visible=!!show;
     if(!show){const b=hallBubbles?.get(a.id);if(b)b.sprite.visible=false;continue;}
     const i=a.viewing.stand,x=(i%4)*4.5-6.75,z=i<4?-5:3;
     const tx=x,tz=z+2.5;m.position.x+=(tx-m.position.x)*.2;m.position.z+=(tz-m.position.z)*.2;m.position.y=0;
     m.rotation.y=Math.PI;
     const observing=a.viewing.phase==='observing'||a.viewing.phase==='generating';
     m.userData.body.position.y=observing?Math.sin(now*.0016)*.03+0.04:0;
     m.userData.body.rotation.x=observing?-0.18:0;
     const b=hallBubbles?.get(a.id);const impression=(a.memory.at(-1)||'');
     if(b){
      const showBubble=a.viewing.phase==='generating'&&/^看了《/.test(impression);
      if(showBubble&&b.last!==impression){const short=impression.length>26?impression.slice(0,25)+'…':impression;b.sprite.material.map?.dispose();b.sprite.material.map=bubbleTexture(short);b.sprite.material.needsUpdate=true;b.last=impression;}
      b.sprite.visible=showBubble;if(showBubble)b.sprite.position.set(m.position.x,2.9,m.position.z);
     }
     m.userData.workId=a.viewing.workId;
    }
   }
   if(focusTarget){const delta=focusTarget.clone().sub(controls.target).multiplyScalar(.035);controls.target.add(delta);camera.position.add(delta);if(delta.length()<.003)focusTarget=null;}
   controls.update();if(skyDome)skyDome.position.copy(camera.position);renderer.render(scene,camera);
   if(now-lastPins>120){lastPins=now;const sources=[...pinSources];{const current=location==='town'?engine.player:hallPlayer;sources.push({id:'you',kind:'player',name:engine.player.name==='你'?'你在这里':engine.player.name,point:new T.Vector3(current.x,2.05+(location==='town'?terrainHeight(current.x,current.z):0),current.z)});};
    for(const p of (latest.current.peers||[])){const pm=peerModels.get(p.id);if(pm)sources.push({id:p.id,kind:'peer',name:`${p.name} · 真人`,whisper:(p.state||'').includes('私'),point:new T.Vector3(pm.position.x,2.05+pm.position.y,pm.position.z)});}
    if(location==='hall')for(const a of engine.agents){if(!a.viewing)continue;const m=agentModels.get(a.id);if(!m||!m.visible)continue;const phase={planned:'前往展会',moving:'走向展位',observing:'观展中',generating:'整理观感'}[a.viewing.phase]||'观展中';sources.push({id:a.id,kind:'viewer',name:`${a.name} · ${phase}`,workId:a.viewing.workId,point:new T.Vector3(m.position.x,2.05,m.position.z)});}
    const arr=sources.map(p=>{projection.copy(p.point).project(camera);return {...p,x:(projection.x*.5+.5)*el.clientWidth,y:(-.5*projection.y+.5)*el.clientHeight,visible:projection.z<1&&Math.abs(projection.x)<.97&&Math.abs(projection.y)<.96};});setPins(arr);callbacks.current.onSnapshot(engine.snapshot());}
   frame=requestAnimationFrame(render);
  }frame=requestAnimationFrame(render);
  return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();delete window.__atomPerf;renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.map?.dispose();m.dispose();});}});renderer.dispose();el.removeChild(renderer.domElement);};
 },[engine,theme,night,location,works,playerColor]);
 return <><div className="webgl-host" ref={host} data-testid="world-canvas"/>{error?<div className="webgl-error"><h2>当前设备暂不支持 3D</h2><p>仍可完整浏览赛事与作品。</p><button onClick={()=>onPlace('hall')}>打开比赛展示馆</button></div>:labels&&<div className="scene-labels">{pins.filter(p=>p.visible).map(p=><button key={p.id} className={`scene-pin ${p.kind}${p.whisper?' whisper':''}`} style={{left:p.x,top:p.y}} onClick={()=>p.kind==='place'?onPlace(p.id):p.kind==='work'?onWork(p.id):p.kind==='peer'?onPeer((latest.current.peers||[]).find(x=>x.id===p.id)||{name:'同行侠客'}):p.kind==='viewer'?callbacks.current.onViewer?.({id:p.id,workId:p.workId}):apiRef.current?.locate()}>{p.kind==='place'&&<span className="pin-dot"/>}{p.name}{p.whisper&&<span className="whisper-mark">私语中</span>}{p.kind==='peer'&&<span className="peer-live">真人</span>}{p.kind==='viewer'&&<span className="peer-live view">观展</span>}{p.kind==='place'&&<span className="pin-arrow">↗</span>}</button>)}</div>}</>;
}
