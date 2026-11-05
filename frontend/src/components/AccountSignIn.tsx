import {useState} from 'react';
import {accountSession,logoutAccount,verifyGoogleIdToken,requestGoogleChallenge} from '../lib/accountSync';

type GoogleIdentity={accounts:{id:{initialize:(input:{client_id:string;nonce:string;auto_select:boolean;callback:(value:{credential:string})=>void})=>void;renderButton:(target:HTMLElement,options:{theme:string;size:string;text:string})=>void}}};
type GoogleWindow=Window&{google?:GoogleIdentity};
const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID||import.meta.env.VITE_ADMIN_GOOGLE_CLIENT_ID||'';
const enabled=Boolean(clientId);

async function loadGoogle():Promise<GoogleIdentity>{
 const existing=(window as GoogleWindow).google;if(existing)return existing;
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{const sdk=(window as GoogleWindow).google;sdk?resolve(sdk):reject(new Error('Google sign-in unavailable'));};
  script.onerror=()=>reject(new Error('Could not load Google sign-in'));document.head.appendChild(script);
 });
}

export default function AccountSignIn(){
 const [accountId,setAccountId]=useState(accountSession.get()?.accountId||'');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [target,setTarget]=useState<HTMLDivElement|null>(null);
 const start=async()=>{
  if(busy||!target)return;setBusy(true);setError('');
  try{
   const challenge=await requestGoogleChallenge();const sdk=await loadGoogle();
   sdk.accounts.id.initialize({client_id:clientId,nonce:challenge.nonce,auto_select:false,
    callback:value=>{void verify(value.credential,challenge.nonce);}});
   target.replaceChildren();sdk.accounts.id.renderButton(target,{theme:'outline',size:'large',text:'signin_with'});
  }catch(e){setError(e instanceof Error?e.message:'Google sign-in unavailable');}
  finally{setBusy(false);}
 };
 const verify=async(credential:string,nonce:string)=>{
  setBusy(true);setError('');
  try{const session=await verifyGoogleIdToken(credential,nonce);setAccountId(session.accountId);}
  catch(e){setError(e instanceof Error?e.message:'Google sign-in failed');}
  finally{setBusy(false);}
 };
 const signOut=async()=>{const token=accountSession.get()?.token;try{if(token)await logoutAccount(token);}catch(e){setError(e instanceof Error?e.message:'Could not confirm sign-out');}finally{setAccountId('');}};
 if(accountId)return <section className="panel settings" aria-label="Google account">
  <h3>Google account connected</h3><p>Account ID: <code>{accountId}</code></p>
  <button type="button" onClick={()=>void signOut()}>Sign out</button>
 </section>;
 return <section className="panel settings" aria-label="Google account sign-in">
  <h3>Sign in with Google</h3>
  {enabled?<><p>Sign in to create or access your learner account. A platform role must be granted separately by a super-admin.</p>
   <button type="button" disabled={busy} onClick={()=>void start()}>{busy?'Preparing sign-in…':'Continue with Google'}</button>
   <div ref={setTarget} aria-label="Google sign-in button"/>
  </>:<><button type="button" disabled>Google sign-in unavailable</button><p role="status">Configure `VITE_GOOGLE_CLIENT_ID` in the frontend to enable Google sign-in.</p></>}
  {error&&<p role="alert" className="admin-error">{error}</p>}
 </section>;
}
