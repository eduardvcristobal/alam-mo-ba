import {describe,expect,it} from 'vitest';
import {mergeGuestProgress} from './guestCloud';
import type {GuestProgress} from './guestCloud';
const local:GuestProgress={mode:'student',lang:'fil',grade:'7',subject:'Science',count:5,saved:[1,3],learned:[2],streak:3,last:'2026-11-04',attempts:[{score:1,total:2,date:'2026-11-04',mode:'student',questionIds:[1,2],wrongIds:[2]}]};
describe('guest progress merge',()=>{
 it('preserves saved and learned facts from both devices',()=>{
  const merged=mergeGuestProgress(local,{saved:[3,4],learned:[2,8]});
  expect(merged.saved).toEqual([1,3,4]);expect(merged.learned).toEqual([2,8]);
 });
 it('retains local settings and deduplicates attempts',()=>{
  const merged=mergeGuestProgress(local,{lang:'en',grade:'9',attempts:[local.attempts[0],{score:4,total:5,date:'2026-11-03'}]});
  expect(merged.lang).toBe('fil');expect(merged.grade).toBe('7');expect(merged.attempts).toHaveLength(2);
 });
 it('accepts a newer remote learning day',()=>{
  const merged=mergeGuestProgress(local,{last:'2026-11-05',streak:4});
  expect(merged.streak).toBe(4);expect(merged.last).toBe('2026-11-05');
 });
 it('does not roll back local streak to older remote state',()=>{
  const merged=mergeGuestProgress(local,{last:'2026-11-02',streak:50});
  expect(merged.last).toBe(local.last);expect(merged.streak).toBe(3);
 });
});
