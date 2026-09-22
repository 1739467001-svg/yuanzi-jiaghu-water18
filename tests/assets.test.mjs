import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest,findAsset,resolveAsset} from '../src/world/assets.js';
const manifestPath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/world-assets/manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));

test('shipped asset manifest passes its own contract', () => {
 assert.doesNotThrow(()=>validateManifest(manifest));
 assert.match(manifest.manifestVersion,/^assets-v\d+$/);
 assert.ok(manifest.models.length>=3);
 for(const entry of manifest.models){
  assert.ok(entry.glb===null||entry.glb.startsWith('/'),'glb 路径必须可寻址');
  assert.ok(entry.license.length>0,'授权信息必填');
  if(entry.kind==='character')assert.ok(entry.requiredAnimations.length>0,'角色须声明必备动画');
 }
 assert.equal(findAsset(manifest,'atom-sculpture').kind,'decoration');
 assert.equal(findAsset(manifest,'not-a-thing'),null);
});

test('manifest validation rejects broken contracts', () => {
 assert.throws(()=>validateManifest(null));
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[]}));
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:0,license:'x',fallback:'procedural:character'}]}));
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:1,license:'x',fallback:'procedural:character'},{id:'a',version:1,license:'y',fallback:'procedural:character'}]}),/重复/);
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:1,license:'',fallback:'procedural:character'}]}),/授权/);
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:1,license:'x',fallback:'procedural:character',glb:'relative.glb'}]}),/glb/);
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:1,license:'x',glb:null}]}),/兜底/);
 assert.throws(()=>validateManifest({manifestVersion:'assets-v1',models:[{id:'a',version:1,license:'x',fallback:'procedural:character',kind:'character'}]}),/动画/);
});

test('assets fall back to procedural when no GLB or on load failure', async () => {
 const none=await resolveAsset({id:'x',fallback:'procedural:atomSculpture'});
 assert.equal(none.source,'procedural');
 assert.ok(none.object,'应返回程序化占位对象');
 const failing=await resolveAsset({id:'x',glb:'/assets/models/missing.glb',fallback:'procedural:atomSculpture'},{gltfLoader:{loadAsync:async()=>{throw new Error('404');}}});
 assert.equal(failing.source,'procedural');
 const empty=await resolveAsset({id:'x',glb:'/assets/models/empty.glb',fallback:'procedural:atomSculpture'},{gltfLoader:{loadAsync:async()=>({scene:null})}});
 assert.equal(empty.source,'procedural');
 const missingEntry=await resolveAsset(null);
 assert.equal(missingEntry.source,'procedural');
});

test('a valid GLB resolves through the loader', async () => {
 const glb=await resolveAsset({id:'x',glb:'/assets/models/proof-atom-core.glb',fallback:'procedural:atomSculpture'},{gltfLoader:{loadAsync:async()=>({scene:{isScene:true,name:'proof'}})}});
 assert.equal(glb.source,'glb');
 assert.equal(glb.object.name,'proof');
});

test('proof GLB on disk is a valid glTF 2.0 file the loader can parse', async () => {
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const buffer=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/world-assets/models/proof-atom-core.glb'));
 const array=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 const loader=new GLTFLoader();
 const gltf=await new Promise((resolve,reject)=>loader.parse(array,'',resolve,reject));
 const mesh=gltf.scene.children[0];
 assert.ok(mesh,'GLB 应包含节点');
 let triangles=0;mesh.traverse(o=>{if(o.isMesh)triangles+=o.geometry.index.count/3;});
 assert.equal(triangles,20);
 assert.equal(mesh.material.name,'core-gold');
});
