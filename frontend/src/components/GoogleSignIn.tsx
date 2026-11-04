import {useRef,useState} from 'react';
import {accountSession,requestGoogleChallenge,verifyGoogleIdToken,syncAccountProgress,importGuestProgress,logoutAccount} from '../lib/accountSync';
import {guestToken} from '../lib/guestCloud';
import type {GuestProgress} from '../lib/guestCloud';

type GoogleSDK={accounts:{id:{
 initialize:(args:{client_id:string;nonce:string;callback:(credential:{credential:string})=>void;auto_select:boolean})=>void;
 renderButton:(target:HTMLElement,options:{theme:string;size:string;text:string})=>void;
 cancel:()=>void;
}}};
type GoogleWindow=Window&{google?:GoogleSDK};
const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID||'';
const enabled=import.meta.env.VITE_ACCOUNT_SIGNIN_ENABLED==='true' && Boolean(clientId);
function loadGoogleSDK():Promise<GoogleSDK>{
 const existing=(window as GoogleWindow).google;
 if(existing)return Promise.resolve(existing);
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';
  script.async=true;
  script.onload=()=>{const sdk=(window as GoogleWindow).google;if(sdk)resolve(sdk);else reject(new Error('Google sign-in unavailable'));};
  script.onerror=()=>reject(new Error('Google sign-in could not load'));
  document.head.appendChild(script);
 });
}
/** Deliberately opt-in. Only enable after backend security/guardian gates have been approved. */
export default function GoogleSignIn({progress,onRestore,lang}:{
 progress:GuestProgress;onRestore:(next:GuestProgress)=>void;lang:'en'|'fil';
}){
 const [session,setSession]=useState(accountSession.get());
 const [approved,setApproved]=useState(false);
 const [status,setStatus]=useState('');
 const [working,setWorking]=useState(false);
 const [waitingForGoogle,setWaitingForGoogle]=useState(false);
 const target=useRef<HTMLDivElement>(null);
 const tr=(a:string,b:string)=>lang==='fil'?b:a;
 if(!enabled)return null;
 async function finish(credential:string,nonce:string){
  setWorking(true);
  try{
   const signedIn=await verifyGoogleIdToken(credential,nonce);
   const pendingGuest=guestToken.get();
   if(pendingGuest){
    await importGuestProgress(signedIn.token,pendingGuest);
    guestToken.clear();
   }
   const merged=await syncAccountProgress(signedIn.token,progress);
   onRestore(merged.state);
   setSession(signedIn);
   setStatus(tr('Signed in and progress synchronized.','Naka-sign in at na-sync ang progreso.'));
  }catch(error){
   setStatus(error instanceof Error?error.message:'Sign-in failed');
  }finally{
   setWorking(false);setWaitingForGoogle(false);
  }
 }
 async function start(){
  if(!approved||working)return;
  setWorking(true);setStatus('');
  try{
   const nonce=await requestGoogleChallenge();
   const sdk=await loadGoogleSDK();
   if(!target.current)throw new Error('Google button unavailable');
   sdk.accounts.id.initialize({
    client_id:clientId,nonce:nonce.nonce,auto_select:false,
    callback:({credential})=>{void finish(credential,nonce.nonce);}
   });
   target.current.replaceChildren();
   sdk.accounts.id.renderButton(target.current,{theme:'outline',size:'large',text:'signin_with'});
   setWaitingForGoogle(true);
  }catch(error){
   setStatus(error instanceof Error?error.message:'Sign-in unavailable');
  }finally{
   setWorking(false);
  }
 }
 async function logout(){
  if(!session)return;
  setWorking(true);
  try{await logoutAccount(session.token);setSession(null);setWaitingForGoogle(false);setStatus(tr('Signed out. Local learning is retained.','Naka-sign out. Napanatili ang lokal na pag-aaral.'));}
  catch(error){setStatus(error instanceof Error?error.message:'Logout failed');}
  finally{setWorking(false);}
 }
 return <section className="panel" aria-label={tr('Optional account','Opsyonal na account')}>
  <h3>🔐 {tr('Optional account sync','Opsyonal na account sync')}</h3>
  {session?<><p>{tr('Account linked for this tab.','Naka-link ang account sa tab na ito.')}</p>
   <button disabled={working} onClick={()=>void logout()}>{tr('Sign out','Mag-sign out')}</button></>:
   <><p className="muted">{tr(
    'Accounts are optional. Registration is intended for adults only until independently reviewed guardian consent is available.',
    'Opsyonal ang account. Para lamang sa matatanda ang registration habang wala pang nasusuring pahintulot ng magulang.'
   )}</p>
   <label className="consent"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
    {tr('I am 18 or older and choose to sign in.', 'Ako ay 18 taong gulang o higit pa at nais mag-sign in.')}</label>
   <button className="gold wide" disabled={!approved||working||waitingForGoogle} onClick={()=>void start()}>
    {working?tr('Preparing…','Inihahanda…'):tr('Prepare Google sign-in','Ihanda ang Google sign-in')}</button>
   <div ref={target} aria-label={tr('Google sign-in button','Button ng Google sign-in')}/>
   </>}
  {status&&<p role="status" aria-live="polite">{status}</p>}
 </section>;
}
