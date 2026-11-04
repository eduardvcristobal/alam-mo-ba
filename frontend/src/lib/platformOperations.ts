import {accountSession} from './accountSync';

const base=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'')+'/admin';
async function call<T>(path:string,method:'GET'|'POST'|'PUT'='GET',body?:unknown):Promise<T>{
 const session=accountSession.get();
 if(!session)throw new Error('Platform admin sign-in required');
 const response=await fetch(base+path,{method,cache:'no-store',
  headers:{Authorization:'Bearer '+session.token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new Error('Platform API HTTP '+response.status);
 return response.json() as Promise<T>;
}
export type Subject={code:string;en:string;fil:string;active:boolean;displayOrder:number};
export type Topic={id:number;subject:string;grade:number;en:string;fil:string;active:boolean};
export type Learner={id:string;status:'ACTIVE'|'DISABLED';createdAt:string};
export type Setting={key:string;value:boolean;updatedAt:string};
export type OperatorAudit={action:string;targetType:string;targetId:string;actorId:string;details:string;at:string};
export type Aggregate={subject?:string;status?:string;count:number};
export type Analytics={
 registeredAccounts:number;activeAccounts:number;disabledAccounts:number;
 guestBackups:number;recordedQuizAttempts:number;publishedFacts:number;publishedQuizQuestions:number;
 factsBySubject:Aggregate[];factsByStatus:Aggregate[];quizzesByStatus:Aggregate[];
};
export const operations={
 subjects:()=>call<Subject[]>('/curriculum/subjects'),
 topics:()=>call<Topic[]>('/curriculum/topics'),
 createSubject:(subject:Subject)=>call<{code:string}>('/curriculum/subjects','POST',subject),
 updateSubject:(subject:Subject)=>call<{code:string}>('/curriculum/subjects/'+encodeURIComponent(subject.code),'PUT',subject),
 createTopic:(topic:Omit<Topic,'id'>)=>call<{id:number}>('/curriculum/topics','POST',topic),
 updateTopic:(topic:Topic)=>call<{id:number}>('/curriculum/topics/'+topic.id,'PUT',topic),
 assignFactTopic:(factId:number,topicId:number)=>call<{id:number;topicId:number}>('/curriculum/facts/'+factId+'/topic','PUT',{topicId}),
 learners:()=>call<Learner[]>('/learners'),
 changeLearnerStatus:(id:string,status:'ACTIVE'|'DISABLED',reason:string)=>call<{id:string;status:string}>('/learners/'+encodeURIComponent(id)+'/status','PUT',{status,reason}),
 analytics:()=>call<Analytics>('/analytics'),
 settings:()=>call<Setting[]>('/platform/settings'),
 updateSetting:(key:string,value:boolean,reason:string)=>call<{key:string;value:boolean}>('/platform/settings/'+encodeURIComponent(key),'PUT',{value,reason}),
 operatorAudit:()=>call<OperatorAudit[]>('/platform/audit')
};
