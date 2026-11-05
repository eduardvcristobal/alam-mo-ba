import {mergeGuestProgress} from './guestCloud';
import type {GuestProgress,GuestCloudState} from './guestCloud';

/**
 * Opaque account sessions are intentionally scoped to one browser tab session.
 * The caller must first obtain a Google ID token with a server-issued nonce;
 * this client NEVER accepts a self-asserted account ID or email.
 */
const api=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
const key='alam-mo-ba-account-session';
export type AccountSession={token:string;accountId:string;expiresAt:string};
export const accountSession={
 get():AccountSession|null{
  try{
   const raw=sessionStorage.getItem(key);
   if(!raw)return null;
   const v=JSON.parse(raw) as AccountSession;
   if(!v.token || new Date(v.expiresAt).getTime()<=Date.now()){sessionStorage.removeItem(key);return null;}
   return v;
  }catch{return null;}
 },
 set(value:AccountSession){sessionStorage.setItem(key,JSON.stringify(value));},
 clear(){sessionStorage.removeItem(key);}
};

async function parsed<T>(path:string,init:RequestInit={},token?:string):Promise<T>{
 const response=await fetch(api+path,{
  ...init,cache:'no-store',
  headers:{...(init.body?{'Content-Type':'application/json'}:{}),
           ...(token?{Authorization:'Bearer '+token}:{}),...init.headers}
 });
 if(response.status===409)throw new AccountConflictError();
 if(!response.ok)throw new Error('Account API returned HTTP '+response.status);
 return response.json() as Promise<T>;
}
export class AccountConflictError extends Error{
 constructor(){super('Account progress was updated concurrently');this.name='AccountConflictError';}
}
export async function requestGoogleChallenge():Promise<{nonce:string;expiresAt:string}>{
 return parsed('/account/google/challenge',{method:'POST'});
}
export async function verifyGoogleIdToken(idToken:string,nonce:string):Promise<AccountSession>{
 const session=await parsed<AccountSession>('/account/google',{
  method:'POST',body:JSON.stringify({idToken,nonce})
 });
 accountSession.set(session);
 return session;
}
export async function accountMe(token:string):Promise<{accountId:string}>{
 return parsed('/account/me',{},token);
}
export async function readAccountProgress(token:string):Promise<GuestCloudState>{
 return parsed('/account/progress',{},token);
}
export async function updateAccountProgress(token:string,version:number,state:GuestProgress):Promise<GuestCloudState>{
 return parsed('/account/progress',{
  method:'PUT',body:JSON.stringify({expectedVersion:version,state})
 },token);
}
export async function importGuestProgress(token:string,guestToken:string):Promise<GuestCloudState>{
 if(!guestToken || !/^[A-Za-z0-9_-]{43}$/.test(guestToken))throw new Error('A valid guest backup token is required');
 return parsed('/account/import-guest',{method:'POST',body:JSON.stringify({guestToken})},token);
}
export async function syncAccountProgress(token:string,local:GuestProgress,maxRetries=2):Promise<GuestCloudState>{
 let pending=local;
 for(let i=0;i<=maxRetries;i++){
  const remote=await readAccountProgress(token);
  pending=mergeGuestProgress(pending,remote.state);
  try{return await updateAccountProgress(token,remote.version,pending);}
  catch(error){if(!(error instanceof AccountConflictError)||i===maxRetries)throw error;}
 }
 throw new AccountConflictError();
}
export async function logoutAccount(token:string):Promise<void>{
 try{
  await fetch(api+'/account/logout',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store'});
 }finally{
  accountSession.clear();
 }
}
