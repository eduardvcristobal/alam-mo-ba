import {afterEach,describe,expect,it,vi} from 'vitest';
import {AccountConflictError,importGuestProgress,readAccountProgress,syncAccountProgress} from './accountSync';
import type {GuestProgress} from './guestCloud';
const local:GuestProgress={mode:'student',lang:'fil',grade:'7',subject:'Science',count:5,saved:[1,2],learned:[4],streak:2,last:'2026-11-04',attempts:[{score:1,total:2,date:'2026-11-04'}]};
const response=(status:number,data:unknown)=>({status,ok:status>=200&&status<300,json:async()=>data}) as Response;
afterEach(()=>vi.unstubAllGlobals());
describe('account synchronization',()=>{
 it('preserves progress from both devices on a 409 and retries',async()=>{
  let remote:GuestProgress={...local,saved:[2,5],learned:[8],attempts:[]};
  let version=0;let writes=0;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{
   if(options.method==='PUT'){
    writes++;
    const sent=JSON.parse(options.body as string);
    if(writes===1){version=1;remote={...remote,saved:[2,5,7]};return response(409,{});}
    expect(sent.expectedVersion).toBe(1);
    version=2;remote=sent.state;
    return response(200,{version,state:remote});
   }
   return response(200,{version,state:remote});
  }));
  const saved=await syncAccountProgress('account-session',local);
  expect(writes).toBe(2);
  expect(saved.state.saved).toEqual([1,2,5,7]);
  expect(saved.state.learned).toEqual([4,8]);
  expect(saved.state.attempts).toHaveLength(1);
 });
 it('rejects recurring concurrent updates rather than overwriting',async()=>{
  const f=vi.fn(async(_url:string,options:RequestInit)=>options.method==='PUT'?response(409,{}):response(200,{version:1,state:local}));
  vi.stubGlobal('fetch',f);
  await expect(syncAccountProgress('token',local,1)).rejects.toBeInstanceOf(AccountConflictError);
  expect(f).toHaveBeenCalledTimes(4);
 });
 it('never silently retries unauthorized account sessions',async()=>{
  const f=vi.fn(async()=>response(401,{}));vi.stubGlobal('fetch',f);
  await expect(readAccountProgress('invalid')).rejects.toThrow(/401/);
  expect(f).toHaveBeenCalledTimes(1);
 });
 it('requires a guest capability to import',async()=>{
  vi.stubGlobal('fetch',vi.fn());
  await expect(importGuestProgress('account-token','invalid')).rejects.toThrow(/guest backup token/i);
  expect(fetch).not.toHaveBeenCalled();
 });
});
