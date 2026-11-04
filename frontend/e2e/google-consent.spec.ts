import {expect,test} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.reload();
});

test('account sign-in remains consent-disabled until explicitly opted in',async({page})=>{
 // CI enables the test-only GIS client for this suite. The consent checkbox stays unchecked.
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Profile/}).click();
 const optin=page.getByRole('checkbox',{name:/I am 18 or older/});
 await expect(optin).toBeVisible();
 await expect(page.getByRole('button',{name:'Prepare Google sign-in'})).toBeDisabled();
});

test('nonce-bound mocked provider credential flows to account sync without exposing guest ID',async({page})=>{
 let seenNonce='';
 let sentNonce='';
 let syncUploads=0;
 await page.evaluate(()=>{
  type SDK={accounts:{id:{initialize:(config:{nonce:string;callback:(v:{credential:string})=>void})=>void;renderButton:(target:HTMLElement)=>void;cancel:()=>void}}};
  let callback:(v:{credential:string})=>void=()=>{};
  const sdk:SDK={accounts:{id:{
   initialize(config){callback=config.callback;},
   renderButton(target){
    const b=document.createElement('button');b.textContent='Mock Google Identity sign-in';
    b.onclick=()=>callback({credential:'signed-test-id-token'});
    target.appendChild(b);
   },
   cancel(){}
  }}};
  Object.assign(window,{google:sdk});
 });
 await page.route('**/api/v1/account/google/challenge',async route=>{
  seenNonce='n'.repeat(43);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({nonce:seenNonce,expiresAt:'2099-01-01T00:00:00Z'})});
 });
 await page.route('**/api/v1/account/google',async route=>{
  const payload=route.request().postDataJSON();
  sentNonce=payload.nonce;
  expect(payload.idToken).toBe('signed-test-id-token');
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'s'.repeat(43),accountId:'ci-account',expiresAt:'2099-01-01T00:00:00Z'})});
 });
 await page.route('**/api/v1/account/progress',async route=>{
  if(route.request().method()==='GET')
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:0,state:{}})});
  syncUploads++;
  const state=route.request().postDataJSON().state;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,state})});
 });
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('checkbox',{name:/I am 18 or older/}).check();
 await page.getByRole('button',{name:'Prepare Google sign-in'}).click();
 await page.getByRole('button',{name:'Mock Google Identity sign-in'}).click();
 await expect(page.getByText('Signed in and progress synchronized.')).toBeVisible();
 expect(seenNonce).toHaveLength(43);
 expect(sentNonce).toEqual(seenNonce);
 expect(syncUploads).toBe(1);
 const account=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('alam-mo-ba-account-session')||'null'));
 expect(account.accountId).toBe('ci-account');
});
