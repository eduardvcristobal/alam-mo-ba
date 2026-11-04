/** Explicit opt-in guest cloud backup. A guest bearer token is only a device-scoped capability. */
export type GuestProgress={
 mode:'student'|'explore'|null;lang:'en'|'fil';grade:string;subject:string;
 count:number;saved:number[];learned:number[];streak:number;last:string;
 attempts:{score:number;total:number;date:string;mode?:'student'|'explore';questionIds?:number[];wrongIds?:number[]}[];
};
export type GuestCloudState={version:number;state:GuestProgress};
const tokenKey='alam-mo-ba-guest-cloud-token';
const apiBase=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
export class GuestRateLimitError extends Error {
 constructor(public readonly retryAfterSeconds:number){super('Guest backup rate limit exceeded');this.name='GuestRateLimitError';}
}
function throwIfRateLimited(response:Response):void{
 if(response.status===429){
  const value=Number(response.headers.get('Retry-After'));
  throw new GuestRateLimitError(Number.isFinite(value)&&value>0?value:1);
 }
}
export const guestToken={
 get:()=>localStorage.getItem(tokenKey),
 set:(token:string)=>localStorage.setItem(tokenKey,token),
 clear:()=>localStorage.removeItem(tokenKey),
};
export async function createGuestSession():Promise<string>{
 const response=await fetch(apiBase+'/guest/sessions',{method:'POST'});
 throwIfRateLimited(response);
 if(!response.ok)throw new Error('Unable to open guest backup');
 const result=await response.json() as {token:string;expiresAt:string};
 if(!result.token)throw new Error('Missing guest backup token');
 guestToken.set(result.token);
 return result.token;
}
async function request(url:string,token:string,method:'GET'|'PUT'|'POST'='GET',body?:unknown):Promise<Response>{
 return fetch(apiBase+url,{
  method,
  headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  cache:'no-store',
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
export async function readGuestProgress(token:string):Promise<GuestCloudState>{
 const response=await request('/guest/progress',token);
 throwIfRateLimited(response);
 if(!response.ok)throw new Error('Guest backup unavailable: '+response.status);
 return response.json() as Promise<GuestCloudState>;
}
export class GuestConflictError extends Error {
 constructor(){super('Guest backup changed while saving');this.name='GuestConflictError';}
}
export async function saveGuestProgress(token:string,local:GuestProgress,maxRetries=2):Promise<GuestCloudState>{
 let source=local;
 for(let attempt=0;attempt<=maxRetries;attempt++){
  const remote=await readGuestProgress(token);
  source=mergeGuestProgress(source,remote.state);
  try{
   return await writeGuestProgress(token,remote.version,source);
  }catch(error){
   if(!(error instanceof GuestConflictError)||attempt===maxRetries)throw error;
  }
 }
 throw new GuestConflictError();
}
export async function writeGuestProgress(token:string,version:number,state:GuestProgress):Promise<GuestCloudState>{
 const response=await request('/guest/progress',token,'PUT',{expectedVersion:version,state});
 throwIfRateLimited(response);
 if(response.status===409)throw new GuestConflictError();
 if(!response.ok)throw new Error('Could not save progress: '+response.status);
 return response.json() as Promise<GuestCloudState>;
}
export async function revokeGuestSession(token:string):Promise<void>{
 const response=await request('/guest/sessions/revoke',token,'POST');
 if(!response.ok)throw new Error('Could not revoke guest backup: '+response.status);
 guestToken.clear();
}
function uniqueNumbers(a:number[],b:number[]):number[]{return Array.from(new Set([...a,...b])).slice(-10000);}
export function mergeGuestProgress(local:GuestProgress,remote:Partial<GuestProgress>):GuestProgress{
 const input=Array.isArray(remote.attempts)?remote.attempts:[];
 const attempts=[...input,...local.attempts];
 const keys=new Set<string>();
 const mergedAttempts=attempts.filter(a=>{
  const key=JSON.stringify([a.date,a.mode,a.score,a.total,a.questionIds||[],a.wrongIds||[]]);
  if(keys.has(key))return false;
  keys.add(key);
  return true;
 }).slice(-100);
 const remoteDate=typeof remote.last==='string'?remote.last:'';
 const newer=remoteDate>local.last;
 return {
  ...local,
  saved:uniqueNumbers(local.saved,Array.isArray(remote.saved)?remote.saved:[]),
  learned:uniqueNumbers(local.learned,Array.isArray(remote.learned)?remote.learned:[]),
  attempts:mergedAttempts,
  streak:newer?Math.max(0,remote.streak||0):local.streak,
  last:newer?remoteDate:local.last,
 };
}
