import {expect,test} from '@playwright/test';

test('platform administration never bypasses authentication',async({page})=>{
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:/Platform Admin/})).toBeVisible();
 await expect(page.getByText(/Sign in with an existing provisioned platform-admin account/)).toBeVisible();
 await expect(page.getByRole('button',{name:/Save draft/})).toHaveCount(0);
});

test('support role can view dashboard but cannot edit or publish',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',
  JSON.stringify({token:'a'.repeat(43),accountId:'support',expiresAt:'2099-01-01T00:00:00Z'})));
 await page.route('**/api/v1/admin/**',async route=>{
  const url=route.request().url();
  let payload:unknown={};
  if(url.endsWith('/me'))payload={id:'support',roles:['SUPPORT']};
  else if(url.endsWith('/dashboard'))payload={facts:1,publishedFacts:0,pendingFacts:0,quizzes:0,pendingQuizzes:0,publishedQuizzes:0};
  else if(url.endsWith('/facts'))payload=[{id:1,key:'ci-fact',subject:'Science',emoji:'💡',status:'DRAFT',verified:false,createdAt:'2026-11-04T00:00:00Z'}];
  else if(url.endsWith('/quizzes')||url.endsWith('/review/audit'))payload=[];
  else if(url.endsWith('/review/queue'))payload={facts:[],quizzes:[]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('/admin');
 await expect(page.getByText('Total facts')).toBeVisible();
 await page.getByRole('button',{name:/Facts & Sources/}).click();
 await expect(page.getByText('Read-only access. An editor role is required.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Save draft'})).toHaveCount(0);
});

test('editor can draft facts and submit for review but cannot approve',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',
  JSON.stringify({token:'a'.repeat(43),accountId:'editor',expiresAt:'2099-01-01T00:00:00Z'})));
 let facts:unknown[]=[];
 let submitted=false;
 await page.route('**/api/v1/admin/**',async route=>{
  const url=new URL(route.request().url());
  const path=url.pathname;
  let payload:unknown={};
  if(path.endsWith('/me'))payload={id:'editor',roles:['EDITOR']};
  else if(path.endsWith('/dashboard'))payload={facts:facts.length,publishedFacts:0,pendingFacts:Number(submitted),quizzes:0,pendingQuizzes:0,publishedQuizzes:0};
  else if(path.endsWith('/facts')&&route.request().method()==='GET')payload=facts;
  else if(path.endsWith('/facts')&&route.request().method()==='POST'){
    const body=route.request().postDataJSON();
    facts=[{id:5,key:body.key,subject:body.subject,emoji:body.emoji,status:'DRAFT',verified:false,createdAt:'2026-11-04T00:00:00Z'}];
    payload={id:5,status:'DRAFT'};
  }else if(path.endsWith('/review/facts/5')){
    submitted=true;facts=facts.map((f:any)=>({...f,status:'IN_REVIEW'}));
    payload={id:5,status:'IN_REVIEW'};
  }else if(path.endsWith('/quizzes')||path.endsWith('/review/audit'))payload=[];
  else if(path.endsWith('/review/queue'))payload={facts:submitted?[{id:5,label:'ci-fact',status:'IN_REVIEW'}]:[],quizzes:[]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto('/admin');
 await page.getByRole('button',{name:/Facts & Sources/}).click();
 await page.getByLabel('Fact key').fill('ci-fact');
 await page.getByLabel('English explanation').fill('This is a test fact');
 await page.getByLabel('Filipino explanation').fill('Isang pansubok na kaalaman');
 await page.getByLabel('Source title').fill('Research');
 await page.getByLabel('Source URL').fill('https://example.org/source');
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect(page.getByText('Fact draft saved')).toBeVisible();
 await page.getByRole('button',{name:'Submit for review'}).click();
 await page.getByRole('button',{name:/Review Queue/}).click();
 await expect(page.getByText('ci-fact')).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve'})).toHaveCount(0);
});
