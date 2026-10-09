import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:45000,workers:1,reporter:'list',outputDir:'/tmp/ghostdraw-web-test-results',use:{baseURL:process.env.GHOSTDRAW_QA_URL||'http://127.0.0.1:8877',launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-proxy-server']}}});
