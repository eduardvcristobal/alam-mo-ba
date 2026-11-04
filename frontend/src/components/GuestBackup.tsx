import {useEffect,useRef,useState} from 'react';
import {createGuestSession,guestToken,mergeGuestProgress,readGuestProgress,revokeGuestSession,saveGuestProgress} from '../lib/guestCloud';
import type {GuestProgress} from '../lib/guestCloud';
const syncedProgressKey='alam-mo-ba-guest-cloud-synced-progress';

export default function GuestBackup({progress,onRestore,lang}:{
 progress:GuestProgress;onRestore:(state:GuestProgress)=>void;lang:'en'|'fil';
}){
 const [connected,setConnected]=useState(Boolean(guestToken.get()));
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);
 const [retryAvailable,setRetryAvailable]=useState(false);
 const [retryTick,setRetryTick]=useState(0);
 const latestProgress=useRef(progress);
 const syncedProgress=useRef(guestToken.get()?localStorage.getItem(syncedProgressKey)||'':'');
 const pausedFingerprint=useRef('');
 const attemptedFingerprint=useRef('');
 const retryCount=useRef(0);
 const retryAfter=useRef(0);
 latestProgress.current=progress;
 const tr=(en:string,fil:string)=>lang==='fil'?fil:en;
 function same(a:GuestProgress,b:GuestProgress){return JSON.stringify(a)===JSON.stringify(b);}
 function rememberSynced(state:GuestProgress){
  const value=JSON.stringify(state);
  syncedProgress.current=value;
  try{localStorage.setItem(syncedProgressKey,value);}catch{/* Backup still works if the browser cannot store this optimization. */}
 }
 function handleFailure(error:unknown){
  const detail=error instanceof Error?error.message:'Backup unavailable';
  if(/\b401\b/.test(detail)){
   guestToken.clear();localStorage.removeItem(syncedProgressKey);syncedProgress.current='';setConnected(false);
   setStatus(tr('This backup session expired. Enable guest backup again to continue backing up progress.','Nag-expire ang backup session. Paganahin muli ang guest backup para magpatuloy ang pag-backup ng progreso.'));
  }else setStatus(detail);
 }
 function retryPending(){
  retryCount.current=0;retryAfter.current=0;pausedFingerprint.current='';
  setRetryAvailable(false);setRetryTick(x=>x+1);
 }
 useEffect(()=>{
  const wentOffline=()=>{setOnline(false);if(connected)setStatus(tr('Backup pending. Your progress remains saved in this browser and will upload when you are back online.','Naka-pending ang backup. Naka-save pa rin ang progreso sa browser na ito at ia-upload kapag online ka na.'));};
  const cameOnline=()=>{setOnline(true);retryCount.current=0;retryAfter.current=0;pausedFingerprint.current='';setRetryAvailable(false);setRetryTick(x=>x+1);};
  window.addEventListener('offline',wentOffline);window.addEventListener('online',cameOnline);
  return ()=>{window.removeEventListener('offline',wentOffline);window.removeEventListener('online',cameOnline);};
 },[connected,lang]);
 useEffect(()=>{
  if(!connected||busy)return;
  const token=guestToken.get();
  if(!token){setConnected(false);return;}
  const snapshot=JSON.stringify(progress);
  if(snapshot===syncedProgress.current)return;
  if(snapshot!==attemptedFingerprint.current){attemptedFingerprint.current=snapshot;retryCount.current=0;retryAfter.current=0;pausedFingerprint.current='';setRetryAvailable(false);}
  if(snapshot===pausedFingerprint.current)return;
  if(!online){setStatus(tr('Backup pending. Your progress is safe in this browser and will upload when you are back online.','Naka-pending ang backup. Ligtas ang progreso sa browser na ito at ia-upload kapag online ka na.'));return;}
  const wait=Math.max(500,retryAfter.current-Date.now());
  const timer=window.setTimeout(()=>{
   setBusy(true);setStatus(tr('Saving progress to your guest backup…','Sine-save ang progreso sa guest backup…'));
   const source=latestProgress.current;
   const fingerprint=JSON.stringify(source);
   void saveGuestProgress(token,source).then(()=>{
    rememberSynced(source);
    retryCount.current=0;retryAfter.current=0;pausedFingerprint.current='';setRetryAvailable(false);
    setStatus(tr('Progress saved automatically to this browser’s guest backup.','Awtomatikong nai-backup ang progreso sa guest backup ng browser na ito.'));
   }).catch(error=>{
    const detail=error instanceof Error?error.message:'Backup unavailable';
    if(/\b401\b/.test(detail)){handleFailure(error);return;}
    const match=detail.match(/(?:HTTP|:)\s*(\d{3})/i);
    const code=match?Number(match[1]):0;
    const transient=error instanceof TypeError||code===429||code>=500||!code;
    if(transient&&retryCount.current<3){
     retryCount.current+=1;retryAfter.current=Date.now()+1000*2**(retryCount.current-1);
     setStatus(tr('Backup temporarily unavailable. Progress is safe here; retrying shortly…','Pansamantalang hindi magamit ang backup. Ligtas ang progreso rito; susubukang muli…'));
    }else{
     pausedFingerprint.current=fingerprint;setRetryAvailable(true);
     setStatus(tr('Could not sync yet. Progress is still saved on this device. Retry when ready.','Hindi pa ma-sync. Naka-save pa rin ang progreso sa device na ito. Subukang muli kapag handa na.'));
    }
   }).finally(()=>setBusy(false));
  },wait);
  return ()=>window.clearTimeout(timer);
 },[connected,progress,busy,lang,online,retryTick]);
 async function save(){
  if(busy)return;
  if(!online){setStatus(tr('You are offline. Your progress remains saved on this device; try backing up when you are online.','Offline ka. Nananatiling naka-save ang progreso sa device na ito; subukang mag-backup kapag online ka na.'));return;}
  setBusy(true);setStatus('');
  try{
   const token=guestToken.get()||await createGuestSession();
   setConnected(true);
   await saveGuestProgress(token,progress);
   rememberSynced(progress);
   setStatus(tr('Progress safely backed up on this device’s guest session.','Nai-backup ang progreso gamit ang guest session ng device na ito.'));
  }catch(e){handleFailure(e);}
  finally{setBusy(false);}
 }
 async function restore(){
  const token=guestToken.get();if(!token||busy)return;
  if(!online){setStatus(tr('You are offline. Local progress is available; reconnect to restore the backup.','Offline ka. Magagamit ang lokal na progreso; kumonekta muli para maibalik ang backup.'));return;}
  setBusy(true);setStatus('');
  try{
   const remote=await readGuestProgress(token);
   rememberSynced(remote.state);
   const merged=mergeGuestProgress(progress,remote.state);
   if(!same(progress,merged))onRestore(merged);
   setStatus(tr('Cloud progress merged with local progress.','Pinagsama ang cloud at lokal na progreso.'));
  }catch(e){handleFailure(e);}
  finally{setBusy(false);}
 }
 async function disconnect(){
  const token=guestToken.get();if(!token||busy)return;
  if(!online){setStatus(tr('You are offline. Reconnect before revoking the backup.','Offline ka. Kumonekta muna bago bawiin ang backup.'));return;}
  if(!window.confirm(tr('Delete this anonymous cloud backup? Your local progress stays on this device.','Burahin ang guest cloud backup? Mananatili ang lokal na progreso sa device.')))return;
  setBusy(true);setStatus('');
  try{
   await revokeGuestSession(token);
   localStorage.removeItem(syncedProgressKey);syncedProgress.current='';
   setConnected(false);
   setStatus(tr('Backup access revoked. Local progress was kept.','Binawi ang backup. Napanatili ang lokal na progreso.'));
  }catch(e){handleFailure(e);}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>☁️ {tr('Optional guest backup','Opsyonal na guest backup')}</h3>
  <p className="muted">{tr(
   'No account required. After you enable backup, progress changes are saved automatically using a secret stored in this browser. They cannot yet be recovered on another device or if this browser’s data is cleared.',
   'Walang account na kailangan. Kapag pinagana ang backup, awtomatikong mase-save ang mga pagbabago gamit ang lihim na susi sa browser na ito. Hindi pa ito mare-recover sa ibang device o kapag nabura ang data ng browser.'
  )}</p>
  <button className="gold wide" onClick={()=>void save()} disabled={busy}>{busy?tr('Working…','Isinasagawa…'):connected?tr('Back up latest progress','I-backup ang bagong progreso'):tr('Enable guest backup','Paganahin ang guest backup')}</button>
  {connected&&<>
   <button className="wide" onClick={()=>void restore()} disabled={busy}>{tr('Restore/merge backup','Ibalik at pagsamahin ang backup')}</button>
   <button className="wide" onClick={()=>void disconnect()} disabled={busy}>{tr('Revoke guest backup','Bawiin ang guest backup')}</button>
  </>}
  {retryAvailable&&<button className="wide" onClick={retryPending} disabled={!online||busy}>{tr('Retry backup now','Subukang i-backup muli')}</button>}
  {status&&<p role="status" aria-live="polite">{status}</p>}
 </section>;
}
