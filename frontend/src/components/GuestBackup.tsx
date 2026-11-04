import {useState} from 'react';
import {createGuestSession,guestToken,mergeGuestProgress,readGuestProgress,revokeGuestSession,saveGuestProgress} from '../lib/guestCloud';
import type {GuestProgress} from '../lib/guestCloud';

export default function GuestBackup({progress,onRestore,lang}:{
 progress:GuestProgress;onRestore:(state:GuestProgress)=>void;lang:'en'|'fil';
}){
 const [connected,setConnected]=useState(Boolean(guestToken.get()));
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const tr=(en:string,fil:string)=>lang==='fil'?fil:en;
 async function save(){
  if(busy)return;
  setBusy(true);setStatus('');
  try{
   const token=guestToken.get()||await createGuestSession();
   setConnected(true);
   const saved=await saveGuestProgress(token,progress);
   onRestore(saved.state);
   setStatus(tr('Progress safely backed up on this device’s guest session.','Nai-backup ang progreso gamit ang guest session ng device na ito.'));
  }catch(e){setStatus(e instanceof Error?e.message:'Backup unavailable');}
  finally{setBusy(false);}
 }
 async function restore(){
  const token=guestToken.get();if(!token||busy)return;
  setBusy(true);setStatus('');
  try{
   const remote=await readGuestProgress(token);
   onRestore(mergeGuestProgress(progress,remote.state));
   setStatus(tr('Cloud progress merged with local progress.','Pinagsama ang cloud at lokal na progreso.'));
  }catch(e){setStatus(e instanceof Error?e.message:'Restore unavailable');}
  finally{setBusy(false);}
 }
 async function disconnect(){
  const token=guestToken.get();if(!token||busy)return;
  if(!window.confirm(tr('Delete this anonymous cloud backup? Your local progress stays on this device.','Burahin ang guest cloud backup? Mananatili ang lokal na progreso sa device.')))return;
  setBusy(true);setStatus('');
  try{
   await revokeGuestSession(token);
   setConnected(false);
   setStatus(tr('Backup access revoked. Local progress was kept.','Binawi ang backup. Napanatili ang lokal na progreso.'));
  }catch(e){setStatus(e instanceof Error?e.message:'Revocation unavailable');}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>☁️ {tr('Optional guest backup','Opsyonal na guest backup')}</h3>
  <p className="muted">{tr(
   'No account required. Backups use an anonymous secret stored in this browser. They cannot yet be recovered on another device or if this browser’s data is cleared.',
   'Walang account na kailangan. Ang lihim na susi ay nasa browser na ito. Hindi pa mare-recover sa ibang device o kapag nabura ang data ng browser.'
  )}</p>
  <button className="gold wide" onClick={()=>void save()} disabled={busy}>{busy?tr('Working…','Isinasagawa…'):connected?tr('Back up latest progress','I-backup ang bagong progreso'):tr('Enable guest backup','Paganahin ang guest backup')}</button>
  {connected&&<>
   <button className="wide" onClick={()=>void restore()} disabled={busy}>{tr('Restore/merge backup','Ibalik at pagsamahin ang backup')}</button>
   <button className="wide" onClick={()=>void disconnect()} disabled={busy}>{tr('Revoke guest backup','Bawiin ang guest backup')}</button>
  </>}
  {status&&<p role="status" aria-live="polite">{status}</p>}
 </section>;
}
