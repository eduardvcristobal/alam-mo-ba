import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();});
test('guest may explore without creating an account',async({page})=>{
 await expect(page.getByRole('heading',{name:'Alam Mo Ba?'})).toBeVisible();
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await expect(page.getByText('🌍 Explore Mode')).toBeVisible();
 await expect(page.getByText('Fact of the Day')).toBeVisible();
 await page.getByRole('button',{name:/Discover/}).click();
 await expect(page.getByRole('heading',{name:'Discover more'})).toBeVisible();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('button',{name:/Switch learning mode/}).click();
 await expect(page.getByText('🎓 Student Mode')).toBeVisible();
});
test('student can select all grades, save and view progress',async({page})=>{
 await page.getByRole('button',{name:/Student Mode/}).click();
 await page.getByRole('combobox',{name:'Grade'}).selectOption('all');
 await page.getByRole('button',{name:/Learn/}).click();
 await expect(page.locator('.fact-item').first()).toBeVisible();
 await page.locator('.fact-item .actions button').filter({hasText:/Save/}).first().click();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('button',{name:/Saved: 1/}).click();
 await expect(page.locator('.fact-item')).toHaveCount(1);
});
test('configurable quiz supports complete, repeat, and new set',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Trivia/}).click();
 await page.getByRole('spinbutton',{name:'Number of questions'}).fill('2');
 await page.getByRole('button',{name:'Start quiz'}).click();
 for(let i=0;i<2;i++){
   await expect(page.getByText(new RegExp('Question '+(i+1)+' / 2'))).toBeVisible();
   await page.locator('.answer').first().click();
   await page.getByRole('button',{name:'Final answer'}).click();
   await expect(page.getByText(/Correct!|Not quite/)).toBeVisible();
   await page.getByRole('button',{name:i===1?'See results':'Next question'}).click();
 }
 await expect(page.getByRole('heading',{name:'Quiz complete!'})).toBeVisible();
 await page.getByRole('button',{name:/Repeat the same questions/}).click();
 await expect(page.getByText(/Question 1 \/ 2/)).toBeVisible();
});
