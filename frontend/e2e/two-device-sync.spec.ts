import {expect,test} from '@playwright/test';
import type {BrowserContext,Page} from '@playwright/test';

type Progress={mode:'explore';lang:'en';grade:string;subject:string;count:number;saved:number[];learned:number[];streak:number;last:string;attempts:unknown[]};
const account={token:'s'.repeat(43),accountId:'ci-two-device',expiresAt:'2099-01-01T00:00:00Z'};

test('two independent browser contexts merge bookmarks instead of overwriting each other',async({browser})=>{
 let version=0;
 let remote:Progress|Record<string,never>={};
 const make=async():Promise<{context:BrowserContext;page:Page}>=>{
  const context=await browser.newContext();
  await context.addInitScript((auth)=>{
   sessionStorage.setItem('alam-mo-ba-account-session',JSON.stringify(auth));
  },account);
  const page=await context.newPage();
  await page.route('**/api/v1/account/progress',async route=>{
   if(route.request().method()==='GET'){
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version,state:remote})});
   }
   const input=route.request().postDataJSON();
   if(input.expectedVersion!==version)return route.fulfill({status:409,contentType:'application/json',body:'{}'});
   remote=input.state;version++;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version,state:remote})});
  });
  await page.goto('/');
  await page.getByRole('button',{name:/Explore Mode/}).click();
  return {context,page};
 };
 const a=await make();
 const b=await make();
 try{
  await a.page.locator('.hero').getByRole('button',{name:/Save/}).click();
  await a.page.getByRole('button',{name:/Profile/}).click();
  await a.page.getByRole('button',{name:'Sync progress now'}).click();
  await expect(a.page.getByText('Account progress synchronized.')).toBeVisible();
  expect((remote as Progress).saved).toHaveLength(1);
  const first=(remote as Progress).saved[0];

  await b.page.getByRole('button',{name:/Discover/}).click();
  await b.page.locator('.fact-item').nth(1).getByRole('button',{name:/Save/}).click();
  await b.page.getByRole('button',{name:/Profile/}).click();
  await b.page.getByRole('button',{name:'Sync progress now'}).click();
  await expect(b.page.getByText('Account progress synchronized.')).toBeVisible();
  const saved=(remote as Progress).saved;
  expect(saved).toHaveLength(2);
  expect(saved).toContain(first);

  await a.page.getByRole('button',{name:'Sync progress now'}).click();
  await expect.poll(async()=>a.page.evaluate(
   ()=>JSON.parse(localStorage.getItem('alam-mo-ba-v2.1-react-guest')||'{}').saved?.length
  )).toBe(2);
 }finally{await a.context.close();await b.context.close();}
});
