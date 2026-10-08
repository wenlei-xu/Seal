import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createModelChannel, defaultConfig } from '@/stores/use-config-store';

test('production composer selects, sends and refreshes skills through button and slash entry points',async()=>{
    const build=await Bun.build({entrypoints:[import.meta.dir+'/fixtures/assistant-skill-picker-harness.tsx'],target:'browser',define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true','import.meta.env.MODE':'"production"','import.meta.env.VITE_CANVAS_LOCAL_MODE':'"true"','import.meta.env.VITE_CANVAS_BACKEND_URL':'"/api"','process.env.NODE_ENV':'"production"'},plugins:[{name:'source',setup(builder){
        builder.onResolve({filter:/^@\/components\/model-logo$/},()=>({path:'model-logo',namespace:'test-icons'}));
        builder.onLoad({filter:/.*/,namespace:'test-icons'},()=>({contents:'export function ModelLogo(){return null}',loader:'js'}));
        builder.onResolve({filter:/^@\//},args=>({path:Bun.resolveSync('../src/'+args.path.slice(2),import.meta.dir)}));
    }}]});
    expect(build.success).toBe(true);
    const javascript=await build.outputs.find(item=>item.path.endsWith('.js'))!.text();
    const repo=path.resolve(import.meta.dir,'../..');
    const cssFiles=(await fs.readdir(path.join(repo,'web/dist/static'))).filter(file=>file.endsWith('.css'));
    const links=cssFiles.map(file=>`<link rel="stylesheet" href="/static/${file}">`).join('');
    const config={...defaultConfig,assistantModel:'beefapi::synthetic-model',channels:[createModelChannel({id:'beefapi',pinned:true,enabled:true,models:['synthetic-model'],modelProfiles:[{model:'synthetic-model',capability:'text',protocol:'chat-completion'}]})]};
    let rows=[{id:'sample-id',name:'sample',displayName:'示例剪辑技能',description:'整理当前视频和标题',builtin:false,enabled:true,version:'1',contentHash:'one',fileCount:1,updatedAt:''},{id:'disabled-id',name:'disabled',displayName:'停用技能',description:'不可选',builtin:false,enabled:false,version:'1',contentHash:'two',fileCount:1,updatedAt:''}];
    const submitted:Array<Record<string,unknown>>=[];
    const ok=(data:unknown)=>Response.json({code:0,data});
    const server=Bun.serve({port:0,async fetch(request){
        const url=new URL(request.url),route=url.pathname;
        if(route==='/harness.js')return new Response(javascript,{headers:{'Content-Type':'application/javascript'}});
        if(route.startsWith('/static/'))return new Response(await fs.readFile(path.join(repo,'web/dist',route)),{headers:{'Content-Type':route.endsWith('.css')?'text/css':'application/octet-stream'}});
        if(route==='/api/skill-hub')return ok({skills:rows});
        if(route.endsWith('/media/proposals'))return ok({items:[]});
        if(route.includes('model-config'))return ok({config,revision:0});
        if(route.endsWith('/assistant/ui-session'))return ok({token:'synthetic-only',expiresAt:new Date(Date.now()+1800000).toISOString()});
        if(route.endsWith('/assistant/status'))return ok({available:true,model:{id:'synthetic-model',channelId:'beefapi'}});
        if(route.endsWith('/assistant/history'))return ok({sessionId:'s1',turns:[]});
        if(route.endsWith('/assistant/sessions'))return ok({currentSessionId:'s1',sessions:[]});
        if(route.endsWith('/assistant/chat')){
            const body=await request.json();submitted.push(body);
            const skill=rows.find(row=>row.id===body.selectedSkillId);
            return new Response(JSON.stringify({type:'turn_end',turnId:'turn-'+submitted.length,reply:'已读取指定技能。',toolCalls:[],proposals:[],requestedSkill:skill||null,skillsUsed:skill?[skill]:[],error:null})+'\n');
        }
        if(route.startsWith('/api/'))return ok({});
        return new Response(`<html class="dark"><head>${links}</head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`,{headers:{'Content-Type':'text/html'}});
    }});
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    try {
        const page=await browser.newPage({viewport:{width:960,height:850}});
        const errors:string[]=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
        await page.goto(`http://127.0.0.1:${server.port}`);
        const input=page.getByRole('textbox',{name:'给助手的消息'});
        try { await input.waitFor({timeout:5000}); } catch(error) { throw new Error(`Composer did not mount: ${JSON.stringify(errors)}; body=${await page.locator('body').innerText()}`,{cause:error}); }
        await input.fill('/sample');await input.press('Enter');
        await page.getByRole('button',{name:'移除指定技能'}).waitFor();
        expect(await input.inputValue()).toBe('');
        expect(await page.getByRole('button',{name:'发送',exact:true}).isEnabled()).toBe(false);
        await input.fill('请整理当前视频');await page.getByRole('button',{name:'发送',exact:true}).click();
        await page.getByText('指定技能：示例剪辑技能',{exact:true}).waitFor();
        expect(submitted[0].selectedSkillId).toBe('sample-id');
        expect(submitted[0].message).toBe('请整理当前视频');
        expect(await page.getByRole('button',{name:'移除指定技能'}).count()).toBe(0);
        await page.getByRole('button',{name:'选择技能'}).click();
        await page.getByRole('option',{name:/示例剪辑技能/}).waitFor();
        expect(await page.getByRole('option',{name:/停用技能/}).count()).toBe(0);
        const directory=path.join(repo,'.local/cache/assistant-skill-picker');await fs.mkdir(directory,{recursive:true});
        await page.screenshot({path:path.join(directory,'menu.png')});
        await page.getByRole('option',{name:/示例剪辑技能/}).click();
        await input.fill('下一条需求');
        rows[0].enabled=false;
        await page.getByRole('button',{name:'选择技能'}).click();
        await page.getByText('所选技能已停用、删除或不可用，请重新选择。',{exact:true}).waitFor();
        expect(await page.getByRole('button',{name:'发送',exact:true}).isEnabled()).toBe(false);
        await page.getByRole('textbox',{name:'搜索可用技能'}).press('Escape');
        await page.getByRole('button',{name:'移除指定技能'}).click();
        rows.push({...rows[0],id:'new-id',name:'new-skill',displayName:'新导入技能',enabled:true});
        await page.getByRole('button',{name:'选择技能'}).click();
        await page.getByRole('option',{name:/新导入技能/}).waitFor();
        await page.getByRole('textbox',{name:'搜索可用技能'}).press('Escape');
        await input.fill('https://example.com/video');
        expect(await page.getByRole('listbox',{name:'可用技能'}).count()).toBe(0);
        expect(await page.getByRole('button',{name:'发送',exact:true}).isEnabled()).toBe(true);
        expect(errors).toEqual([]);
    }finally{await browser.close();server.stop(true);}
},60000);
