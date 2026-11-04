import {afterEach,describe,expect,it,vi} from 'vitest';
import {GuestConflictError,saveGuestProgress} from './guestCloud';
import type {GuestProgress} from './guestCloud';

const local:GuestProgress={mode:'student',lang:'fil',grade:'7',subject:'Science',count:5,saved:[1],learned:[2],streak:1,last:'2026-11-04',attempts:[]};
function response(status:number,payload:unknown){
 return {status,ok:status>=200&&status<300,json:async()=>payload} as Response;
}
afterEach(()=>vi.unstubAllGlobals());
describe('optimistic guest backup synchronization',()=>{
 it('re-reads and merges after a concurrent 409, preserving both sets of facts',async()=>{
  const sent:{expectedVersion:number;state:GuestProgress}[]=[];
  let remote={version:1,state:{...local,saved:[3],learned:[4]}};
  let conflicted=false;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,opts:{method?:string;body?:string})=>{
   if(opts?.method==='PUT'){
    const incoming=JSON.parse(opts.body!) as {expectedVersion:number;state:GuestProgress};
    sent.push(incoming);
    if(!conflicted){
     conflicted=true;
     remote={version:2,state:{...local,saved:[3,5],learned:[4,6]}};
     return response(409,{});
    }
    expect(incoming.expectedVersion).toBe(2);
    remote={version:3,state:incoming.state};
    return response(200,remote);
   }
   return response(200,remote);
  }));
  const saved=await saveGuestProgress('token',local);
  expect(saved.version).toBe(3);
  expect(saved.state.saved).toEqual([1,3,5]);
  expect(saved.state.learned).toEqual([2,4,6]);
  expect(sent).toHaveLength(2);
 });
 it('refuses to loop forever when a competing writer wins each time',async()=>{
  const request=vi.fn(async(_url:string,opts:{method?:string})=>
   opts?.method==='PUT'?response(409,{}):response(200,{version:1,state:local}));
  vi.stubGlobal('fetch',request);
  await expect(saveGuestProgress('token',local,1)).rejects.toBeInstanceOf(GuestConflictError);
  expect(request).toHaveBeenCalledTimes(4);
 });
 it('does not retry unauthorized writes or swallow authentication failures',async()=>{
  const request=vi.fn(async(_url:string,opts:{method?:string})=>
   opts?.method==='PUT'?response(401,{}):response(200,{version:0,state:local}));
  vi.stubGlobal('fetch',request);
  await expect(saveGuestProgress('token',local)).rejects.toThrow(/401/);
  expect(request).toHaveBeenCalledTimes(2);
 });
});
