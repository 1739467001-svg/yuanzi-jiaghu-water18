// CLI：npm run content:import —— 应用一次导入。差异预览见运营后台 /admin.html。
import {runImport} from './import-engine.mjs';
const result=runImport();
console.log('Imported',result.works,'works across',result.editions,'editions; private contacts and QR codes excluded; existing publication status preserved, new records pending review.');
