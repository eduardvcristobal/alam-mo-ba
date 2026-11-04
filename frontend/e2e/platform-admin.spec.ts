import {test,expect} from '@playwright/test';

test('anonymous visitor cannot see admin navigation or protected actions',async({page})=>{
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Alam Mo Ba? Admin'})).toBeVisible();
 await expect(page.getByText(/There is no public admin registration/)).toBeVisible();
 await expect(page.getByRole('button',{name:/Add fact/})).toHaveCount(0);
});

test('authenticated editor can access dashboard, create bilingual fact and submit for review',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('alam-mo-ba-account-session',JSON.stringify({
   token:'t'.repeat(43),accountId:'ci-editor',expiresAt:'2099-01-01T00:00:00Z'
  }));
 });
 const fact={id:101,key:'editor-test-water',subject:'Science',emoji:'🧊',status:'DRAFT',en:'Water freezes.',
    fil:'Nagyeyelo ang tubig.',sourceTitle:'Synthetic source',sourceUrl:'https://example.org',
    student:true,grade:7,explore:true};
 let recorded=false;let submitted=false;
 await page.route('**/api/v1/admin/**',async route=>{
  const url=route.request().url(),method=route.request().method();
  const reply=async(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.endsWith('/admin/me'))return reply({accountId:'ci-editor',roles:['EDITOR']});
  if(url.endsWith('/admin/overview'))return reply({facts:recorded?1:0,published:0,questions:0,reviews:0});
  if(url.endsWith('/admin/facts')&&method==='POST'){
   const body=route.request().postDataJSON();
   expect(body.en).toBeTruthy();expect(body.fil).toBeTruthy();
   expect(body.sourceUrl).toMatch(/^https:/);
   recorded=true;return reply({id:101,status:'DRAFT'});
  }
  if(url.endsWith('/admin/facts'))return reply(recorded?[{...fact,status:submitted?'IN_REVIEW':'DRAFT'}]:[]);
  if(url.endsWith('/admin/questions'))return reply([]);
  if(url.endsWith('/admin/workflow/queue'))return reply([],403);
  if(url.includes('/admin/workflow/fact/101/submit')){submitted=true;return reply({id:101,status:'IN_REVIEW'});}
  return reply({},404);
 });
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 await page.getByRole('button',{name:/Facts & Content/}).click();
 await page.getByRole('button',{name:/Add fact/}).click();
 await page.getByRole('textbox',{name:'Canonical key'}).fill('editor-test-water');
 await page.getByRole('textbox',{name:'English fact'}).fill('Water freezes.');
 await page.getByRole('textbox',{name:'Filipino fact'}).fill('Nagyeyelo ang tubig.');
 await page.getByRole('textbox',{name:'Source title'}).fill('Synthetic source');
 await page.getByRole('textbox',{name:'HTTPS source URL'}).fill('https://example.org');
 await page.getByRole('button',{name:'Save draft'}).click();
 await expect(page.getByText('Fact draft saved')).toBeVisible();
 await page.getByRole('button',{name:'Submit'}).click();
 await expect(page.getByText('Fact sent for review')).toBeVisible();
 expect(recorded).toBe(true);expect(submitted).toBe(true);
});

test('reviewer sees review queue but cannot create content',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('alam-mo-ba-account-session',JSON.stringify({
  token:'t'.repeat(43),accountId:'ci-reviewer',expiresAt:'2099-01-01T00:00:00Z'
 })));
 await page.route('**/api/v1/admin/**',route=>{
  const url=route.request().url();
  const data=url.endsWith('/admin/me')?{accountId:'ci-reviewer',roles:['REVIEWER']}:
   url.endsWith('/admin/overview')?{facts:1,published:0,questions:0,reviews:1}:
   url.endsWith('/admin/workflow/queue')?[{type:'FACT',id:101,status:'IN_REVIEW'}]:[];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/admin');
 await page.getByRole('button',{name:/Review Queue/}).click();
 await expect(page.getByRole('button',{name:'Approve'})).toBeVisible();
 await page.getByRole('button',{name:/Facts & Content/}).click();
 await expect(page.getByRole('button',{name:/Add fact/})).toHaveCount(0);
});
