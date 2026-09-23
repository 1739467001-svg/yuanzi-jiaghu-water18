import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {chatPlugin} from './server/chat.mjs';
import {contentPlugin} from './server/content.mjs';
import {adminPlugin} from './server/admin.mjs';
import {authPlugin} from './server/authApi.mjs';
import {meApiPlugin} from './server/meApi.mjs';
import {attachWorldServer} from './server/worldServer.mjs';
// 世界服务插件：把 WebSocket 世界挂到 dev/preview 的 HTTP server 上（/ws）。
function worldPlugin(){
 return {name:'atom-world-server',configureServer(server){attachWorldServer(server.httpServer,{path:'/ws'});},configurePreviewServer(server){attachWorldServer(server.httpServer,{path:'/ws'});}};
}
export default defineConfig(({mode})=>({base:process.env.VITE_BASE_PATH||'/',plugins:[react(),authPlugin(),meApiPlugin(),adminPlugin(),contentPlugin(),chatPlugin(loadEnv(mode,process.cwd(),'')),worldPlugin()],optimizeDeps:{entries:['index.html']},server:{port:5173,strictPort:true,host:'127.0.0.1',hmr:{port:5174,host:'127.0.0.1'}},build:{rollupOptions:{output:{manualChunks:{three:['three'],react:['react','react-dom']}}}}}));
