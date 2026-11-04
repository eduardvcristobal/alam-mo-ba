import {useRef,useState} from 'react';
import {requestGoogleChallenge,verifyGoogleIdToken} from './lib/accountSync';

type GoogleSDK={
 accounts:{id:{
  initialize:(config:{client_id:string;nonce:string;callback:(response:{credential:string})=>void;auto_select:boolean})=>void;
  renderButton:(node:HTMLElement,options:{theme:string;size:string;text:string})=>void;
 }}
};
type IdentityWindow=Window&{google?:GoogleSDK};
const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID||'';
const signInEnabled=import.meta.env.VITE_ADMIN_SIGNIN_ENABLED==='true'&&Boolean(clientId);

async function googleSDK():Promise<GoogleSDK>{
 const available=(window as IdentityWindow).google;
 if(available)return available;
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.async=true;script.src='https://accounts.google.com/gsi/client';
  script.onload=()=>{
   const sdk=(window as IdentityWindow).google;
   if(sdk)resolve(sdk);else reject(new Error('Google Identity Services unavailable'));
  };
  script.onerror=()=>reject(new Error('Cannot load Google sign-in'));
  document.head.appendChild(script);
 });
}
export default function AdminSignIn(){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const target=useRef<HTMLDivElement>(null);
 if(!signInEnabled)return <p>Operator sign-in is disabled by default. An administrator must configure the approved Google OAuth client and platform registration policy first.</p>;
 async function finish(credential:string,nonce:string){
  setBusy(true);setError('');
  try{
   await verifyGoogleIdToken(credential,nonce);
   window.location.assign('/admin');
  }catch(e){setError(e instanceof Error?e.message:'Sign-in failed');}
  finally{setBusy(false);}
 }
 async function start(){
  setBusy(true);setError('');
  try{
   const challenge=await requestGoogleChallenge();
   const sdk=await googleSDK();
   if(!target.current)throw new Error('Sign-in container unavailable');
   sdk.accounts.id.initialize({
    client_id:clientId,nonce:challenge.nonce,auto_select:false,
    callback:response=>{void finish(response.credential,challenge.nonce);}
   });
   target.current.replaceChildren();
   sdk.accounts.id.renderButton(target.current,{theme:'outline',size:'large',text:'signin_with'});
  }catch(e){setError(e instanceof Error?e.message:'Sign-in unavailable');}
  finally{setBusy(false);}
 }
 return <section aria-label="Restricted admin sign-in">
  <p>Only an existing, independently provisioned platform operator can access admin tools. Google sign-in does not grant platform roles.</p>
  <button type="button" disabled={busy} onClick={()=>void start()}>Sign in with Google</button>
  <div ref={target}/>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
