import {test,expect} from '@playwright/test';

const fact={id:917,key:'ci-verified',subject:'Science',emoji:'🔬',translations:{en:'Verified science content for CI',fil:'Beripikadong kaalaman para sa CI'},grades:[7],audiences:['EXPLORE','STUDENT']};
const questions={items:[],total:0,limit:100,offset:0};

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.clear());
 await page.route('**/api/v1/content/facts?**',async route=>{
  const u=new URL(route.request().url());
  const grade=u.searchParams.get('grade');
  const items=grade==='8'?[]:[fact];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items,total:items.length,limit:100,offset:0})});
 });
 await page.route('**/api/v1/content/questions?**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(questions)}));
 await page.route('**/api/v1/content/facts/917',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fact)}));
 await page.reload();
});

test('published content takes precedence over sample facts and can be saved',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await expect(page.getByText('Verified Fact of the Day')).toBeVisible();
 await expect(page.getByText('Verified science content for CI').first()).toBeVisible();
 await page.locator('.hero').getByRole('button',{name:/Save/}).click();
 await page.getByRole('button',{name:/Saved/}).click();
 await expect(page.getByText('Verified science content for CI').first()).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:/Saved/}).click();
 await expect(page.getByText('Verified science content for CI').first()).toBeVisible();
});
test('verified content respects student grade filtering',async({page})=>{
 await page.getByRole('button',{name:/Student Mode/}).click();
 await expect(page.getByText('Verified Fact of the Day')).toBeVisible();
 await page.getByRole('combobox',{name:'Grade'}).selectOption('8');
 await expect(page.getByText('Verified Fact of the Day')).toHaveCount(0);
 await page.getByRole('combobox',{name:'Grade'}).selectOption('7');
 await expect(page.getByText('Verified Fact of the Day')).toBeVisible();
});
test('Learn searches published and sample facts separately',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Discover/}).click();
 await expect(page.getByRole('heading',{name:'Verified facts'})).toBeVisible();
 await expect(page.getByText('Verified science content for CI').first()).toBeVisible();
 await page.getByRole('textbox',{name:'Search facts'}).fill('Verified science');
 await expect(page.getByText('Verified science content for CI').first()).toBeVisible();
 await expect(page.getByText('No sample facts match your search.')).toBeVisible();
});
test('offline content shows sample fallback and retry can recover',async({page})=>{
 let failed=true;
 await page.unroute('**/api/v1/content/facts?**');
 await page.route('**/api/v1/content/facts?**',async route=>{
  if(failed){await route.abort('failed');return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[fact],total:1,limit:100,offset:0})});
 });
 await page.reload();
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await expect(page.getByText('Sample · API unavailable · unverified')).toBeVisible();
 failed=false;
 await page.getByRole('button',{name:'Retry content connection'}).click();
 await expect(page.getByText('Verified Fact of the Day')).toBeVisible();
});
test('connected API with no matching facts explains the empty state',async({page})=>{
 await page.getByRole('button',{name:/Student Mode/}).click();
 await page.getByRole('combobox',{name:'Grade'}).selectOption('8');
 await page.getByRole('button',{name:/Learn/}).click();
 await expect(page.getByText('No verified facts match these filters yet.',{exact:true}).first()).toBeVisible();
});
test('keyboard access to guest mode and quiz answer',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).focus();
 await page.keyboard.press('Enter');
 await page.getByRole('button',{name:/Trivia/}).click();
 await page.getByRole('button',{name:'Start quiz'}).click();
 const answer=page.locator('.answer').first();
 await answer.focus();
 await page.keyboard.press('Space');
 await expect(answer).toHaveClass(/picked/);
});
