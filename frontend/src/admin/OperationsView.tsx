import {useCallback,useEffect,useState} from 'react';
import {adminRequest} from './adminApi';
import type {Role,Fact} from './adminApi';

export type OperationsKind='curriculum'|'learners'|'analytics'|'privacy'|'settings'|'audit';
type Subject={code:string;name:string;enabled:boolean};
type Topic={id:number;subject:string;grade:number;en:string;fil:string;enabled:boolean};
type Learner={accountId:string;status:string;createdAt:string;learnedCount:number};
type Aggregate={learners:number;active:number;publishedFacts:number;publishedQuizzes:number;quizAttempts:number;pendingPrivacy:number};
type Privacy={id:number;accountId:string;type:string;status:string;createdAt:string};
type Setting={key:string;value:string};
type Audit={id:number;actor:string;action:string;type:string;entityId:number|null;at:string};
const can=(roles:Role[],...needed:Role[])=>roles.includes('SUPER_ADMIN')||needed.some(x=>roles.includes(x));
export default function OperationsView({kind,roles}:{kind:OperationsKind;roles:Role[]}){
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [topics,setTopics]=useState<Topic[]>([]);
 const [facts,setFacts]=useState<Fact[]>([]);
 const [selectedFact,setSelectedFact]=useState(0);
 const [selectedTopic,setSelectedTopic]=useState(0);
 const [assignments,setAssignments]=useState<{factId:number;topicId:number}[]>([]);
 const [learners,setLearners]=useState<Learner[]>([]);
 const [analytics,setAnalytics]=useState<Aggregate|null>(null);
 const [privacy,setPrivacy]=useState<Privacy[]>([]);
 const [settings,setSettings]=useState<Setting[]>([]);
 const [audit,setAudit]=useState<Audit[]>([]);
 const [subject,setSubject]=useState('Science');
 const [grade,setGrade]=useState(7);
 const [en,setEn]=useState('');const [fil,setFil]=useState('');
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  switch(kind){
   case 'curriculum':{
    const [s,t,f,a]=await Promise.all([
      adminRequest<Subject[]>('/operations/subjects'),
      adminRequest<Topic[]>('/operations/topics'),
      adminRequest<Fact[]>('/facts'),
      adminRequest<{factId:number;topicId:number}[]>('/operations/topics/assignments')]);
    setSubjects(s);setTopics(t);setFacts(f);setAssignments(a);return;
   }
   case 'learners':setLearners(await adminRequest<Learner[]>('/operations/learners'));return;
   case 'analytics':setAnalytics(await adminRequest<Aggregate>('/operations/analytics'));return;
   case 'privacy':setPrivacy(await adminRequest<Privacy[]>('/operations/privacy'));return;
   case 'settings':setSettings(await adminRequest<Setting[]>('/operations/settings'));return;
   case 'audit':setAudit(await adminRequest<Audit[]>('/operations/audit'));return;
  }
 },[kind]);
 useEffect(()=>{let alive=true;load().catch(err=>{if(alive)setError(err instanceof Error?err.message:'Unable to load data');});return()=>{alive=false;};},[load]);
 const run=async(task:()=>Promise<unknown>,success:string)=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await task();await load();setMessage(success);}catch(err){setError(err instanceof Error?err.message:'Request failed');}
  finally{setBusy(false);}
 };
 const heading:{[K in OperationsKind]:string}={curriculum:'Curriculum and topics',learners:'Learner accounts',analytics:'Aggregate analytics',privacy:'Privacy requests',settings:'Platform settings',audit:'Administrator audit log'};
 return <section className="admin-panel">
  <div className="panel-head"><h2>{heading[kind]}</h2><small>Role-enforced admin operations</small></div>
  {error&&<p role="alert" className="admin-error">{error}</p>}{message&&<p role="status" className="admin-success">{message}</p>}
  {kind==='curriculum'&&<>
   <div className="admin-catalog">
    <h3>Subjects</h3><div className="admin-inline">{subjects.map(s=><span className="admin-status" key={s.code}>{s.code} · {s.name}</span>)}</div>
    <h3>Topics by grade</h3>{can(roles,'EDITOR','CONTENT_ADMIN')&&
     <form className="admin-topic-form" onSubmit={e=>{e.preventDefault();void run(async()=>{
      await adminRequest('/operations/topics',{method:'POST',body:JSON.stringify({subject,grade,en,fil})});
      setEn('');setFil('');
     },'Topic added');}}>
      <label>Subject<select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
      <label>Grade<select value={grade} onChange={e=>setGrade(Number(e.target.value))}>{[7,8,9].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
      <label>English topic<input required value={en} onChange={e=>setEn(e.target.value)}/></label>
      <label>Filipino topic<input required value={fil} onChange={e=>setFil(e.target.value)}/></label>
      <button type="submit" className="admin-primary" disabled={busy}>Add topic</button>
     </form>}
    <div className="admin-scroll"><table><thead><tr><th>Subject</th><th>Grade</th><th>English</th><th>Filipino</th><th>Status</th></tr></thead><tbody>
    {topics.map(t=><tr key={t.id}><td>{t.subject}</td><td>{t.grade}</td><td>{t.en}</td><td>{t.fil}</td><td>
     {can(roles,'CONTENT_ADMIN')?<button disabled={busy} onClick={()=>void run(()=>adminRequest('/operations/topics/'+t.id+'/enabled',{
       method:'PUT',body:JSON.stringify({enabled:!t.enabled})}),t.enabled?'Topic disabled':'Topic enabled')}>{t.enabled?'Disable':'Enable'}</button>:
       t.enabled?'Active':'Disabled'}</td></tr>)}</tbody></table></div>
    <h3>Assign a draft fact to a curriculum topic</h3>
    {can(roles,'EDITOR','CONTENT_ADMIN')&&<form className="admin-topic-form" onSubmit={e=>{
     e.preventDefault();
     void run(()=>adminRequest('/operations/topics/assign/'+selectedFact,{
      method:'PUT',body:JSON.stringify({topicId:selectedTopic})
     }),'Curriculum topic assigned');
    }}>
      <label>Draft fact<select value={selectedFact} required onChange={e=>setSelectedFact(Number(e.target.value))}>
       <option value="0">Choose a draft</option>{facts.filter(f=>f.status==='DRAFT').map(f=>
        <option key={f.id} value={f.id}>{f.key}</option>)}</select></label>
      <label>Topic<select value={selectedTopic} required onChange={e=>setSelectedTopic(Number(e.target.value))}>
       <option value="0">Choose topic</option>{topics.filter(t=>t.enabled).map(t=>
        <option key={t.id} value={t.id}>{t.subject} · Grade {t.grade} · {t.en}</option>)}</select></label>
      <button type="submit" className="admin-primary" disabled={busy||!selectedFact||!selectedTopic}>Assign topic</button>
    </form>}
    <p className="muted">{assignments.length} fact-to-topic assignments recorded.</p>
   </div></>}
  {kind==='learners'&&<><p className="muted">Only account IDs, status and aggregate learning counts are shown—no emails, birthdates or raw answer histories.</p>
   <div className="admin-scroll"><table><thead><tr><th>Account ID</th><th>Status</th><th>Facts learned</th><th>Created</th><th>Action</th></tr></thead><tbody>
   {learners.map(l=><tr key={l.accountId}><td><code>{l.accountId.slice(0,8)}…</code></td><td>{l.status}</td><td>{l.learnedCount}</td><td>{l.createdAt.slice(0,10)}</td><td>
    {can(roles,'SUPER_ADMIN')&&l.status!=='DELETED'&&<button disabled={busy} onClick={()=>{
      if(window.confirm('Change status of account '+l.accountId+'?'))
       void run(()=>adminRequest('/operations/learners/'+l.accountId+'/'+(l.status==='ACTIVE'?'suspend':'reactivate'),{method:'POST'}),'Account status changed');
    }}>{l.status==='ACTIVE'?'Suspend':'Reactivate'}</button>}</td></tr>)}</tbody></table></div>
   </>}
  {kind==='analytics'&&analytics&&<div className="admin-metrics">
   {([['Accounts',analytics.learners],['Active accounts',analytics.active],['Published facts',analytics.publishedFacts],
     ['Published quizzes',analytics.publishedQuizzes],['Recorded attempts',analytics.quizAttempts],['Privacy requests',analytics.pendingPrivacy]] as const).map(([name,value])=>
     <article className="admin-panel metric" key={name}><small>{name}</small><strong>{value.toLocaleString()}</strong></article>)}
   </div>}
  {kind==='privacy'&&<><p className="muted">Requests are tracked for operational follow-up; changing review status does not itself erase data.</p>
   <div className="admin-scroll"><table><thead><tr><th>ID</th><th>Type</th><th>Account</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>
   {privacy.map(p=><tr key={p.id}><td>#{p.id}</td><td>{p.type}</td><td><code>{p.accountId.slice(0,8)}…</code></td>
    <td>{p.status}</td><td>{p.createdAt.slice(0,10)}</td><td>
    {p.status==='OPEN'&&can(roles,'SUPER_ADMIN')&&<button disabled={busy} onClick={()=>void run(
      ()=>adminRequest('/operations/privacy/'+p.id+'/review',{method:'POST'}),'Request assigned for review')}>Start review</button>}</td></tr>)}</tbody></table></div></>}
  {kind==='settings'&&<><p className="muted">Only non-security content settings are editable here. OAuth, roles and sensitive credentials remain deployment-controlled.</p>
   {settings.map(s=><form key={s.key} className="admin-setting-row" onSubmit={e=>{e.preventDefault();
     const form=e.currentTarget;const value=(form.elements.namedItem('value') as HTMLInputElement).value;
     void run(()=>adminRequest('/operations/settings/'+s.key,{method:'PUT',body:JSON.stringify({value})}),'Setting updated');
    }}><label>{s.key}<input name="value" defaultValue={s.value} key={s.value}/></label>
    <button type="submit" disabled={busy}>Save</button></form>)}</>}
  {kind==='audit'&&<><p className="muted">Recent administrator actions (read-only). Content edits and publication decisions are recorded server-side.</p>
   <div className="admin-scroll"><table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead><tbody>
    {audit.map(a=><tr key={a.id}><td>{a.at.slice(0,19).replace('T',' ')}</td><td>{a.action}</td>
     <td>{a.type} {a.entityId===null?'':'#'+a.entityId}</td><td><code>{a.actor.slice(0,8)}…</code></td></tr>)}</tbody></table></div></>}
 </section>;
}
