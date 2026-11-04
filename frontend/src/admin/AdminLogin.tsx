import {useRef,useState} from 'react';
import {accountSession} from '../lib/accountSync';

const base=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
const clientId=import.meta.env.VITE_ADMIN_GOOGLE_CLIENT_ID||'';
const enabled=import.meta.env.VITE_ADMIN_LOGIN_ENABLED==='true' && Boolean(clientId);
type GIS={accounts:{id:{
 initialize:(args:{client_id:string;nonce:string;auto_select:boolean;callback:(value:{credential:string})=>void})=>void;
 renderButton:(target:HTMLElement,args:{theme:string;size:string;text:string})=>void
}}};
type GISWindow=Window&{google?:GIS};
async function googleSDK():Promise<GIS>{
 const ready=(window as GISWindow).google;
 if(ready)return ready;
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{const sdk=(window as GISWindow).google;if(sdk)resolve(sdk);else reject(new Error('Google login unavailable'));};
  script.onerror=()=>reject(new Error('Could not load Google Identity Services'));
  document.head.appendChild(script);
 });
}
export default function AdminLogin({onSignedIn}:{onSignedIn:()=>Promise<void>}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const target=useRef<HTMLDivElement>(null);
 const process=async(credential:string,nonce:string)=>{
  setBusy(true);setMessage('');
  try{
   const response=await fetch(base+'/admin/auth/google',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({idToken:credential,nonce}),cache:'no-store'
   });
   if(!response.ok)throw new Error('Admin login rejected (HTTP '+response.status+')');
   const result=await response.json() as {token:string;accountId:string;expiresAt:string};
   accountSession.set(result);
   await onSignedIn();
  }catch(error){accountSession.clear();setMessage(error instanceof Error?error.message:'Sign-in unsuccessful');}
  finally{setBusy(false);}
 };
 const prepare=async()=>{
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const challenge=await fetch(base+'/admin/auth/challenge',{method:'POST',cache:'no-store'});
   if(!challenge.ok)throw new Error('Admin sign-in unavailable (HTTP '+challenge.status+')');
   const {nonce}=await challenge.json() as {nonce:string};
   const sdk=await googleSDK();
   if(!target.current)throw new Error('Sign-in control unavailable');
   sdk.accounts.id.initialize({client_id:clientId,nonce,auto_select:false,
    callback:result=>{void process(result.credential,nonce);}});
   target.current.replaceChildren();
   sdk.accounts.id.renderButton(target.current,{theme:'outline',size:'large',text:'signin_with'});
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to initialize login');}
  finally{setBusy(false);}
 };
 if(!enabled)return <p>Administrator sign-in is disabled in this environment. Request controlled provisioning and enable the approved Google OAuth configuration.</p>;
 return <div className="admin-login"><p>Use an existing, explicitly provisioned administrator Google identity. Admin registration is not public.</p>
  <button disabled={busy} onClick={()=>void prepare()}>Prepare secure Google sign-in</button>
  <div ref={target} aria-label="Google administrator sign-in"/>
  {message&&<p role="alert" className="admin-error">{message}</p>}</div>;
}
