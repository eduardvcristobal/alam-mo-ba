import {accountSession} from './accountSync';

const base=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/admin';

export type AdminRole='SUPER_ADMIN'|'CONTENT_ADMIN'|'EDITOR'|'REVIEWER'|'SUPPORT';
export type AdminOperator={id:string;roles:AdminRole[]};
export type AdminStats={
 facts:number;publishedFacts:number;pendingFacts:number;
 quizzes:number;pendingQuizzes:number;publishedQuizzes:number;
};
export type FactRow={id:number;key:string;subject:string;emoji:string;status:string;verified:boolean;createdAt:string};
export type FactDraft={key:string;subject:string;emoji:string;en:string;fil:string;explore:boolean;grades:number[];sourceTitle:string;sourceUrl:string};
export type ChoiceDraft={en:string;fil:string;correct:boolean};
export type QuizDraft={factId:number;en:string;fil:string;explanationEn:string;explanationFil:string;choices:ChoiceDraft[]};
export type QuizRow={id:number;factId:number;status:string;prompt:string};
export type QueueRow={id:number;label:string;status:string};
export type AdminAudit={type:string;id:number;action:string;actorId:string;from:string|null;to:string|null;at:string;note:string|null};

async function call<T>(path:string,method:'GET'|'POST'|'PUT'='GET',body?:unknown):Promise<T>{
 const session=accountSession.get();
 if(!session)throw new Error('Sign in with a provisioned admin account before accessing the platform');
 const response=await fetch(base+path,{
  method,cache:'no-store',
  headers:{Authorization:'Bearer '+session.token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok)throw new Error('Admin API HTTP '+response.status);
 return response.json() as Promise<T>;
}
export const platformAdmin={
 me:()=>call<AdminOperator>('/me'),
 dashboard:()=>call<AdminStats>('/dashboard'),
 facts:()=>call<FactRow[]>('/facts'),
 fact:(id:number)=>call<Record<string,unknown>>('/facts/'+id),
 createFact:(fact:FactDraft)=>call<{id:number;status:string}>('/facts','POST',fact),
 updateFact:(id:number,fact:FactDraft)=>call<{id:number;status:string}>('/facts/'+id,'PUT',fact),
 quizzes:()=>call<QuizRow[]>('/quizzes'),
 createQuiz:(quiz:QuizDraft)=>call<{id:number;status:string}>('/quizzes','POST',quiz),
 updateQuiz:(id:number,quiz:QuizDraft)=>call<{id:number;status:string}>('/quizzes/'+id,'PUT',quiz),
 queue:()=>call<{facts:QueueRow[];quizzes:QueueRow[]}>('/review/queue'),
 audit:()=>call<AdminAudit[]>('/review/audit'),
 decide:(type:'facts'|'quizzes',id:number,action:'submit'|'approve'|'reject'|'publish'|'retire',sourceChecked=false,note='')=>
  call<{id:number;status:string}>('/review/'+type+'/'+id,'POST',{action,sourceChecked,note})
};
