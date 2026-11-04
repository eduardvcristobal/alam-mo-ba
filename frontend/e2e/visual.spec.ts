import {test,expect} from '@playwright/test';

test('approved blue/yellow student mobile reference',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 await page.getByRole('button',{name:/Student Mode/}).click();
 const hero=page.locator('.hero');
 await expect(hero).toBeVisible();
 await expect(hero).toHaveCSS('background-color','rgb(0, 56, 168)');
 await expect(page.locator('nav.bottom button')).toHaveCount(5);
 await page.screenshot({path:testInfo.outputPath('student-home-390px.png'),fullPage:true});
});
test('wide browser keeps readable mobile-first content column',async({page},testInfo)=>{
 await page.setViewportSize({width:1280,height:800});
 await page.goto('/');
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 await page.getByRole('button',{name:/Explore Mode/}).click();
 const appWidth=await page.locator('.app').evaluate(el=>el.getBoundingClientRect().width);
 expect(appWidth).toBeLessThanOrEqual(490);
 await page.screenshot({path:testInfo.outputPath('explore-home-desktop.png'),fullPage:true});
});
