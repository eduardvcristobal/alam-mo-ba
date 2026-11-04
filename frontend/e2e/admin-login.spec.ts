import {expect,test} from '@playwright/test';

test('pre-provisioned administrator uses nonce-bound Google login to access dashboard',async({page})=>{
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Alam Mo Ba? Admin'})).toBeVisible();
 await page.evaluate(()=>{
  let onCredential:(credential:{credential:string})=>void=()=>{};
  Object.assign(window,{google:{accounts:{id:{
   initialize:(data:{callback:(credential:{credential:string})=>void})=>void)=>{onCredential=data.callback;},
   renderButton:(element:HTMLElement)=>{
    const button=document.createElement('button');
    button.textContent='Mock Google admin';
    button.onclick=()=>onCredential({credential:'signed-admin-ci-token'});
    element.appendChild(button);
   }
  }}}});
 });
 const nonce='n'.repeat(43);
 await page.route('**/api/v1/admin/auth/challenge',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({nonce,expiresAt:'2099-01-01T00:00:00Z'})
 }));
 await page.route('**/api/v1/admin/auth/google',route=>{
  const data=route.request().postDataJSON();
  expect(data.nonce).toBe(nonce);expect(data.idToken).toBe('signed-admin-ci-token');
  return route.fulfill({status:200,contentType:'application/json',
   body:JSON.stringify({token:'a'.repeat(43),accountId:'admin-ci',expiresAt:'2099-01-01T00:00:00Z'})});
 });
 await page.route('**/api/v1/admin/**',route=>{
  const url=route.request().url();
  if(url.includes('/admin/auth/'))return route.fallback();
  const data=url.endsWith('/admin/me')?{accountId:'admin-ci',roles:['CONTENT_ADMIN']}:
   url.endsWith('/admin/overview')?{facts:2,published:1,questions:1,reviews:0}:[];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.getByRole('button',{name:'Prepare secure Google sign-in'}).click();
 await page.getByRole('button',{name:'Mock Google admin'}).click();
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 await expect(page.getByText('Platform Administration')).toBeVisible();
 const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('alam-mo-ba-account-session')||'null'));
 expect(saved.accountId).toBe('admin-ci');
});
