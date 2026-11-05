import {useCallback,useEffect,useState} from 'react';
import {adminApi,adminRequest} from './adminApi';
import AdminLogin from './AdminLogin';
import type {AdminMe,Fact,FactDraft,ManagedAccount,ManagedRole,Overview,QuestionDraft,QuestionSummary,QueueEntry,SeedCatalogItem} from './adminApi';
import {accountSession,logoutAccount} from '../lib/accountSync';
import './admin.css';

type View='dashboard'|'facts'|'questions'|'review'|'access';
const adminRequestVerify=(id:number)=>adminRequest<{id:number;sourceVerified:boolean}>('/workflow/fact/'+id+'/verify-source',{method:'POST'});
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
 const [selectedFactIds,setSelectedFactIds]=useState<number[]>([]);
 const [questions,setQuestions]=useState<QuestionSummary[]>([]);
 const [selectedQuestionIds,setSelectedQuestionIds]=useState<number[]>([]);
 const [queue,setQueue]=useState<QueueEntry[]>([]);
 const [reviewIndex,setReviewIndex]=useState(0);
 const [reviewView,setReviewView]=useState<'wizard'|'bulk-review'|'bulk-publish'>('wizard');
 const [selectedReviewKeys,setSelectedReviewKeys]=useState<string[]>([]);
 const [selectedPublishKeys,setSelectedPublishKeys]=useState<string[]>([]);
 const [verifiedSources,setVerifiedSources]=useState<Record<number,boolean>>({});
 const [managedAccounts,setManagedAccounts]=useState<ManagedAccount[]>([]);
 const [roleAccountId,setRoleAccountId]=useState('');
 const [accountSearch,setAccountSearch]=useState('');
 const [roleName,setRoleName]=useState<ManagedRole>('REVIEWER');
 const [roleAction,setRoleAction]=useState<'GRANT'|'REVOKE'>('GRANT');
 const [roleReason,setRoleReason]=useState('');
 const [factForm,setFactForm]=useState<FactDraft>(emptyFact);
 const [quizForm,setQuizForm]=useState<QuestionDraft>(emptyQuiz);
 const [editingFact,setEditingFact]=useState<number|null>(null);
 const [editingQuestion,setEditingQuestion]=useState<number|null>(null);
 const [showFact,setShowFact]=useState(false);
 const [showQuiz,setShowQuiz]=useState(false);
 const [showSeedCatalog,setShowSeedCatalog]=useState(false);
 const [seedCatalog,setSeedCatalog]=useState<SeedCatalogItem[]>([]);
 const [selectedSeedIds,setSelectedSeedIds]=useState<string[]>([]);
 const [seedSearch,setSeedSearch]=useState('');
 const [seedCategory,setSeedCategory]=useState('All categories');
 const [loadingSeedCatalog,setLoadingSeedCatalog]=useState(false);
 const [error,setError]=useState('');
 const [toast,setToast]=useState<{kind:'error'|'success';text:string}|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [backendUnavailable,setBackendUnavailable]=useState(false);
 const [signingOut,setSigningOut]=useState(false);
 const [accountMenuOpen,setAccountMenuOpen]=useState(false);
 const roles=me?.roles||[];
 const seedCategories=['All categories',...Array.from(new Set(seedCatalog.map(item=>item.category))).sort()];
 const visibleSeedCatalog=seedCatalog.filter(item=>(seedCategory==='All categories'||item.category===seedCategory)&&`${item.title} ${item.category} ${item.subject} ${item.grade} ${item.factEn} ${item.factFil} ${item.sourceTitle}`.toLocaleLowerCase().includes(seedSearch.trim().toLocaleLowerCase()));
 const allVisibleSeedsSelected=visibleSeedCatalog.length>0&&visibleSeedCatalog.every(item=>selectedSeedIds.includes(item.id));
 const allowed=(...r:string[])=>roles.includes('SUPER_ADMIN')||r.some(role=>roles.includes(role as typeof roles[number]));
 const refresh=useCallback(async()=>{
  const [overview,factRows,questionRows,review]=await Promise.all([
   adminApi.overview(),adminApi.facts(),adminApi.questions(),
   adminApi.queue().catch(()=>[] as QueueEntry[])
  ]);
  setStats(overview);setFacts(factRows);setQuestions(questionRows);setQueue(review);
  setSelectedFactIds(selected=>selected.filter(id=>factRows.some(f=>f.id===id&&f.status==='DRAFT')));
  setSelectedQuestionIds(selected=>selected.filter(id=>questionRows.some(q=>q.id===id&&q.status==='DRAFT')));
  setSelectedReviewKeys(selected=>selected.filter(key=>review.some(item=>`${item.type}:${item.id}`===key&&item.status==='IN_REVIEW')));
  setSelectedPublishKeys(selected=>selected.filter(key=>review.some(item=>`${item.type}:${item.id}`===key&&item.status==='APPROVED')));
 },[]);
 const validateSession=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const result=await adminApi.me();setMe(result);await refresh();setBackendUnavailable(false);
  }catch(e){
   const networkFailure=e instanceof TypeError;
   if(accountSession.get()&&networkFailure){setBackendUnavailable(true);setError('The backend is unavailable. Your saved admin session is still on this tab.');}
   else{setBackendUnavailable(false);setError(e instanceof Error?e.message:'Admin access unavailable');}
  }finally{setLoading(false);}
 },[refresh]);
 useEffect(()=>{void validateSession();},[validateSession]);
 useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),6000);return()=>window.clearTimeout(timer);},[toast]);
 useEffect(()=>{if(!accountMenuOpen)return;const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setAccountMenuOpen(false);};
  window.addEventListener('keydown',closeOnEscape);return()=>window.removeEventListener('keydown',closeOnEscape);},[accountMenuOpen]);
 const run=async(task:()=>Promise<unknown>,success:string)=>{
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{const result=await task();await refresh();const text=typeof result==='string'?result:success;setMessage(text);setToast({kind:'success',text});}
  catch(e){const text=e instanceof Error?e.message:'Request failed';setError(text);setToast({kind:'error',text});}
  finally{setBusy(false);}
 };
 const draftFacts=facts.filter(f=>f.status==='DRAFT');
 const allDraftFactsSelected=draftFacts.length>0&&draftFacts.every(f=>selectedFactIds.includes(f.id));
 const toggleFactSelection=(id:number)=>setSelectedFactIds(selected=>selected.includes(id)?selected.filter(value=>value!==id):[...selected,id]);
 const toggleAllDraftFacts=()=>setSelectedFactIds(allDraftFactsSelected?[]:draftFacts.map(f=>f.id));
 const submitSelectedFacts=()=>void run(async()=>{
  let submitted=0;const failures:string[]=[];
  for(const id of selectedFactIds){
   try{await adminApi.transition('fact',id,'submit');submitted++;}
   catch(e){failures.push(e instanceof Error?e.message:`Fact #${id} failed`);}
  }
  setSelectedFactIds([]);
  if(failures.length){await refresh();throw new Error(`Submitted ${submitted} fact${submitted===1?'':'s'}; ${failures.length} failed. ${failures[0]}`);}
  return `Submitted ${submitted} fact${submitted===1?'':'s'} for review.`;
 },'Selected facts submitted for review');
 const draftQuestions=questions.filter(q=>q.status==='DRAFT');
 const allDraftQuestionsSelected=draftQuestions.length>0&&draftQuestions.every(q=>selectedQuestionIds.includes(q.id));
 const toggleQuestionSelection=(id:number)=>setSelectedQuestionIds(selected=>selected.includes(id)?selected.filter(value=>value!==id):[...selected,id]);
 const toggleAllDraftQuestions=()=>setSelectedQuestionIds(allDraftQuestionsSelected?[]:draftQuestions.map(q=>q.id));
 const submitSelectedQuestions=()=>void run(async()=>{
  let submitted=0;const failures:string[]=[];
  for(const id of selectedQuestionIds){
   try{await adminApi.transition('question',id,'submit');submitted++;}
   catch(e){failures.push(e instanceof Error?e.message:`Question #${id} failed`);}
  }
  setSelectedQuestionIds([]);
  if(failures.length){await refresh();throw new Error(`Submitted ${submitted} question${submitted===1?'':'s'}; ${failures.length} failed. ${failures[0]}`);}
  return `Submitted ${submitted} quiz question${submitted===1?'':'s'} for review.`;
 },'Selected quiz questions submitted for review');
 const reviewItems=queue.filter(item=>item.status==='IN_REVIEW');
 const selectedReviewItems=reviewItems.filter(item=>selectedReviewKeys.includes(`${item.type}:${item.id}`));
 const allReviewItemsSelected=reviewItems.length>0&&reviewItems.every(item=>selectedReviewKeys.includes(`${item.type}:${item.id}`));
 const sourceIsVerified=(id:number)=>Boolean(facts.find(f=>f.id===id)?.sourceVerified||verifiedSources[id]);
 const selectedUnverifiedFactCount=selectedReviewItems.filter(item=>item.type==='FACT'&&!sourceIsVerified(item.id)).length;
 const selectedFactsNeedingVerification=selectedReviewItems.filter(item=>item.type==='FACT'&&!sourceIsVerified(item.id));
 const canApproveSelected=selectedReviewItems.length>0&&allowed('REVIEWER')&&selectedUnverifiedFactCount===0;
 const toggleReviewItem=(item:QueueEntry)=>{
  const key=`${item.type}:${item.id}`;
  setSelectedReviewKeys(selected=>selected.includes(key)?selected.filter(value=>value!==key):[...selected,key]);
 };
 const toggleAllReviewItems=()=>setSelectedReviewKeys(allReviewItemsSelected?[]:reviewItems.map(item=>`${item.type}:${item.id}`));
 const verifySelectedSources=()=>void run(async()=>{
  let verified=0,alreadyVerified=0;const failures:string[]=[];
  for(const item of selectedReviewItems.filter(value=>value.type==='FACT')){
   const fact=facts.find(value=>value.id===item.id);
   if(sourceIsVerified(item.id)){alreadyVerified++;continue;}
   if(!fact?.sourceUrl){failures.push(`Fact #${item.id} has no source URL.`);continue;}
   try{const result=await adminRequestVerify(item.id);if(result.sourceVerified){setVerifiedSources(value=>({...value,[item.id]:true}));verified++;}else failures.push(`Fact #${item.id} source verification was not recorded.`);}
   catch(e){failures.push(`Fact #${item.id}: ${e instanceof Error?e.message:'verification failed'}`);}
  }
  if(failures.length){await refresh();throw new Error(`Verified ${verified} source${verified===1?'':'s'}; ${failures.length} failed. ${failures[0]}`);}
  return `Verified ${verified} source${verified===1?'':'s'}${alreadyVerified?`; ${alreadyVerified} already verified`:''}.`;
 },'Selected fact sources verified');
 const approveSelectedItems=()=>void run(async()=>{
  let approved=0;const failures:string[]=[];
  for(const item of selectedReviewItems){
   if(item.type==='FACT'&&!sourceIsVerified(item.id)){failures.push(`Fact #${item.id} must have its source verified first.`);continue;}
   try{await adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'approve');approved++;}
   catch(e){failures.push(`${item.type==='FACT'?'Fact':'Question'} #${item.id}: ${e instanceof Error?e.message:'approval failed'}`);}
  }
  if(failures.length){await refresh();throw new Error(`Approved ${approved} item${approved===1?'':'s'}; ${failures.length} could not be approved. ${failures[0]}`);}
  return `Approved ${approved} item${approved===1?'':'s'} for publication.`;
 },'Selected items approved');
 const publishItems=queue.filter(item=>item.status==='APPROVED');
 const selectedPublishItems=publishItems.filter(item=>selectedPublishKeys.includes(`${item.type}:${item.id}`));
 const allPublishItemsSelected=publishItems.length>0&&publishItems.every(item=>selectedPublishKeys.includes(`${item.type}:${item.id}`));
 const togglePublishItem=(item:QueueEntry)=>{
  const key=`${item.type}:${item.id}`;
  setSelectedPublishKeys(selected=>selected.includes(key)?selected.filter(value=>value!==key):[...selected,key]);
 };
 const toggleAllPublishItems=()=>setSelectedPublishKeys(allPublishItemsSelected?[]:publishItems.map(item=>`${item.type}:${item.id}`));
 const publishSelectedItems=()=>void run(async()=>{
  let published=0;const failures:string[]=[];
  for(const item of [...selectedPublishItems].sort((a,b)=>a.type===b.type?0:a.type==='FACT'?-1:1)){
   try{await adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'publish');published++;}
   catch(e){failures.push(`${item.type==='FACT'?'Fact':'Question'} #${item.id}: ${e instanceof Error?e.message:'publication failed'}`);}
  }
  if(failures.length){await refresh();throw new Error(`Published ${published} item${published===1?'':'s'}; ${failures.length} could not be published. ${failures[0]}`);}
  return `Published ${published} item${published===1?'':'s'} to learners.`;
 },'Selected content published to learners');
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
 if(backendUnavailable&&accountSession.get())return <main className="admin-gate"><div className="gate-icon">⏳</div><h1>Backend unavailable</h1>
  <p>{error||'The server could not be reached.'}</p><p>Your saved admin session is preserved. Reconnect the backend, then retry.</p>
  <button className="admin-primary" onClick={()=>void validateSession()}>Retry connection</button>
  <button onClick={()=>void signOut()}>Sign out</button><a href="/">Return to learner app</a></main>;
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
    <small>{roles.join(' · ')}</small>
    <a href="/">← Learner application</a></div>
  </aside>
  <main className="admin-main">
   <header className="admin-top">
    <div><span className="breadcrumb">Platform / {tabs.find(t=>t.id===view)?.title}</span>
     <h1>{tabs.find(t=>t.id===view)?.title}</h1>
     <p>{tabs.find(t=>t.id===view)?.subtitle}</p></div>
    <div className="admin-user"><span><b>Administrator</b><small>{roles[0]}</small></span>
     <button className="avatar" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={()=>setAccountMenuOpen(open=>!open)}>A</button></div>
   </header>
   {accountMenuOpen&&<><button className="account-menu-backdrop" aria-label="Close account menu" onClick={()=>setAccountMenuOpen(false)}/>
    <div className="account-menu" role="menu"><div className="account-menu-heading"><span className="avatar">A</span><span><b>Administrator</b><small>{roles.join(' · ')}</small></span></div>
     <button role="menuitem" disabled={signingOut} onClick={()=>{setAccountMenuOpen(false);void signOut();}}>{signingOut?'Signing out…':'Sign out'}</button>
    </div></>}
   {error&&<p role="alert" className="admin-error">{error}</p>}
   {message&&<p role="status" className="admin-success">{message}</p>}
   {toast&&<div className={`admin-toast toast-${toast.kind}`} role={toast.kind==='error'?'alert':'status'}>
    <span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}>×</button>
   </div>}
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
    {allowed('EDITOR','CONTENT_ADMIN')&&<button disabled={busy} onClick={()=>{
     setLoadingSeedCatalog(true);setSelectedSeedIds([]);setShowSeedCatalog(true);
     void adminApi.seedCatalog().then(setSeedCatalog).catch(e=>setError(e instanceof Error?e.message:'Could not load seed catalog'))
      .finally(()=>setLoadingSeedCatalog(false));
    }}>Seed starter facts + quizzes</button>}
    {allowed('EDITOR','CONTENT_ADMIN')&&<button className="admin-primary" onClick={()=>{setEditingFact(null);setFactForm(emptyFact());setShowFact(true);}}>+ Add fact</button>}
    </div></div>
    {allowed('EDITOR','CONTENT_ADMIN')&&<div className="bulk-submit-bar"><label><input type="checkbox" aria-label="Select all draft facts" checked={allDraftFactsSelected} disabled={!draftFacts.length||busy} onChange={toggleAllDraftFacts}/>Select all drafts</label><span>{selectedFactIds.length} selected · {draftFacts.length} drafts ready</span><button className="admin-primary" disabled={!selectedFactIds.length||busy} onClick={submitSelectedFacts}>Submit selected ({selectedFactIds.length})</button></div>}
    <p className="bulk-submit-hint">Only draft facts can be submitted. Facts already in review are waiting in the Review Queue.</p>
    <div className="admin-scroll"><table><thead><tr><th>Select</th><th>Fact</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{facts.map(f=><tr key={f.id}><td><input className="fact-select" type="checkbox" aria-label={`Select fact ${f.key}`} checked={selectedFactIds.includes(f.id)} disabled={f.status!=='DRAFT'||busy||!allowed('EDITOR','CONTENT_ADMIN')} onChange={()=>toggleFactSelection(f.id)}/></td><td><b>{f.emoji} {f.en||f.key}</b><small>{f.key}</small></td><td>{f.subject}</td>
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
      {allowed('CONTENT_ADMIN')&&f.status==='RETIRED'&&<button disabled={busy} className="admin-primary" onClick={()=>{
       if(window.confirm('Republish this retired fact? It will become available to learners again.'))
        void run(()=>adminApi.transition('fact',f.id,'republish'),'Fact restored and republished');
      }}>Republish</button>}
      </td></tr>)}</tbody></table></div>{!facts.length&&<p>No content yet. Create your first bilingual fact.</p>}</section>}
   {view==='questions'&&<section className="admin-panel"><div className="panel-head"><h2>Question bank</h2>
    {allowed('EDITOR','CONTENT_ADMIN')&&<button className="admin-primary" onClick={()=>{setEditingQuestion(null);setQuizForm(emptyQuiz());setShowQuiz(true);}}>+ Add question</button>}</div>
    {allowed('EDITOR','CONTENT_ADMIN')&&<div className="bulk-submit-bar"><label><input type="checkbox" aria-label="Select all draft quiz questions" checked={allDraftQuestionsSelected} disabled={!draftQuestions.length||busy} onChange={toggleAllDraftQuestions}/>Select all drafts</label><span>{selectedQuestionIds.length} selected · {draftQuestions.length} drafts ready</span><button className="admin-primary" disabled={!selectedQuestionIds.length||busy} onClick={submitSelectedQuestions}>Submit selected ({selectedQuestionIds.length})</button></div>}
    <p className="bulk-submit-hint">Only draft questions can be submitted. Questions already in review are waiting in the Review Queue.</p>
    <div className="admin-scroll"><table><thead><tr><th>Select</th><th>Question</th><th>Linked fact</th><th>Status</th><th>Actions</th></tr></thead><tbody>
     {questions.map(q=><tr key={q.id}><td><input className="fact-select" type="checkbox" aria-label={`Select question ${q.id}`} checked={selectedQuestionIds.includes(q.id)} disabled={q.status!=='DRAFT'||busy||!allowed('EDITOR','CONTENT_ADMIN')} onChange={()=>toggleQuestionSelection(q.id)}/></td><td>{q.prompt}</td><td>#{q.factId}</td><td><Status value={q.status}/></td><td>
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
      {allowed('CONTENT_ADMIN')&&q.status==='RETIRED'&&<button disabled={busy} className="admin-primary" onClick={()=>{
       if(window.confirm('Republish this retired quiz question? It will become available to learners again.'))
        void run(()=>adminApi.transition('question',q.id,'republish'),'Quiz question restored and republished');
      }}>Republish</button>}
     </td></tr>)}</tbody></table></div>{!questions.length&&<p>No quiz questions created yet.</p>}</section>}
   {view==='review'&&<section className="admin-panel review-wizard"><div className="panel-head"><div><h2>Review and publication queue</h2><span className="review-progress">{reviewView==='bulk-review'?`${reviewItems.length} items awaiting review`:reviewView==='bulk-publish'?`${publishItems.length} approved and ready to publish`:queue.length?`Item ${Math.min(reviewIndex+1,queue.length)} of ${queue.length}`:'0 items'}</span></div>
    <div className="review-view-tools"><div className="review-view-toggle" role="group" aria-label="Review queue view"><button aria-pressed={reviewView==='wizard'} className={reviewView==='wizard'?'selected':''} onClick={()=>setReviewView('wizard')}>Wizard view</button><button aria-pressed={reviewView==='bulk-review'} className={reviewView==='bulk-review'?'selected':''} onClick={()=>setReviewView('bulk-review')}>Bulk review</button><button aria-pressed={reviewView==='bulk-publish'} className={reviewView==='bulk-publish'?'selected':''} disabled={!allowed('CONTENT_ADMIN')} onClick={()=>setReviewView('bulk-publish')}>Ready to publish ({publishItems.length})</button></div>
    {reviewView==='wizard'&&queue.length>0&&<div className="wizard-controls"><button disabled={reviewIndex===0} onClick={()=>setReviewIndex(index=>Math.max(0,index-1))}>← Previous</button><button disabled={reviewIndex>=queue.length-1} onClick={()=>setReviewIndex(index=>Math.min(queue.length-1,index+1))}>Next →</button></div>}</div></div>
    {!allowed('REVIEWER','CONTENT_ADMIN')?<p>Review Queue requires the REVIEWER, CONTENT_ADMIN, or SUPER_ADMIN role.</p>:<>
     {allowed('CONTENT_ADMIN')&&!allowed('REVIEWER')&&<p className="review-meta">You can publish approved content here. A REVIEWER or SUPER_ADMIN must verify and approve items that are still in review.</p>}
     {reviewView==='bulk-review'&&<>
      <p className="review-meta">Select items to process in a batch. Verify selected fact sources first, then approve the selected facts and questions. Independent review and author checks still apply.</p>
      <div className="review-bulk-toolbar"><label><input type="checkbox" aria-label="Select all in-review items" checked={allReviewItemsSelected} disabled={!reviewItems.length||busy} onChange={toggleAllReviewItems}/>Select all in-review</label><span>{selectedReviewItems.length} selected · {reviewItems.length} awaiting review</span>
       {allowed('REVIEWER')&&<><button disabled={!selectedFactsNeedingVerification.length||busy} onClick={verifySelectedSources}>Verify selected fact sources ({selectedFactsNeedingVerification.length})</button><button className="admin-primary" disabled={!canApproveSelected||busy} onClick={approveSelectedItems}>Approve selected ({selectedReviewItems.length})</button></>}
      </div>
      {allowed('REVIEWER')&&selectedUnverifiedFactCount>0&&<p className="review-meta">Verify all selected fact sources before the approval button becomes available.</p>}
      {!allowed('REVIEWER')&&<p className="review-meta">Only REVIEWER or SUPER_ADMIN can verify sources and approve items. CONTENT_ADMIN can publish approved items in Wizard view.</p>}
      <div className="review-bulk-list">{reviewItems.map(item=>{
       const linkedQuestion=item.type==='QUESTION'?questions.find(q=>q.id===item.id):undefined;
       const fact=item.type==='FACT'?facts.find(f=>f.id===item.id):facts.find(f=>f.id===linkedQuestion?.factId);
       const key=`${item.type}:${item.id}`;
       return <article className="review-bulk-card" key={key}>
        <input type="checkbox" aria-label={`Select ${item.type==='FACT'?'fact':'quiz question'} ${item.id}`} checked={selectedReviewKeys.includes(key)} disabled={busy} onChange={()=>toggleReviewItem(item)}/>
        <div className="review-bulk-content"><div className="review-bulk-heading"><strong>{item.type==='FACT'?'Fact':'Quiz question'} · #{item.id}</strong><Status value={item.status}/></div>
         {item.type==='FACT'&&fact&&<div className="review-copy"><p><b>English</b><br/>{fact.en||'No English text provided.'}</p><p><b>Filipino</b><br/>{fact.fil||'No Filipino translation provided.'}</p><p className="review-meta">{fact.subject}{fact.key?` · ${fact.key}`:''}</p><p><b>Source:</b> {fact.sourceTitle||'No source title'} {fact.sourceUrl&&<a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">Open source ↗</a>}</p><p className="review-meta">{sourceIsVerified(item.id)?'Source verified.':'Source not yet verified.'}</p></div>}
         {item.type==='QUESTION'&&<QuestionReview questionId={item.id} linkedFact={fact}/>}
        </div>
       </article>;
      })}{!reviewItems.length&&<p>No items are awaiting editorial review.</p>}</div>
     </>}
     {reviewView==='bulk-publish'&&<>
      <p className="review-meta">Approved items appear here for CONTENT_ADMIN or SUPER_ADMIN publication. Each item is checked by the server before it becomes visible to learners.</p>
      {allowed('CONTENT_ADMIN')&&<div className="review-bulk-toolbar"><label><input type="checkbox" aria-label="Select all approved items ready to publish" checked={allPublishItemsSelected} disabled={!publishItems.length||busy} onChange={toggleAllPublishItems}/>Select all approved</label><span>{selectedPublishItems.length} selected · {publishItems.length} approved</span><button className="admin-primary" disabled={!selectedPublishItems.length||busy} onClick={publishSelectedItems}>Publish selected ({selectedPublishItems.length})</button></div>}
      {!allowed('CONTENT_ADMIN')&&<p className="review-meta">Publishing requires the CONTENT_ADMIN or SUPER_ADMIN role.</p>}
      <div className="review-bulk-list">{publishItems.map(item=>{
       const linkedQuestion=item.type==='QUESTION'?questions.find(q=>q.id===item.id):undefined;
       const fact=item.type==='FACT'?facts.find(f=>f.id===item.id):facts.find(f=>f.id===linkedQuestion?.factId);
       const key=`${item.type}:${item.id}`;
       return <article className="review-bulk-card" key={key}>
        {allowed('CONTENT_ADMIN')&&<input type="checkbox" aria-label={`Select approved ${item.type==='FACT'?'fact':'quiz question'} ${item.id}`} checked={selectedPublishKeys.includes(key)} disabled={busy} onChange={()=>togglePublishItem(item)}/>}
        <div className="review-bulk-content"><div className="review-bulk-heading"><strong>{item.type==='FACT'?'Fact':'Quiz question'} · #{item.id}</strong><Status value={item.status}/></div>
         {item.type==='FACT'&&fact&&<div className="review-copy"><p><b>English</b><br/>{fact.en||'No English text provided.'}</p><p><b>Filipino</b><br/>{fact.fil||'No Filipino translation provided.'}</p><p className="review-meta">{fact.subject}{fact.key?` · ${fact.key}`:''}</p></div>}
         {item.type==='QUESTION'&&<QuestionReview questionId={item.id} linkedFact={fact}/>}
        </div>
       </article>;
      })}{!publishItems.length&&<p>No approved items are waiting for publication.</p>}</div>
     </>}
     <div className="review-list" hidden={reviewView!=='wizard'}>{queue.slice(Math.min(reviewIndex,Math.max(0,queue.length-1)),Math.min(reviewIndex,Math.max(0,queue.length-1))+1).map(item=>{
     const fact=item.type==='FACT'?facts.find(f=>f.id===item.id):facts.find(f=>f.id===questions.find(q=>q.id===item.id)?.factId);
     const sourceVerified=Boolean(fact?.sourceVerified||verifiedSources[item.id]);
     return <article className="review-item" key={item.type+item.id}>
      <div className="review-item-head"><div><span className="review-type">{item.type==='FACT'?'Fact':'Quiz question'} · #{item.id}</span>
       <Status value={item.status}/></div></div>
      {item.type==='FACT'&&fact&&<div className="review-copy">
       <p><b>English</b><br/>{fact.en||'No English text provided.'}</p>
       <p><b>Filipino</b><br/>{fact.fil||'No Filipino translation provided.'}</p>
       <p className="review-meta">{fact.subject}{fact.key?` · ${fact.key}`:''}</p>
       <p><b>Source:</b> {fact.sourceTitle||'No source title'} {fact.sourceUrl&&<a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">Open source ↗</a>}</p>
       <p className="review-meta">{sourceVerified?'Source verified by an independent reviewer.':'Source not yet verified. A reviewer other than the author must verify it before approval.'}</p>
      </div>}
      {item.type==='QUESTION'&&<QuestionReview questionId={item.id} linkedFact={fact}/>}
      {item.status==='IN_REVIEW'&&allowed('REVIEWER')&&<div className="review-actions">
       {item.type==='FACT'&&<button disabled={busy||sourceVerified||!fact?.sourceUrl} onClick={()=>{
        void run(async()=>{const result=await adminRequestVerify(item.id);if(result.sourceVerified)setVerifiedSources(value=>({...value,[item.id]:true}));return result;},'Source verification recorded');
       }}>{sourceVerified?'Source verified':'Verify source'}</button>}
       <button disabled={busy} onClick={()=>{
        if(item.type==='FACT'&&!sourceVerified){const text='Verify the source first. A reviewer other than the author must record that check.';setError(text);setToast({kind:'error',text});return;}
        void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'approve'),'Independent review approved');
       }}>Approve</button>
       <button disabled={busy} onClick={()=>void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'reject'),'Returned to draft')}>Reject</button>
      </div>}
      {item.status==='APPROVED'&&allowed('CONTENT_ADMIN')&&<div className="review-actions"><button disabled={busy} className="admin-primary" onClick={()=>void run(()=>adminApi.transition(item.type.toLowerCase() as 'fact'|'question',item.id,'publish'),'Published to learners')}>Publish</button></div>}
     </article>;
    })}{!queue.length&&<p>No items are awaiting editorial action.</p>}</div>
     {!!queue.length&&reviewView==='wizard'&&<div className="wizard-footer"><span>{queue[reviewIndex]?.type==='FACT'?'Review the fact and source before deciding.':'Review the question, linked fact, and answer choices before deciding.'}</span>
      <div className="wizard-controls"><button disabled={reviewIndex===0} onClick={()=>setReviewIndex(index=>Math.max(0,index-1))}>← Previous</button><button disabled={reviewIndex>=queue.length-1} onClick={()=>setReviewIndex(index=>Math.min(queue.length-1,index+1))}>Next →</button></div>
     </div>}</>}</section>}
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
      <label>Find account by email<input type="search" value={accountSearch} placeholder="Search verified Google email" onChange={event=>setAccountSearch(event.target.value)}/></label>
      <label>Account<select required value={roleAccountId} onChange={event=>setRoleAccountId(event.target.value)}>
       <option value="">Select an account</option>{managedAccounts.filter(account=>account.email&&account.email.toLowerCase().includes(accountSearch.trim().toLowerCase())).map(account=><option key={account.accountId} value={account.accountId}>{account.email} · {account.roles.length?account.roles.join(', '):'Learner'}</option>)}
      </select></label>
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
     <p>Choose accounts by their verified Google email. Accounts without a verified email must sign in again with Google. Showing the 100 most recently created accounts.</p>
     <div className="admin-scroll"><table><thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Roles</th><th>Action</th></tr></thead><tbody>
      {managedAccounts.map(account=><tr key={account.accountId}><td>{account.email||<span className="muted">Email unavailable — sign in again</span>}</td><td>{account.status}</td>
       <td>{new Date(account.createdAt).toLocaleString()}</td><td>{account.roles.length?account.roles.join(' · '):'Learner'}</td>
       <td><button disabled={!account.email} onClick={()=>{setRoleAccountId(account.accountId);setAccountSearch(account.email||'');}}>Select</button></td></tr>)}
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
     {[7,8,9,10,11,12].map(g=><option key={g} value={g}>{g}</option>)}</select></label>}</div>
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
  {showSeedCatalog&&<div className="admin-modal-bg" role="presentation"><section className="admin-modal seed-modal" role="dialog" aria-modal="true" aria-labelledby="seed-title">
   <div className="panel-head"><div><h2 id="seed-title">Choose starter content</h2><p>Select facts and their linked quiz questions to add as drafts.</p></div>
    <button type="button" onClick={()=>setShowSeedCatalog(false)}>✕</button></div>
   {loadingSeedCatalog?<p>Loading catalog…</p>:<>
     <div className="seed-catalog-toolbar"><label>Search facts, topics, or source<input type="search" value={seedSearch} placeholder="e.g. water, Moon, weather" onChange={event=>setSeedSearch(event.target.value)}/></label>
     <label>Category<select value={seedCategory} onChange={event=>setSeedCategory(event.target.value)}>{seedCategories.map(category=><option key={category}>{category}</option>)}</select></label>
     <button type="button" onClick={()=>setSelectedSeedIds(ids=>allVisibleSeedsSelected?ids.filter(id=>!visibleSeedCatalog.some(item=>item.id===id)):[...new Set([...ids,...visibleSeedCatalog.map(item=>item.id)])])}>{allVisibleSeedsSelected?'Deselect visible':'Select visible'}</button>
     <small>Showing {visibleSeedCatalog.length} of {seedCatalog.length} · {selectedSeedIds.length} selected</small></div>
    <div className="seed-catalog-list">{visibleSeedCatalog.map(item=><label className="seed-catalog-card" key={item.id}>
     <input type="checkbox" checked={selectedSeedIds.includes(item.id)} onChange={event=>setSelectedSeedIds(ids=>event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>
     <span><b>{item.emoji} {item.title}</b><small>{item.category} · {item.subject} · Grade {item.grade}</small>
      <span className="seed-preview"><b>Fact (EN)</b>{item.factEn}<b>Fact (Filipino)</b>{item.factFil}
       <b>Quiz</b>{item.quizEn}<span>{item.quizFil}</span></span><small>Source: {item.sourceTitle}</small>
     </span>
    </label>)}</div>
    {!seedCatalog.length&&<p>All starter catalog facts are already in your facts library.</p>}
    {seedCatalog.length>0&&!visibleSeedCatalog.length&&<p>No catalog items match that search.</p>}
   </>}
   <div className="admin-modal-actions"><button type="button" onClick={()=>setShowSeedCatalog(false)}>Cancel</button>
    <button className="admin-primary" disabled={busy||loadingSeedCatalog||!selectedSeedIds.length} onClick={()=>void run(async()=>{
     const result=await adminApi.seedContent(selectedSeedIds);setShowSeedCatalog(false);
     return `Seeded ${result.factsCreated} facts and ${result.quizzesCreated} quiz drafts${result.skipped?`; skipped ${result.skipped} items already linked to a quiz`:''}.`;
    },'Selected starter content added as drafts.')}>Seed selected ({selectedSeedIds.length})</button></div>
  </section></div>}
 </div>;
}
function Status({value}:{value:string}){return <span className={'admin-status status-'+value.toLowerCase()}>{value.replace('_',' ')}</span>;}

function QuestionReview({questionId,linkedFact}:{questionId:number;linkedFact:Fact|undefined}){
 const [detail,setDetail]=useState<Record<string,unknown>|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;adminApi.question(questionId).then(value=>{if(live)setDetail(value);})
  .catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load quiz details');});
  return()=>{live=false;};},[questionId]);
 if(error)return <p role="alert" className="admin-error">{error}</p>;
 if(!detail)return <p className="review-meta">Loading quiz details…</p>;
 const translations=Array.isArray(detail.translations)?detail.translations as {locale:string;prompt:string;explanation:string}[]:[];
 const options=Array.isArray(detail.options)?detail.options as {en:string;fil:string;correct:boolean}[]:[];
 const english=translations.find(value=>value.locale==='en');
 const filipino=translations.find(value=>value.locale==='fil');
 return <div className="review-copy">
  <p><b>Question (English)</b><br/>{english?.prompt||'No English question provided.'}</p>
  <p><b>Tanong (Filipino)</b><br/>{filipino?.prompt||'Walang salin sa Filipino.'}</p>
  {linkedFact&&<div className="review-linked-fact"><b>Linked fact</b><p>{linkedFact.en}</p><p>{linkedFact.fil}</p></div>}
  <div className="review-options"><b>Answer choices</b>{options.map((option,index)=><div key={index}>
   <span>{index+1}. {option.en} / {option.fil}</span>{option.correct&&<strong>Correct answer</strong>}
  </div>)}</div>
  {(english?.explanation||filipino?.explanation)&&<div className="review-explanation"><b>Explanation</b>
   {english?.explanation&&<p>{english.explanation}</p>}{filipino?.explanation&&<p>{filipino.explanation}</p>}
  </div>}
 </div>;
}
