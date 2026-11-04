/** Public content API. Correct-answer flags are never returned. */
export type ApiFact={id:number;key:string;subject:string;emoji:string|null;translations:Record<string,string>;grades:number[];audiences:string[]};
export type ApiQuestion={id:number;factId:number;translations:Record<string,{prompt:string}>;options:{id:number;position:number;translations:Record<string,string>}[]};
export type Page<T>={items:T[];total:number;limit:number;offset:number};
export type ContentFilter={mode:'student'|'explore';grade?:number;subject?:string;limit?:number;offset?:number};
const base=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
function params(f:ContentFilter){const p=new URLSearchParams({mode:f.mode,limit:String(f.limit??20),offset:String(f.offset??0)});if(f.grade!==undefined)p.set('grade',String(f.grade));if(f.subject)p.set('subject',f.subject);return p;}
async function read<T>(path:string,signal?:AbortSignal):Promise<T>{const r=await fetch(base+path,{signal});if(!r.ok)throw new Error('Content API HTTP '+r.status);return await r.json() as T;}
export type SubmittedAnswer={questionId:number;optionId:number};
export type QuizResult={score:number;total:number;answers:{questionId:number;correct:boolean;correctOptionId:number;explanations:Record<string,string>}[]};
export type QuizSubmission={mode:'student'|'explore';grade?:number;subject?:string;answers:SubmittedAnswer[]};
export async function submitQuiz(payload:QuizSubmission,signal?:AbortSignal):Promise<QuizResult>{
 const response=await fetch(base+'/quiz/submit',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal
 });
 if(!response.ok)throw new Error('Quiz API HTTP '+response.status);
 return await response.json() as QuizResult;
}
export const contentApi={
  facts:(f:ContentFilter,signal?:AbortSignal)=>read<Page<ApiFact>>('/content/facts?'+params(f),signal),
  questions:(f:ContentFilter,signal?:AbortSignal)=>read<Page<ApiQuestion>>('/content/questions?'+params(f),signal),
  fact:(id:number,signal?:AbortSignal)=>read<ApiFact>('/content/facts/'+id,signal),
  submitQuiz
};
