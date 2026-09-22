import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {chatPlugin} from './server/chat.mjs';
import {contentPlugin} from './server/content.mjs';
import {adminPlugin} from './server/admin.mjs';
import {authPlugin} from './server/authApi.mjs';
import {meApiPlugin} from './server/meApi.mjs';
export default defineConfig(({mode})=>({base:process.env.VITE_BASE_PATH||'/',plugins:[react(),authPlugin(),meApiPlugin(),adminPlugin(),contentPlugin(),chatPlugin(loadEnv(mode,process.cwd(),''))],optimizeDeps:{entries:['index.html']},server:{port:5173,strictPort:true,host:'127.0.0.1'},build:{rollupOptions:{output:{manualChunks:{three:['three'],react:['react','react-dom']}}}}}));
