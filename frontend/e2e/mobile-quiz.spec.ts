import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
});
test('320px mobile view has usable navigation and no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:320,height:720});
 await page.getByRole('button',{name:/Student Mode/}).click();
 await expect(page.locator('nav.bottom button')).toHaveCount(5);
 await page.getByRole('button',{name:/Learn/}).click();
 await expect(page.locator('.fact-item').first()).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 expect(overflow).toBe(false);
});
test('another question set prefers different samples; repeat preserves same question',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Trivia/}).click();
 await page.getByRole('spinbutton',{name:'Number of questions'}).fill('1');
 await page.getByRole('button',{name:'Start quiz'}).click();
 const first=await page.locator('.hex h2').innerText();
 await page.locator('.answer').first().click();
 await page.getByRole('button',{name:'Final answer'}).click();
 await page.getByRole('button',{name:'See results'}).click();
 await page.getByRole('button',{name:/Repeat the same questions/}).click();
 expect(await page.locator('.hex h2').innerText()).toBe(first);
 await page.locator('.answer').first().click();
 await page.getByRole('button',{name:'Final answer'}).click();
 await page.getByRole('button',{name:'See results'}).click();
 await page.getByRole('button',{name:/Try another question set/}).click();
 expect(await page.locator('.hex h2').innerText()).not.toBe(first);
});
test('one-use 50:50 removes wrong choices and preserves interaction',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Trivia/}).click();
 await page.getByRole('button',{name:'Start quiz'}).click();
 await expect(page.locator('.answer')).toHaveCount(3);
 await page.getByRole('button',{name:'50:50'}).click();
 await expect(page.locator('.answer')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'50:50'})).toBeDisabled();
 await page.locator('.answer').first().click();
 await expect(page.getByRole('button',{name:'Final answer'})).toBeEnabled();
});
test('completed quiz remains in guest progress after reload',async({page})=>{
 await page.getByRole('button',{name:/Explore Mode/}).click();
 await page.getByRole('button',{name:/Trivia/}).click();
 await page.getByRole('spinbutton',{name:'Number of questions'}).fill('1');
 await page.getByRole('button',{name:'Start quiz'}).click();
 await page.locator('.answer').first().click();
 await page.getByRole('button',{name:'Final answer'}).click();
 await page.getByRole('button',{name:'See results'}).click();
 await page.reload();
 await page.getByRole('button',{name:/Profile/}).click();
 await page.getByRole('button',{name:/Progress/}).click();
 await expect(page.getByText('Quizzes completed')).toBeVisible();
 await expect(page.locator('.history')).toHaveCount(1);
 const attempt=await page.evaluate(()=>JSON.parse(localStorage.getItem('alam-mo-ba-v2.1-react-guest')||'{}').attempts?.[0]);
 expect(attempt.questionIds).toHaveLength(1);
 expect(attempt.wrongIds).toBeDefined();
});
