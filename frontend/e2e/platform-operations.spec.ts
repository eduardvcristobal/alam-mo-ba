import {expect,test} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',
  JSON.stringify({token:'z'.repeat(43),accountId:'super-admin',expiresAt:'2099-01-01T00:00:00Z'})));
 let subjects=[{code:'Science',en:'Science',fil:'Agham',active:true,displayOrder:10}];
 let topics=[{id:1,subject:'Science',grade:7,en:'Matter',fil:'Materya',active:true}];
 let settings=[{key:'content_submissions_enabled',value:true,updatedAt:'2026-11-04T00:00:00Z'}];
 await page.route('**/api/v1/admin/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const method=route.request().method();
  let payload:unknown={};
  if(path.endsWith('/me'))payload={id:'super-admin',roles:['SUPER_ADMIN']};
  else if(path.endsWith('/dashboard'))payload={facts:2,publishedFacts:1,pendingFacts:0,quizzes:1,pendingQuizzes:0,publishedQuizzes:1};
  else if(path.endsWith('/facts')||path.endsWith('/quizzes')||path.endsWith('/review/audit'))payload=[];
  else if(path.endsWith('/review/queue'))payload={facts:[],quizzes:[]};
  else if(path.endsWith('/curriculum/subjects')&&method==='GET')payload=subjects;
  else if(path.endsWith('/curriculum/subjects')&&method==='POST'){
   const input=route.request().postDataJSON();subjects=[...subjects,input];payload={code:input.code};
  }
  else if(path.endsWith('/curriculum/topics')&&method==='GET')payload=topics;
  else if(path.endsWith('/curriculum/topics')&&method==='POST'){
   const input=route.request().postDataJSON();topics=[...topics,{...input,id:2}];payload={id:2};
  }
  else if(path.endsWith('/learners'))payload=[{id:'12345678-0000-0000-0000-000000000000',status:'ACTIVE',createdAt:'2026-11-04T00:00:00Z'}];
  else if(path.endsWith('/analytics'))payload={registeredAccounts:5,activeAccounts:4,disabledAccounts:1,guestBackups:2,
    recordedQuizAttempts:7,publishedFacts:1,publishedQuizQuestions:1,
    factsBySubject:[{subject:'Science',count:1}],factsByStatus:[{status:'PUBLISHED',count:1}],quizzesByStatus:[{status:'PUBLISHED',count:1}]};
  else if(path.endsWith('/platform/settings')&&method==='GET')payload=settings;
  else if(path.endsWith('/platform/settings/content_submissions_enabled')&&method==='PUT'){
   const input=route.request().postDataJSON();settings=[{...settings[0],value:input.value}];payload={key:'content_submissions_enabled',value:input.value};
  }
  else if(path.endsWith('/platform/audit'))payload=[{action:'CHANGE_PLATFORM_SETTING',targetType:'SETTING',targetId:'content_submissions_enabled',
    actorId:'super-admin',details:'CI',at:'2026-11-04T00:00:00Z'}];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
});
test('curriculum navigation supports bilingual topic creation',async({page})=>{
 await page.goto('/admin');
 await page.getByRole('button',{name:/Curriculum/}).click();
 await expect(page.getByText('Water and Matter')).toHaveCount(0);
 await page.getByLabel('English topic').fill('Water and Matter');
 await page.getByLabel('Filipino topic').fill('Tubig at Materya');
 await page.getByRole('button',{name:'Create topic'}).click();
 await expect(page.getByText('Water and Matter / Tubig at Materya')).toBeVisible();
});
test('learner administration reveals no names or emails and analytics are aggregate',async({page})=>{
 await page.goto('/admin');
 await page.getByRole('button',{name:/Learners/}).click();
 await expect(page.getByText('Account 12345678…')).toBeVisible();
 await expect(page.getByText(/Personal identities and individual learning histories are not exposed/)).toBeVisible();
 await page.getByRole('button',{name:/Analytics/}).click();
 await expect(page.getByText('Registered accounts')).toBeVisible();
 await expect(page.getByText('Recorded quiz attempts')).toBeVisible();
});
test('platform settings require reason before privileged changes',async({page})=>{
 await page.goto('/admin');
 await page.getByRole('button',{name:/Platform Settings/}).click();
 await expect(page.getByRole('button',{name:'Turn off'})).toBeDisabled();
 await page.getByLabel('Reason for change').fill('Editorial maintenance');
 await page.getByRole('button',{name:'Turn off'}).click();
 await expect(page.getByText('Setting updated and audited')).toBeVisible();
 await expect(page.getByText(/Disabled · Updated/)).toBeVisible();
});
