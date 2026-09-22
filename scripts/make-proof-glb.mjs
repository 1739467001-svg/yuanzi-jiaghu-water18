// 生成一个最小合法 GLB（二十面体“原子核”），用于验证资产加载管线的 GLB 路径。
// 正式品牌资产到位后按同样流程放进 public/assets/models/ 并在 manifest.json 登记。
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/assets/models');
mkdirSync(out,{recursive:true});
// 正二十面体顶点
const t=(1+Math.sqrt(5))/2;
const verts=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
const faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const positions=[],normals=[],indices=[];
let index=0;
for(const f of faces){
 const [a,b,c]=f.map(i=>verts[i]);
 const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
 const len=Math.hypot(...n)||1;const nn=n.map(v=>v/len);
 for(const v of [a,b,c]){positions.push(...v);normals.push(...nn);indices.push(index++);}
}
const posF32=new Float32Array(positions),nrmF32=new Float32Array(normals),idxU16=new Uint16Array(indices);
const pad=(n)=>Math.ceil(n/4)*4;
const posLen=pad(posF32.byteLength),nrmLen=pad(nrmF32.byteLength),idxLen=pad(idxU16.byteLength);
const bin=Buffer.alloc(posLen+nrmLen+idxLen);
posF32.forEach((v,i)=>bin.writeFloatLE(v,i*4));
nrmF32.forEach((v,i)=>bin.writeFloatLE(v,posLen+i*4));
idxU16.forEach((v,i)=>bin.writeUInt16LE(v,posLen+nrmLen+i*2));
const gltf={
 asset:{version:'2.0',generator:'atom-jianghu proof generator'},
 scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'atom-core'}],
 meshes:[{name:'atom-core',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],
 materials:[{pbrMetallicRoughness:{baseColorFactor:[0.85,0.72,0.42,1],metallicFactor:.3,roughnessFactor:.5},name:'core-gold'}],
 accessors:[
  {bufferView:0,componentType:5126,count:posF32.length/3,type:'VEC3',min:[-t,-t,-t],max:[t,t,t]},
  {bufferView:1,componentType:5126,count:nrmF32.length/3,type:'VEC3'},
  {bufferView:2,componentType:5123,count:idxU16.length,type:'SCALAR'}],
 bufferViews:[
  {buffer:0,byteOffset:0,byteLength:posF32.byteLength,target:34962},
  {buffer:0,byteOffset:posLen,byteLength:nrmF32.byteLength,target:34962},
  {buffer:0,byteOffset:posLen+nrmLen,byteLength:idxU16.byteLength,target:34963}],
 buffers:[{byteLength:bin.length}],
};
const json=Buffer.from(JSON.stringify(gltf),'utf8');
const jsonPad=Buffer.alloc(pad(json.length)-json.length,0x20); // GLB 规范：JSON 块以空格填充
const header=Buffer.alloc(12);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+jsonPad.length+8+bin.length,8);
const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(json.length+jsonPad.length,0);jsonHeader.write('JSON',4);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32BE(bin.length,0);binHeader.write('BIN\0',4);
writeFileSync(path.join(out,'proof-atom-core.glb'),Buffer.concat([header,jsonHeader,json,jsonPad,binHeader,bin]));
console.log('proof GLB written:',path.join(out,'proof-atom-core.glb'),12+8+json.length+jsonPad.length+8+bin.length,'bytes');
