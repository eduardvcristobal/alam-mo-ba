import {useCallback,useEffect,useState} from 'react';
import {adminApi,adminRequest} from './adminApi';
import AdminLogin from './AdminLogin';
import type {AdminMe,Fact,FactDraft,ManagedAccount,ManagedRole,Overview,QuestionDraft,QuestionSummary,QueueEntry} from './adminApi';
import {accountSession,logoutAccount} from '../lib/accountSync';
import {seedStarterContent} from './adminSeed';
import './admin.css';

type View='dashboard'|'facts'|'questions'|'review'|'access';
const adminRequestVerify=(id:number)=>adminRequest('/workflow/fact/'+id+'/verify-source',{method:'POST'});
const emptyFact=():FactDraft=>({key:'',subject:'Science',emoji:'💡',en:'',fil:'',student:true,grade:7,explore:true,sourceTitle:'',sourceUrl:''});
const emptyQuiz=():QuestionDraft=>({factId:0,en:'',fil:'',explanationEn:'',explanationFil:'',
 options:[{en:'',fil:'',correct:true},{en:'',fil:'',correct:false},{en:'',fil:'',correct:false}]});
const tabs:{id:View;icon:string;title:string;subtitle:string}[]=[
 {id:'dashboard',icon:'▦',title:'Dashboard',subtitle:'Platform overview'},
 {id:'facts',icon:'▤',title:'Facts & Content',subtitle:'Bilingual knowledge library'},
 {id:'questions',icon:'◇',title:'Quiz Bank',subtitle:'Question authoring'},
 {id:'review',icon:'✓',title:'Review Queue',subtitle:'Approval and publishing'},
 {id:'access',icon:'♙',title:'Access & Roles',subtitle:'Manage platform operator access'}
];
export default function AdminApp(){
 const [me,setMe]=useState<AdminMe|null>(null);
 const [view,setView]=useState<View>('dashboard');
 const [stats,setStats]=useState<Overview|null>(null);
 const [facts,setFacts]=useState<Fact[]>([]);
 const [questions,setQuestions]=useState<QuestionSummary[]>([]);
 const [queue,setQueue]=useState<QueueEntry[]>([]);
 const [managedAccounts,setManagedAccounts]=useState<ManagedAccount[]>([]);
 const [roleAccountId,setRoleAccountId]=useState('');
 const [roleName,setRoleName]=useState<ManagedRole>('REVIEWER');
 const [roleAction,setRoleAction]=useState<'GRANT'|'REVOKE'>('GRANT');
 const [roleReason,setRoleReason]=useState('');
 const [factForm,setFactForm]=useState<FactDraft>(emptyFact);
 const [quizForm,setQuizForm]=useState<QuestionDraft>(emptyQuiz);
 const [editingFact,setEditingFact]=useState<number|null>(null);
 const [editingQuestion,setEditingQuestion]=useState<number|null>(null);
 const [showFact,setShowFact]=useState(false);
 const [showQuiz,setShowQuiz]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [signingOut,setSigningOut]=useState(false);
 const roles=me?.roles||[];
 const allowed=(...r:string[])=>roles.includes('SUPER_ADMIN')||r.some(role=>roles.includes(role as typeof roles[number]));
 const refresh=useCallback(async()=>{
  const [overview,factRows,questionRows,review]=await Promise.all([
   adminApi.overview(),adminApi.facts(),adminApi.questions(),
   adminApi.queue().catch(()=>[] as QueueEntry[])
  ]);
  setStats(overview);setFacts(factRows);setQuestions(questionRows);setQueue(review);
 },[]);
 useEffect(()=>{
  let live=true;
  adminApi.me().then(async result=>{if(!live)return;setMe(result);await refresh();})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:'Admin access unavailable');})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[refresh]);
 const run=async(task:()=>Promise<unknown>,success:string)=>{
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{const result=await task();await refresh();setMessage(typeof result==='string'?result:success);}
  catch(e){setError(e instanceof Error?e.message:'Request failed');}
  finally{setBusy(false);}
 };
 useEffect(()=>{
  if(view!=='access'||!roles.includes('SUPER_ADMIN'))return;
  adminApi.roleAccounts().then(setManagedAccounts)
   .catch(e=>setError(e instanceof Error?e.message:'Could not load account roles'));
 },[view,me]);
 const signOut=async()=>{
  if(signingOut)return;
  setSigningOut(true);setError('');setMessage('');
  const token=accountSession.get()?.token||'';
  try{if(token)await logoutAccount(token);else accountSession.clear();}
  catch{accountSession.clear();setError('Signed out on this device, but the server could not confirm session revocation.');}
  finally{setMe(null);setStats(null);setFacts([]);setQuestions([]);setQueue([]);setSigningOut(false);}
 };
 const editFact=(f:Fact)=>{
  setEditingFact(f.id);setFactForm({key:f.key,subject:f.subject,emoji:f.emoji||'💡',
   en:f.en||'',fil:f.fil||'',student:f.student,grade:f.grade,explore:f.explore,
   sourceTitle:f.sourceTitle||'',sourceUrl:f.sourceUrl||''});
  setShowFact(true);
 };
 const editQuestion=async(q:QuestionSummary)=>{
  try{
   const data=await adminApi.question(q.id);
   const translations=Array.isArray(data.translations)?data.translations as {locale:string;prompt:string;explanation:string}[]:[];
   const localized=(key:string)=>translations.find(t=>t.locale===key);
   const options=Array.isArray(data.options)?data.options as {en:string;fil:string;correct:boolean}[]:[];
   setQuizForm({factId:q.factId,en:localized('en')?.prompt||'',fil:localized('fil')?.prompt||'',
    explanationEn:localized('en')?.explanation||'',explanationFil:localized('fil')?.explanation||'',
    options:options.map(o=>({en:o.en,fil:o.fil,correct:o.correct}))});
   setEditingQuestion(q.id);setShowQuiz(true);
  }catch(e){setError(e instanceof Error?e.message:'Could not load quiz question');}
 };
 if(loading)return <main className="admin-gate">Loading administrator access…</main>;
 if(!me)return <main className="admin-gate"><div className="gate-icon">🔐</div><h1>Alam Mo Ba? Admin</h1>
  <p>Administration requires a verified account session and an explicitly assigned platform role.</p>
  <p className="admin-error" role="alert">{error||'Administrator access not available'}</p>
  <AdminLogin onSignedIn={async()=>{const account=await adminApi.me();setMe(account);setError('');await refresh();}}/>
  <a href="/">Return to learner app</a><small>There is no public admin registration.</small></main>;
 return <div className="admin-shell">
  <aside className="admin-side">
   <div className="admin-brand"><span>💡</span><div><b>Alam Mo Ba?</b><small>Platform Administration</small></div></div>
   <nav aria-label="Administrator navigation">{tabs.filter(tab=>tab.id!=='access'||roles.includes('SUPER_ADMIN')).map(tab=><button key={tab.id}
     className={view===tab.id?'selected':''} aria-current={view===tab.id?'page':undefined}
     onClick={()=>{setView(tab.id);setError('');setMessage('');}}>
     <span className="nav-symbol">{tab.icon}</span><span>{tab.title}</span></button>)}</nav>
   <div className="admin-side-foot"><span className="online-dot"/>Authenticated Admin
    <small>{roles.join(' · ')}</small><button className="admin-signout" disabled={signingOut} onClick={()=>void signOut()}>{signingOut?'Signing out…':'Sign out'}</button>
    <a href="/">← Learner application</a></div>
  </aside>
  <main className="admin-main">
   <header className="admin-top">
    <div><span className="breadcrumb">Platform / {tabs.find(t=>t.id===view)?.title}</span>
     <h1>{tabs.find(t=>t.id===view)?.title}</h1>
     <p>{tabs.find(t=>t.id===view)?.subtitle}</p></div>
    <div className="admin-user"><span className="avatar">A</span><span><b>Administrator</b>
     <small>{roles[0]}</small></span></div>
   </header>
   {error&&<p role="alert" className="admin-error">{error}</p>}
   {message&&<p role="status" className="admin-success">{message}</p>}
   {view==='dashboard'&&<><div className="admin-metrics">
    {[{title:'Total facts',value:stats?.facts??0,icon:'▤'},
      {title:'Published facts',value:stats?.published??0,icon:'✓'},
      {title:'Quiz questions',value:stats?.questions??0,icon:'◇'},
      {title:'Awaiting review',value:stats?.reviews??0,icon:'◷'}].map(m=>
     <article className="admin-panel metric" key={m.title}><span className="metric-icon">{m.icon}</span>
      <small>{m.title}</small><strong>{m.value.toLocaleString()}</strong></article>)}</div>
     <section className="admin-panel"><div className="panel-head"><h2>Editorial pipeline</h2>
      <button onClick={()=>setView('review')}>Open review queue →</button></div>
      <p>Content is visible to learners only after source verification, independent review and publication.</p>
      <div className="pipeline">{['Draft','In review','Approved','Published'].map((t,i)=>
       <span key={t}><b>{i+1}</b>{t}</span>)}</div></section>
    <section className="admin-panel"><div className="panel-head"><h2>Recent content</h2>
     <button onClick={()=>setView('facts')}>View facts →</button></div>
     {facts.slice(0,5).map(f=><div key={f.id} className="admin-line"><span>{f.emoji||'💡'} {f.en||f.key}</span><Status value={f.status}/></div>)}
     {!facts.length&&<p>No facts have been authored yet.</p>}</section></>}
   {view==='facts'&&<section className="admin-panel"><div className="panel-head"><h2>Knowledge library</h2><div className="admin-panel-actions">
    {roles.includes('SUPER_ADMIN')&&<button disabled={busy} onClick={()=>void run(async()=>{
     const result=await seedStarterContent();
     return `Added ${result.factsCreated} fact drafts and ${result.quizzesCreated} quiz drafts. Existing starter entries were skipped.`;
    },'Starter drafts are ready. Verify the sources and review them before publishing.')}>Seed starter facts + quizzes</button>}
    {allowed('EDITOR','CONTENT_ADMIN')&&<button className="admin-primary" onClick={()=>{setEditingFact(null);setFactForm(emptyFact());setShowFact(true);}}>+ Add fact</button>}
    </div></div>
    <div className="admin-scroll"><table><thead><tr><th>Fact</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{facts.map(f=><tr key={f.id}><td><b>{f.emoji} {f.en||f.key}</b><small>{f.key}</small></td><td>{f.subject}</td>
      <td><Status value={f.status}/></td><td>
      {allowed('EDITOR','CONTENT_ADMIN')&&f.status!=='PUBLISHED'&&f.status!=='RETIRED'&&<button onClick={()=>editFact(f)}>Edit</button>}
      {allowed('EDITOR','CONTENT_ADMIN')&&f.status==='DRAFT'&&<button disabled={busy} onClick={()=>void run(()=>adminApi.transition('fact',f.id,'submit'),'Fact sent for review')}>Submit</button>}
      {allowed('EDITOR','CONTENT_ADMIN')&&f.status==='DRAFT'&&<button disabled={busy} onClick={()=>{
       if(window.confirm('Delete this unpublished fact draft?'))
        void run(()=>adminApi.deleteFact(f.id),'Draft fact deleted');
      }}>Delete draft</button>}
      {allowed('CONTENT_ADMIN')&&f.status==='PUBLISHED'&&<button disabled={busy} onClick={()=>{
       if(window.confirm('Retire this published fact from the learner library?'))
        void run(()=>adminApi.transition('fact',f.id,'retire'),'Fact retired');
      }}>Retire</button>}
      </td></tr>)}</tbody></table></div>{!facts.length&&<p>No content yet. Create your first bilingual fact.</p>}</section>}
   {view==='questions'&&<section className="admin-panel"><div className="panel-head"><h2>Question bank</h2>
    {allowed('EDITOR','CONTENT_ADMIN')&&<button className="admin-primary" onClick={()=>{setEditingQuestion(null);setQuizForm(emptyQuiz());setShowQuiz(true);}}>+ Add question</button>}</div>
    <div className="admin-scroll"><table><thead><tr><th>Question</th><th>Linked fact</th><th>Status</th><th>Actions</th></tr></thead><tbody>
     {questions.map(q=><tr key={q.id}><td>{q.prompt}</td><td>#{q.factId}</td><td><Status value={q.status}/></td><td>
      {allowed('EDITOR','CONTENT_ADMIN')&&['DRAFT','IN_REVIEW','APPROVED'].includes(q.status)&&<button onClick={()=>void editQuestion(q)}>Edit</button>}
      {allowed('EDITOR','CONTENT_ADMIN')&&q.status==='DRAFT'&&<button disabled={busy} onClick={()=>void run(()=>adminApi.transition('question',q.id,'submit'),'Question submitted')}>Submit</button>}
      {allowed('EDITOR','CONTENT_ADMIN')&&q.status==='DRAFT'&&<button disabled={busy} onClick={()=>{
       if(window.confirm('Delete this unpublished question draft?'))
        void run(()=>adminApi.deleteQuestion(q.id),'Draft question deleted');
      }}>Delete draft</button>}
      {allowed('CONTENT_ADMIN')&&q.status==='PUBLISHED'&&<button disabled={busy} onClick={()=>{
       if(window.confirm('Retire this quiz question?'))
        void run(()=>adminApi.transition('question',q.id,'retire'),'Question retired');
      }}>Retire</button>}
     </td></tr>)}</tbody></table></div>{!questions.length&&<p>No quiz questions created yet.</p>}</section>}
   {view==='review'&&<section className="admin-panel"><div className="panel-head"><h2>Review and publication queue</h2><span>{queue.length} items</span></div>
    {!allowed('REVIEWER','CONTENT_ADMIN')?<p>Reviewer role required.</p>:<div className="admin-scroll"><table><thead>
     <tr><th>Type</th><th>Content ID</th><th>Status</th><th>Decision</th></tr></thead><tbody>{queue.map(item=>
     <tr key={item.type+item.id}><td>{item.type}</td><td>#{item.id}</td><td><Status value={item.status}/></td><td>
      {item.status==='IN_REVIEW'&&allowed('REVIEWER')&&<>
       {item.type==='FACT'&&<button disabled={busy} onClick={()=>{
        const fact=facts.find(f=>f.id===item.id);
        if(!fact?.sourceUrl){setError('No HTTPS source is attached');return;}
        window.open(fact.sourceUrl,'_blank','noopener,noreferrer');
        if(window.confirm('Have you independently checked the source and the bilingual fact?')) {
         void run(()=>adminRequestVerify(item.id),'Source verification recorded');
        }
       }}>Verify source</button>}
       <button disabled={busy} onClick={()=>void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'approve'),'Independent review approved')}>Approve</button>
       <button disabled={busy} onClick={()=>void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'reject'),'Returned to draft')}>Reject</button></>}
      {item.status==='APPROVED'&&allowed('CONTENT_ADMIN')&&<button disabled={busy} className="admin-primary" onClick={()=>void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'publish'),'Published to learners')}>Publish</button>}
     </td></tr>)}</tbody></table>{!queue.length&&<p>No items are awaiting editorial action.</p>}</div>}</section>}
   {view==='access'&&roles.includes('SUPER_ADMIN')&&<>
    <section className="admin-panel"><h2>Grant or revoke a platform role</h2>
     <p>Only active accounts can receive a role. Changes are recorded in the platform audit log.</p>
     <form className="role-form" onSubmit={event=>{event.preventDefault();
      if(roleAction==='REVOKE'&&!window.confirm(`Revoke ${roleName} from ${roleAccountId}?`))return;
      void run(async()=>{
       const result=await adminApi.changeRole({accountId:roleAccountId.trim(),role:roleName,action:roleAction,reason:roleReason.trim()});
       setManagedAccounts(await adminApi.roleAccounts());setRoleReason('');
       return result.changed?`${roleName} ${roleAction==='GRANT'?'granted':'revoked'}.`:`${roleAccountId} already has no change for ${roleName}.`;
      },'Role assignment updated.');
     }}>
      <label>Account ID<input required value={roleAccountId} placeholder="Paste the account UUID" onChange={event=>setRoleAccountId(event.target.value)}/></label>
      <label>Role<select value={roleName} onChange={event=>setRoleName(event.target.value as ManagedRole)}>
       {(['REVIEWER','EDITOR','CONTENT_ADMIN','SUPPORT','SUPER_ADMIN'] as ManagedRole[]).map(role=><option key={role}>{role}</option>)}
      </select></label>
      <label>Action<select value={roleAction} onChange={event=>setRoleAction(event.target.value as 'GRANT'|'REVOKE')}>
       <option value="GRANT">Grant</option><option value="REVOKE">Revoke</option>
      </select></label>
      <label>Reason<input required maxLength={500} value={roleReason} placeholder="Why is this role changing?" onChange={event=>setRoleReason(event.target.value)}/></label>
      <button className="admin-primary" disabled={busy} type="submit">{roleAction==='GRANT'?'Grant role':'Revoke role'}</button>
     </form>
    </section>
    <section className="admin-panel"><div className="panel-head"><h2>Accounts</h2><button disabled={busy} onClick={()=>void adminApi.roleAccounts().then(setManagedAccounts).catch(e=>setError(e instanceof Error?e.message:'Could not load accounts'))}>Refresh</button></div>
     <p>Account IDs are pseudonymous. Select an account below, then choose a role and enter a reason above. Showing the 100 most recently created accounts.</p>
     <div className="admin-scroll"><table><thead><tr><th>Account ID</th><th>Status</th><th>Created</th><th>Roles</th><th>Action</th></tr></thead><tbody>
      {managedAccounts.map(account=><tr key={account.accountId}><td><code>{account.accountId}</code></td><td>{account.status}</td>
       <td>{new Date(account.createdAt).toLocaleString()}</td><td>{account.roles.length?account.roles.join(' · '):'Learner'}</td>
       <td><button onClick={()=>setRoleAccountId(account.accountId)}>Select</button></td></tr>)}
     </tbody></table>{!managedAccounts.length&&<p>No accounts found.</p>}</div>
    </section>
   </>}
  </main>
  {showFact&&<div className="admin-modal-bg" role="presentation"><form className="admin-modal" onSubmit={e=>{e.preventDefault();void run(async()=>{
    if(editingFact)await adminApi.updateFact(editingFact,factForm);else await adminApi.createFact(factForm);
    setShowFact(false);
   },'Fact draft saved');}}><div className="panel-head"><h2>{editingFact?'Edit fact':'New fact draft'}</h2>
    <button type="button" onClick={()=>setShowFact(false)}>✕</button></div>
   <div className="admin-fields">{([['key','Canonical key'],['subject','Subject'],['emoji','Emoji'],
     ['en','English fact'],['fil','Filipino fact'],['sourceTitle','Source title'],['sourceUrl','HTTPS source URL']] as const).map(([field,label])=>
     <label key={field}>{label}<input value={factForm[field]} required={!['emoji','sourceTitle','sourceUrl'].includes(field)}
       onChange={e=>setFactForm(p=>({...p,[field]:e.target.value}))}/></label>)}
    <div className="admin-inline"><label><input type="checkbox" checked={factForm.student} onChange={e=>setFactForm(p=>({...p,student:e.target.checked}))}/> Student</label>
    <label><input type="checkbox" checked={factForm.explore} onChange={e=>setFactForm(p=>({...p,explore:e.target.checked}))}/> Explore</label>
    {factForm.student&&<label>Grade<select value={factForm.grade??7} onChange={e=>setFactForm(p=>({...p,grade:Number(e.target.value)}))}>
     {[7,8,9].map(g=><option key={g} value={g}>{g}</option>)}</select></label>}</div>
   </div><div className="admin-modal-actions"><button type="button" onClick={()=>setShowFact(false)}>Cancel</button>
    <button className="admin-primary" disabled={busy} type="submit">Save draft</button></div></form></div>}
  {showQuiz&&<div className="admin-modal-bg" role="presentation"><form className="admin-modal" onSubmit={e=>{e.preventDefault();void run(async()=>{
    if(editingQuestion)await adminApi.updateQuestion(editingQuestion,quizForm);else await adminApi.createQuestion(quizForm);
    setShowQuiz(false);
   },'Question draft saved');}}><div className="panel-head"><h2>{editingQuestion?'Edit question':'New quiz question'}</h2>
    <button type="button" onClick={()=>setShowQuiz(false)}>✕</button></div>
    <div className="admin-fields"><label>Linked fact<select value={quizForm.factId} required onChange={e=>setQuizForm(p=>({...p,factId:Number(e.target.value)}))}>
     <option value="0">Select a fact</option>{facts.filter(f=>f.status!=='RETIRED').map(f=><option key={f.id} value={f.id}>{f.key}</option>)}</select></label>
     {([['en','Question (English)'],['fil','Question (Filipino)'],['explanationEn','Explanation (English)'],
      ['explanationFil','Explanation (Filipino)']] as const).map(([key,label])=>
      <label key={key}>{label}<input required value={quizForm[key]} onChange={e=>setQuizForm(p=>({...p,[key]:e.target.value}))}/></label>)}
     <h3>Answer options — select exactly one correct</h3>
     {quizForm.options.map((option,i)=><div className="admin-option" key={i}>
      <label><input type="radio" name="correct" checked={option.correct} onChange={()=>setQuizForm(p=>({...p,options:p.options.map((o,j)=>({...o,correct:j===i}))}))}/> Correct</label>
      <input required aria-label={`Option ${i+1} English`} placeholder="English" value={option.en}
       onChange={e=>setQuizForm(p=>({...p,options:p.options.map((o,j)=>j===i?{...o,en:e.target.value}:o)}))}/>
      <input required aria-label={`Option ${i+1} Filipino`} placeholder="Filipino" value={option.fil}
       onChange={e=>setQuizForm(p=>({...p,options:p.options.map((o,j)=>j===i?{...o,fil:e.target.value}:o)}))}/></div>)}
     <div className="admin-inline"><button type="button" disabled={quizForm.options.length>=6} onClick={()=>setQuizForm(p=>({...p,options:[...p.options,{en:'',fil:'',correct:false}]}))}>Add option</button>
     <button type="button" disabled={quizForm.options.length<=2||quizForm.options.at(-1)?.correct} onClick={()=>setQuizForm(p=>({...p,options:p.options.slice(0,-1)}))}>Remove last</button></div>
    </div><div className="admin-modal-actions"><button type="button" onClick={()=>setShowQuiz(false)}>Cancel</button>
     <button className="admin-primary" disabled={busy} type="submit">Save question</button></div></form></div>}
 </div>;
}
function Status({value}:{value:string}){return <span className={'admin-status status-'+value.toLowerCase()}>{value.replace('_',' ')}</span>;}
