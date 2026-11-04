import {useCallback,useEffect,useState} from 'react';
import {accountSession,logoutAccount} from './lib/accountSync';
import AdminSignIn from './AdminSignIn';
import {platformAdmin} from './lib/platformAdmin';
import type {AdminOperator,AdminStats,FactDraft,FactRow,QuizDraft,QuizRow,QueueRow,AdminAudit,ChoiceDraft} from './lib/platformAdmin';

type Tab='dashboard'|'facts'|'quizzes'|'reviews'|'audit';
const emptyFact:FactDraft={key:'',subject:'Science',emoji:'💡',en:'',fil:'',explore:true,grades:[7],sourceTitle:'',sourceUrl:''};
const emptyQuiz:QuizDraft={factId:0,en:'',fil:'',explanationEn:'',explanationFil:'',
 choices:[{en:'',fil:'',correct:true},{en:'',fil:'',correct:false},{en:'',fil:'',correct:false}]};
const tabs:{id:Tab;icon:string;label:string}[]=[
 {id:'dashboard',icon:'📊',label:'Dashboard'},{id:'facts',icon:'📚',label:'Facts & Sources'},
 {id:'quizzes',icon:'🧠',label:'Quiz Bank'},{id:'reviews',icon:'✅',label:'Review Queue'},
 {id:'audit',icon:'🛡️',label:'Audit Log'}
];
const subjects=['Science','AP','MAPEH','Filipino','Math','TLE'];
export default function AdminApp(){
 const [operator,setOperator]=useState<AdminOperator|null>(null);
 const [blocked,setBlocked]=useState('Checking your admin session…');
 const [tab,setTab]=useState<Tab>('dashboard');
 const [stats,setStats]=useState<AdminStats|null>(null);
 const [facts,setFacts]=useState<FactRow[]>([]);
 const [quizzes,setQuizzes]=useState<QuizRow[]>([]);
 const [queue,setQueue]=useState<{facts:QueueRow[];quizzes:QueueRow[]}>({facts:[],quizzes:[]});
 const [audit,setAudit]=useState<AdminAudit[]>([]);
 const [factDraft,setFactDraft]=useState<FactDraft>(emptyFact);
 const [quizDraft,setQuizDraft]=useState<QuizDraft>(emptyQuiz);
 const [editingFact,setEditingFact]=useState<number|null>(null);
 const [editingQuiz,setEditingQuiz]=useState<number|null>(null);
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const canEdit=Boolean(operator?.roles.some(r=>['SUPER_ADMIN','CONTENT_ADMIN','EDITOR'].includes(r)));
 const canReview=Boolean(operator?.roles.some(r=>['SUPER_ADMIN','CONTENT_ADMIN','REVIEWER'].includes(r)));
 const canPublish=Boolean(operator?.roles.some(r=>['SUPER_ADMIN','CONTENT_ADMIN'].includes(r)));
 const signOut=()=>{const session=accountSession.get();if(!session)return;void logoutAccount(session.token).then(()=>window.location.assign("/admin")).catch(e=>setMessage(e instanceof Error?e.message:"Could not sign out"));};
 const refresh=useCallback(async()=>{
   const [a,b,c,d,e]=await Promise.all([
    platformAdmin.dashboard(),platformAdmin.facts(),platformAdmin.quizzes(),
    platformAdmin.queue(),platformAdmin.audit()]);
   setStats(a);setFacts(b);setQuizzes(c);setQueue(d);setAudit(e);
 },[]);
 useEffect(()=>{
  if(!accountSession.get()){setBlocked('Sign in with an existing provisioned platform-admin account. Public admin registration is disabled.');return;}
  let active=true;
  platformAdmin.me().then(op=>{
   if(!active)return;
   setOperator(op);
   return refresh();
  }).catch(e=>{if(active)setBlocked(e instanceof Error?e.message:'Admin authorization failed');});
  return ()=>{active=false;};
 },[refresh]);
 const run=async(task:()=>Promise<unknown>,done:string)=>{
  if(busy)return;
  setBusy(true);setMessage('');
  try{await task();await refresh();setMessage(done);}
  catch(e){setMessage(e instanceof Error?e.message:'Request failed');}
  finally{setBusy(false);}
 };
 async function editFact(id:number){
  setMessage('');setBusy(true);
  try{
   const record=await platformAdmin.fact(id);
   const tr=record.translations as {locale:string;body:string}[];
   const a=record.audiences as {audience:string;grade:number|null}[];
   const s=record.sources as {title:string;url:string}[];
   setFactDraft({
    key:String(record.key),subject:String(record.subject),emoji:String(record.emoji||'💡'),
    en:tr.find(x=>x.locale==='en')?.body||'',fil:tr.find(x=>x.locale==='fil')?.body||'',
    explore:a.some(x=>x.audience==='EXPLORE'),grades:a.filter(x=>x.audience==='STUDENT').map(x=>x.grade!).filter(Boolean),
    sourceTitle:s[0]?.title||'',sourceUrl:s[0]?.url||''
   });
   setEditingFact(id);
  }catch(e){setMessage(e instanceof Error?e.message:'Could not load draft fact');}
  finally{setBusy(false);}
 }
 async function editQuiz(id:number){
  setMessage('');setBusy(true);
  try{
   const record=await platformAdmin.quiz(id);
   const en=record.translations.find(x=>x.locale==='en');
   const fil=record.translations.find(x=>x.locale==='fil');
   setQuizDraft({
    factId:record.factId,en:en?.prompt||'',fil:fil?.prompt||'',
    explanationEn:en?.explanation||'',explanationFil:fil?.explanation||'',
    choices:record.choices
   });
   setEditingQuiz(id);
   setTab('quizzes');
  }catch(e){setMessage(e instanceof Error?e.message:'Cannot edit quiz');}
  finally{setBusy(false);}
 }
 const changeChoice=(index:number,change:Partial<ChoiceDraft>)=>setQuizDraft(p=>({
  ...p,choices:p.choices.map((choice,i)=>i===index?{...choice,...change}:choice)
 }));
 const statusClass=(status:string)=>'admin-status admin-status-'+status.toLowerCase();
 const reviewItem=(type:'facts'|'quizzes',item:QueueRow)=>{
  const key=type+item.id;
  return <article key={key} className="admin-entry">
   <div><strong>{item.label}</strong><div className={statusClass(item.status)}>{item.status.replace('_',' ')}</div>
    <small>#{item.id} · {type==='facts'?'Fact':'Quiz'}</small></div>
   <div className="admin-review-actions">
    {item.status==='IN_REVIEW'&&canReview&&<>
      {type==='facts'&&<label className="admin-check"><input type="checkbox" checked={Boolean(checked[key])} onChange={e=>setChecked(p=>({...p,[key]:e.target.checked}))}/> Source independently checked</label>}
      <input aria-label={'Review notes for '+key} placeholder="Review note" maxLength={1000} value={reviewNotes[key]||''} onChange={e=>setReviewNotes(p=>({...p,[key]:e.target.value}))}/>
      <button disabled={busy||(type==='facts'&&!checked[key])} onClick={()=>void run(()=>platformAdmin.decide(type,item.id,'approve',Boolean(checked[key]),reviewNotes[key]),'Approved for publishing')}>Approve</button>
      <button disabled={busy} onClick={()=>void run(()=>platformAdmin.decide(type,item.id,'reject',false,reviewNotes[key]),'Returned to draft')}>Reject</button>
    </>}
    {item.status==='APPROVED'&&canPublish&&<button disabled={busy} className="admin-primary" onClick={()=>void run(()=>platformAdmin.decide(type,item.id,'publish'), 'Published after approval')}>Publish</button>}
   </div>
  </article>;
 };
 if(!operator)return <main className="admin-login"><h1>🛡️ Alam Mo Ba? Platform Admin</h1><p role="alert">{blocked}</p><AdminSignIn/><a href="/">Return to learner app</a><p>Admin privileges must be granted through a trusted operator. Learner and guest accounts cannot self-promote.</p></main>;
 return <div className="admin-shell">
  <aside className="admin-side">
   <a className="admin-logo" href="/admin">💡 Alam Mo Ba?<small>Platform administration</small></a>
   <nav aria-label="Platform admin navigation">{tabs.map(x=><button key={x.id} aria-current={tab===x.id?'page':undefined} className={tab===x.id?'selected':''} onClick={()=>{setTab(x.id);setMessage('');}}>{x.icon} {x.label}</button>)}</nav>
   <div className="admin-user"><small>👤 Verified operator</small><strong>{operator.roles.join(' · ')}</strong><a href="/">Learner app ↗</a></div>
  </aside>
  <div className="admin-main">
   <header className="admin-top"><div><small>Content operations</small><h1>{tabs.find(x=>x.id===tab)?.label}</h1></div><div className="admin-top-actions"><span className="admin-restricted-label">🔒 Restricted workspace</span><button type="button" onClick={signOut}>Sign out</button></div></header>
   {message&&<p className="admin-notice" role="status" aria-live="polite">{message}</p>}
   {tab==='dashboard'&&<><div className="admin-stats">{[
    ['Total facts',stats?.facts||0],['Published facts',stats?.publishedFacts||0],
    ['Pending facts',stats?.pendingFacts||0],['Quiz questions',stats?.quizzes||0],
    ['Pending quizzes',stats?.pendingQuizzes||0],['Published quizzes',stats?.publishedQuizzes||0]
   ].map(([name,value])=><section className="admin-stat" key={name}><small>{name}</small><strong>{value}</strong></section>)}</div><section className="admin-panel"><h2>Editorial workflow</h2><p>Authors create drafts. Independent reviewers verify sources, then content managers publish approved content. Only published verified facts and linked quizzes appear in the learner app.</p><button onClick={()=>setTab('reviews')}>Review pending content</button></section></>}
   {tab==='facts'&&<><section className="admin-panel"><h2>{editingFact?'Edit draft fact':'Create fact draft'}</h2>{canEdit?<form onSubmit={e=>{e.preventDefault();void run(async()=>{
    if(editingFact)await platformAdmin.updateFact(editingFact,factDraft);else await platformAdmin.createFact(factDraft);
    setFactDraft(emptyFact);setEditingFact(null);
   },'Fact draft saved');}}>
    <div className="admin-formgrid"><label>Fact key<input required maxLength={128} value={factDraft.key} onChange={e=>setFactDraft(p=>({...p,key:e.target.value}))}/></label><label>Subject<select value={factDraft.subject} onChange={e=>setFactDraft(p=>({...p,subject:e.target.value}))}>{subjects.map(s=><option key={s}>{s}</option>)}</select></label><label>Emoji<input value={factDraft.emoji} maxLength={24} onChange={e=>setFactDraft(p=>({...p,emoji:e.target.value}))}/></label></div>
    <label>English explanation<textarea required rows={3} value={factDraft.en} onChange={e=>setFactDraft(p=>({...p,en:e.target.value}))}/></label><label>Filipino explanation<textarea required rows={3} value={factDraft.fil} onChange={e=>setFactDraft(p=>({...p,fil:e.target.value}))}/></label>
    <label>Source title<input required value={factDraft.sourceTitle} onChange={e=>setFactDraft(p=>({...p,sourceTitle:e.target.value}))}/></label><label>Source URL (HTTPS)<input required type="url" value={factDraft.sourceUrl} onChange={e=>setFactDraft(p=>({...p,sourceUrl:e.target.value}))}/></label>
    <div className="admin-formgrid"><label className="admin-check"><input type="checkbox" checked={factDraft.explore} onChange={e=>setFactDraft(p=>({...p,explore:e.target.checked}))}/> Explore mode</label>{[7,8,9].map(grade=><label className="admin-check" key={grade}><input type="checkbox" checked={factDraft.grades.includes(grade)} onChange={e=>setFactDraft(p=>({...p,grades:e.target.checked?[...p.grades,grade]:p.grades.filter(x=>x!==grade)}))}/> Grade {grade}</label>)}</div>
    <button className="admin-primary" type="submit" disabled={busy}>Save draft</button> {editingFact&&<button type="button" onClick={()=>{setEditingFact(null);setFactDraft(emptyFact);}}>Cancel editing</button>}
   </form>:<p>Read-only access. An editor role is required.</p>}</section>
   <section className="admin-panel"><h2>Facts</h2>{facts.length?facts.map(f=><article className="admin-entry" key={f.id}><div><strong>{f.emoji} {f.key}</strong><small>{f.subject} · #{f.id}</small><div className={statusClass(f.status)}>{f.status}</div></div><div className="admin-review-actions">{canEdit&&f.status==='DRAFT'&&<button disabled={busy} onClick={()=>void editFact(f.id)}>Edit</button>}{canEdit&&f.status==='DRAFT'&&<button disabled={busy} onClick={()=>void run(()=>platformAdmin.decide('facts',f.id,'submit'),'Fact sent to review')}>Submit for review</button>}{canPublish&&f.status==='PUBLISHED'&&<button disabled={busy} onClick={()=>void run(()=>platformAdmin.decide('facts',f.id,'retire'),'Fact retired')}>Retire</button>}</div></article>):<p>No facts yet.</p>}</section></>}
   {tab==='quizzes'&&<><section className="admin-panel"><h2>{editingQuiz?'Edit quiz draft':'Create quiz draft'}</h2>{canEdit?<form onSubmit={e=>{e.preventDefault();void run(async()=>{
    if(editingQuiz)await platformAdmin.updateQuiz(editingQuiz,quizDraft);else await platformAdmin.createQuiz(quizDraft);
    setQuizDraft(emptyQuiz);setEditingQuiz(null);
   },'Quiz draft saved');}}>
    <label>Linked fact<select value={quizDraft.factId} required onChange={e=>setQuizDraft(p=>({...p,factId:Number(e.target.value)}))}><option value={0}>Select parent fact</option>{facts.map(f=><option key={f.id} value={f.id}>{f.key} ({f.status})</option>)}</select></label>
    <div className="admin-formgrid"><label>Question (English)<textarea required rows={2} value={quizDraft.en} onChange={e=>setQuizDraft(p=>({...p,en:e.target.value}))}/></label><label>Question (Filipino)<textarea required rows={2} value={quizDraft.fil} onChange={e=>setQuizDraft(p=>({...p,fil:e.target.value}))}/></label><label>Explanation (English)<textarea required value={quizDraft.explanationEn} onChange={e=>setQuizDraft(p=>({...p,explanationEn:e.target.value}))}/></label><label>Explanation (Filipino)<textarea required value={quizDraft.explanationFil} onChange={e=>setQuizDraft(p=>({...p,explanationFil:e.target.value}))}/></label></div>
    <h3>Answer choices</h3>{quizDraft.choices.map((choice,i)=><div className="admin-choice" key={i}><label>Choice {i+1} EN<input required value={choice.en} onChange={e=>changeChoice(i,{en:e.target.value})}/></label><label>FIL<input required value={choice.fil} onChange={e=>changeChoice(i,{fil:e.target.value})}/></label><label className="admin-check"><input type="radio" name="correctOption" checked={choice.correct} onChange={()=>setQuizDraft(p=>({...p,choices:p.choices.map((x,j)=>({...x,correct:i===j}))}))}/> Correct</label></div>)}
    <div className="admin-review-actions"><button type="button" disabled={quizDraft.choices.length>=6} onClick={()=>setQuizDraft(p=>({...p,choices:[...p.choices,{en:'',fil:'',correct:false}]}))}>Add choice</button><button type="button" disabled={quizDraft.choices.length<=2} onClick={()=>setQuizDraft(p=>({...p,choices:p.choices.slice(0,-1).map((x,i)=>({...x,correct:i===0&&p.choices.at(-1)?.correct?true:x.correct}))}))}>Remove last</button><button className="admin-primary" type="submit" disabled={busy||!quizDraft.factId}>Save quiz draft</button> {editingQuiz&&<button type="button" onClick={()=>{setEditingQuiz(null);setQuizDraft(emptyQuiz);}}>Cancel editing</button>}</div>
   </form>:<p>Read-only access.</p>}</section><section className="admin-panel"><h2>Question bank</h2>{quizzes.map(q=><article className="admin-entry" key={q.id}><div><strong>{q.prompt}</strong><small>Question #{q.id} · Fact #{q.factId}</small><div className={statusClass(q.status)}>{q.status}</div></div><div className="admin-review-actions">{canEdit&&q.status==='DRAFT'&&<button disabled={busy} onClick={()=>void editQuiz(q.id)}>Edit</button>}{canEdit&&q.status==='DRAFT'&&<button disabled={busy} onClick={()=>void run(()=>platformAdmin.decide('quizzes',q.id,'submit'),'Quiz submitted for review')}>Submit</button>}{canPublish&&q.status==='PUBLISHED'&&<button disabled={busy} onClick={()=>void run(()=>platformAdmin.decide('quizzes',q.id,'retire'),'Quiz retired')}>Retire</button>}</div></article>)}</section></>}
   {tab==='reviews'&&<section className="admin-panel"><h2>Pending approvals</h2><p>Authors cannot approve their own content. Reviewers must explicitly check fact sources before approval.</p><h3>Facts</h3>{queue.facts.map(q=>reviewItem('facts',q))}<h3>Quizzes</h3>{queue.quizzes.map(q=>reviewItem('quizzes',q))}{!queue.facts.length&&!queue.quizzes.length&&<p>No pending reviews.</p>}</section>}
   {tab==='audit'&&<section className="admin-panel"><h2>Editorial activity</h2>{audit.map((entry,i)=><article className="admin-entry" key={i}><div><strong>{entry.type} #{entry.id} · {entry.action}</strong><small>{entry.at} · {entry.actorId}</small><div>{entry.from||'—'} → {entry.to||'—'}</div><p>{entry.note}</p></div></article>)}{!audit.length&&<p>No recorded events.</p>}</section>}
  </div>
 </div>;
}
