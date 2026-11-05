import {accountSession} from '../lib/accountSync';

const BASE=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/admin';
export type Role='SUPER_ADMIN'|'CONTENT_ADMIN'|'EDITOR'|'REVIEWER'|'SUPPORT';
export type FactStatus='DRAFT'|'IN_REVIEW'|'APPROVED'|'PUBLISHED'|'RETIRED';
export type AdminMe={accountId:string;roles:Role[]};
export type Overview={facts:number;published:number;questions:number;reviews:number};
export type Fact={id:number;key:string;subject:string;emoji:string|null;status:FactStatus;en:string|null;fil:string|null;sourceUrl:string|null;sourceTitle:string|null;student:boolean;grade:number|null;explore:boolean};
export type FactDraft={key:string;subject:string;emoji:string;en:string;fil:string;student:boolean;grade:number|null;explore:boolean;sourceTitle:string;sourceUrl:string};
export type QuizOption={en:string;fil:string;correct:boolean};
export type QuestionDraft={factId:number;en:string;fil:string;explanationEn:string;explanationFil:string;options:QuizOption[]};
export type QuestionSummary={id:number;factId:number;status:FactStatus;prompt:string};
export type QueueEntry={type:'FACT'|'QUESTION';id:number;status:FactStatus};
export type ManagedAccount={accountId:string;status:'ACTIVE'|'DISABLED';createdAt:string;roles:Role[]};
export type ManagedRole=Role;
type Transition='submit'|'approve'|'reject'|'publish'|'retire';
const session=()=>accountSession.get()?.token||'';
export async function adminRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const token=session();
 if(!token)throw new Error('An authenticated account session is required');
 const response=await fetch(BASE+path,{
  ...init,cache:'no-store',
  headers:{Authorization:'Bearer '+token,
    ...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}
 });
 if(!response.ok){
  if(response.status===401)throw new Error('Account session expired. Sign in again.');
  if(response.status===403)throw new Error('Your account is not authorized for this operation.');
  const body=await response.text().catch(()=>'');
  throw new Error('Admin API HTTP '+response.status+(body?': '+body.slice(0,180):''));
 }
 return response.json() as Promise<T>;
}
const json=(method:'POST'|'PUT',data:unknown):RequestInit=>({method,body:JSON.stringify(data)});
export const adminApi={
 me:()=>adminRequest<AdminMe>('/me'),
 overview:()=>adminRequest<Overview>('/overview'),
 facts:()=>adminRequest<Fact[]>('/facts'),
 questions:()=>adminRequest<QuestionSummary[]>('/questions'),
 question:(id:number)=>adminRequest<Record<string,unknown>>('/questions/'+id),
 queue:()=>adminRequest<QueueEntry[]>('/workflow/queue'),
 roleAccounts:()=>adminRequest<ManagedAccount[]>('/roles/accounts'),
 changeRole:(data:{accountId:string;role:ManagedRole;action:'GRANT'|'REVOKE';reason:string})=>
  adminRequest<{accountId:string;role:ManagedRole;action:'GRANT'|'REVOKE';changed:boolean}>('/roles/change',json('POST',data)),
 createFact:(data:FactDraft)=>adminRequest<{id:number;status:FactStatus}>('/facts',json('POST',data)),
 updateFact:(id:number,data:FactDraft)=>adminRequest<{id:number;status:FactStatus}>('/facts/'+id,json('PUT',data)),
 deleteFact:(id:number)=>adminRequest<{id:number;deleted:boolean}>('/facts/'+id,{method:'DELETE'}),
 createQuestion:(data:QuestionDraft)=>adminRequest<{id:number;status:FactStatus}>('/questions',json('POST',data)),
 updateQuestion:(id:number,data:QuestionDraft)=>adminRequest<{id:number;status:FactStatus}>('/questions/'+id,json('PUT',data)),
 deleteQuestion:(id:number)=>adminRequest<{id:number;deleted:boolean}>('/questions/'+id,{method:'DELETE'}),
 transition:(type:'fact'|'question',id:number,action:Transition)=>
  adminRequest<{id:number;status:FactStatus}>(`/workflow/${type}/${id}/${action}`,{method:'POST'})
};
