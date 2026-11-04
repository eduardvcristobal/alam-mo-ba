import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
});
test('guest learning remains available before enabling any cloud backup',async({page})=>{
 let backupRequests=0;
 await page.route('**/api/v1/guest/**',async route=>{backupRequests++;return route.fulfill({status:404});});
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await expect(page.getByText('Fact of the Day')).toBeVisible();
 await page.locator('.hero').getByRole('button',{name:/Save/}).click();
 await page.waitForTimeout(650);
 expect(backupRequests).toBe(0);
 await page.getByRole('button',{name:/Profile/}).click();
 await expect(page.getByRole('button',{name:'Enable guest backup'})).toBeVisible();
 const token=await page.evaluate(()=>localStorage.getItem('alam-mo-ba-guest-cloud-token'));
 expect(token).toBeNull();
});
test('opt-in backup, restore and revocation do not erase local progress',async({page})=>{
 let version=0;
 let remote:Record<string,unknown>={};
 let revoked=false;
 const token='T'.repeat(43);
 await page.route('**/api/v1/guest/**',async route=>{
  const request=route.request();
  const path=new URL(request.url()).pathname;
  const auth=request.headers()['authorization'];
  if(path.endsWith('/sessions')&&request.method()==='POST'){
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token,expiresAt:'2099-01-01T00:00:00Z'})});
  }
  if(auth!=='Bearer '+token||revoked) return route.fulfill({status:401});
  if(path.endsWith('/sessions/revoke')&&request.method()==='POST'){
   revoked=true;return route.fulfill({status:204,body:''});
  }
  if(path.endsWith('/progress')&&request.method()==='GET'){
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version,state:remote})});
  }
  if(path.endsWith('/progress')&&request.method()==='PUT'){
   const body=request.postDataJSON();
   if(body.expectedVersion!==version)return route.fulfill({status:409});
   version++;remote=body.state;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version,state:remote})});
  }
  return route.fulfill({status:404});
 });
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.locator('.hero').getByRole('button',{name:/Save/}).click();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('button',{name:'Enable guest backup'}).click();
 await expect(page.getByText(/Progress safely backed up/)).toBeVisible();
 expect(version).toBe(1);
 expect((remote.saved as number[]).length).toBe(1);
 await page.getByRole('button',{name:'Home'}).click();
 await page.getByRole('button',{name:/Preview another fact/}).click();
 await page.locator('.hero').getByRole('button',{name:/Save/}).click();
 await expect.poll(()=>version).toBe(2);
 await page.getByRole('button',{name:'Profile'}).click();
 await expect(page.getByText(/Progress saved automatically/)).toBeVisible();
 expect((remote.saved as number[]).length).toBe(2);
 await page.getByRole('button',{name:'Restore/merge backup'}).click();
 await expect(page.getByText(/Cloud progress merged/)).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Revoke guest backup'}).click();
 await expect(page.getByText(/Backup access revoked/)).toBeVisible();
 expect(revoked).toBe(true);
 const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('alam-mo-ba-v2.1-react-guest')||'{}'));
 expect(prefs.saved).toHaveLength(2);
 expect(await page.evaluate(()=>localStorage.getItem('alam-mo-ba-guest-cloud-token'))).toBeNull();
});
test('expired guest session is cleared and can be enabled again',async({page})=>{
 const token='E'.repeat(43);
 await page.route('**/api/v1/guest/**',async route=>{
  if(route.request().url().endsWith('/guest/sessions'))
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token,expiresAt:'2099-01-01T00:00:00Z'})});
  return route.fulfill({status:401});
 });
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('button',{name:'Enable guest backup'}).click();
 await expect(page.getByText(/backup session expired/i)).toBeVisible();
 await expect(page.getByRole('button',{name:'Enable guest backup'})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('alam-mo-ba-guest-cloud-token'))).toBeNull();
});
