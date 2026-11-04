import {expect,test} from '@playwright/test';

test('super admin can navigate curriculum, learner directory, analytics, settings and audit',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',JSON.stringify({
  token:'A'.repeat(43),accountId:'ci-super',expiresAt:'2099-01-01T00:00:00Z'
 })));
 let topicCreated=false;
 let setting='true';
 await page.route('**/api/v1/admin/**',async route=>{
  const url=new URL(route.request().url());
  const p=url.pathname;
  const method=route.request().method();
  const reply=(data:unknown,status=200)=>route.fulfill({
   status,contentType:'application/json',body:JSON.stringify(data)});
  if(p==='/api/v1/admin/me')return reply({accountId:'ci-super',roles:['SUPER_ADMIN']});
  if(p==='/api/v1/admin/overview')return reply({facts:12,published:9,questions:8,reviews:1});
  if(p==='/api/v1/admin/facts'||p==='/api/v1/admin/questions'||p==='/api/v1/admin/workflow/queue')return reply([]);
  if(p.endsWith('/operations/subjects'))return reply([{code:'Science',name:'Science',enabled:true}]);
  if(p.endsWith('/operations/topics')&&method==='POST'){topicCreated=true;return reply({id:5,created:true});}
  if(p.endsWith('/operations/topics'))return reply(topicCreated?[{id:5,subject:'Science',grade:7,en:'Earth science',fil:'Agham ng Daigdig',enabled:true}]:[]);
  if(p.endsWith('/operations/learners'))return reply([{accountId:'ci-learner-1234',status:'ACTIVE',createdAt:'2026-11-04T01:00:00Z',learnedCount:4}]);
  if(p.endsWith('/operations/analytics'))return reply({learners:5,active:5,publishedFacts:9,publishedQuizzes:8,quizAttempts:20,pendingPrivacy:1});
  if(p.endsWith('/operations/privacy'))return reply([{id:21,accountId:'ci-learner-1234',type:'EXPORT',status:'OPEN',createdAt:'2026-11-04T01:00:00Z'}]);
  if(p.includes('/operations/settings/daily_challenge_enabled')&&method==='PUT'){setting=route.request().postDataJSON().value;return reply({key:'daily_challenge_enabled',value:setting});}
  if(p.endsWith('/operations/settings'))return reply([{key:'daily_challenge_enabled',value:setting}]);
  if(p.endsWith('/operations/audit'))return reply([{id:1,actor:'ci-super-1234',action:'CREATE',type:'FACT',entityId:1,at:'2026-11-04T01:00:00Z'}]);
  return reply({},404);
 });
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 await page.getByRole('button',{name:/Curriculum/}).click();
 await expect(page.getByRole('heading',{name:'Curriculum and topics'})).toBeVisible();
 await page.getByRole('textbox',{name:'English topic'}).fill('Earth science');
 await page.getByRole('textbox',{name:'Filipino topic'}).fill('Agham ng Daigdig');
 await page.getByRole('button',{name:'Add topic'}).click();
 await expect(page.getByText('Topic added')).toBeVisible();
 await page.getByRole('button',{name:/Learners/}).click();
 await expect(page.getByRole('heading',{name:'Learner accounts'})).toBeVisible();
 await page.getByRole('button',{name:/Analytics/}).click();
 await expect(page.getByRole('heading',{name:'Aggregate analytics'})).toBeVisible();
 await page.getByRole('button',{name:/Privacy Requests/}).click();
 await expect(page.getByRole('heading',{name:'Privacy requests'})).toBeVisible();
 await page.getByRole('button',{name:/Settings/}).click();
 await expect(page.getByRole('heading',{name:'Platform settings'})).toBeVisible();
 await page.getByRole('button',{name:/Audit Logs/}).click();
 await expect(page.getByRole('heading',{name:'Administrator audit log'})).toBeVisible();
});

test('editor cannot see platform settings or audit tabs',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',JSON.stringify({
  token:'E'.repeat(43),accountId:'ci-editor',expiresAt:'2099-01-01T00:00:00Z'
 })));
 await page.route('**/api/v1/admin/**',route=>{
  const p=new URL(route.request().url()).pathname;
  const data=p.endsWith('/admin/me')?{accountId:'ci-editor',roles:['EDITOR']}:
   p.endsWith('/admin/overview')?{facts:0,published:0,questions:0,reviews:0}:[];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Settings/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Audit Logs/})).toHaveCount(0);
});
