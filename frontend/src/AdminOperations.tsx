import {useEffect,useState} from 'react';
import {operations} from './lib/platformOperations';
import type {Analytics,Learner,OperatorAudit,Setting,Subject,Topic} from './lib/platformOperations';

export type OperationsTab='curriculum'|'learners'|'analytics'|'settings';
export default function AdminOperations({tab,roles}:{tab:OperationsTab;roles:string[]}){
 const [subjects,setSubjects]=useState<Subject[]>([]);
 const [topics,setTopics]=useState<Topic[]>([]);
 const [learners,setLearners]=useState<Learner[]>([]);
 const [stats,setStats]=useState<Analytics|null>(null);
 const [settings,setSettings]=useState<Setting[]>([]);
 const [audit,setAudit]=useState<OperatorAudit[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [reason,setReason]=useState('');
 const [newSubject,setNewSubject]=useState<Subject>({code:'',en:'',fil:'',active:true,displayOrder:100});
 const [newTopic,setNewTopic]=useState({subject:'Science',grade:7,en:'',fil:'',active:true});
 const [factId,setFactId]=useState('');
 const [topicId,setTopicId]=useState('');
 const isSuper=roles.includes('SUPER_ADMIN');
 const isContentAdmin=isSuper||roles.includes('CONTENT_ADMIN');
 const isEditor=isContentAdmin||roles.includes('EDITOR');
 const load=async()=>{
  switch(tab){
   case 'curriculum': {
    const [a,b]=await Promise.all([operations.subjects(),operations.topics()]);
    setSubjects(a);setTopics(b);break;
   }
   case 'learners':setLearners(await operations.learners());break;
   case 'analytics':setStats(await operations.analytics());break;
   case 'settings':{
    setSettings(await operations.settings());
    if(isContentAdmin)setAudit(await operations.operatorAudit());
    break;
   }
  }
 };
 useEffect(()=>{let live=true;setMessage('');void load().catch(e=>{if(live)setMessage(e instanceof Error?e.message:'Data load failed');});return()=>{live=false;};},[tab]);
 const run=async(work:()=>Promise<unknown>,success:string)=>{
  if(busy)return;
  setBusy(true);setMessage('');
  try{await work();await load();setMessage(success);}
  catch(e){setMessage(e instanceof Error?e.message:'Operation failed');}
  finally{setBusy(false);}
 };
 const formField=(name:string,value:string,onChange:(next:string)=>void)=>(
  <label>{name}<input required value={value} onChange={e=>onChange(e.target.value)}/></label>);
 return <section className="admin-panel">
  {message&&<p role="status" className="admin-notice">{message}</p>}
  {tab==='curriculum'&&<>
   <h2>Curriculum & Learning Topics</h2><p>Manage bilingual subjects, grade levels and topics. Only active topics can be mapped to draft facts.</p>
   <h3>Subjects</h3>
   {subjects.map(subject=><div key={subject.code} className="admin-entry"><div><strong>{subject.en} · {subject.fil}</strong><small>{subject.code} · {subject.active?'Active':'Inactive'}</small></div>
     {isContentAdmin&&<button disabled={busy} onClick={()=>void run(()=>operations.updateSubject({...subject,active:!subject.active}),'Subject updated')}>{subject.active?'Deactivate':'Activate'}</button>}</div>)}
   {isContentAdmin&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await operations.createSubject(newSubject);setNewSubject({code:'',en:'',fil:'',active:true,displayOrder:100});},'Subject created');}}>
     <h3>New subject</h3><div className="admin-formgrid">
      {formField('Code',newSubject.code,v=>setNewSubject(p=>({...p,code:v})))}
      {formField('Name (English)',newSubject.en,v=>setNewSubject(p=>({...p,en:v})))}
      {formField('Name (Filipino)',newSubject.fil,v=>setNewSubject(p=>({...p,fil:v})))}
     </div><button className="admin-primary" disabled={busy} type="submit">Add subject</button>
   </form>}
   <h3>Topics</h3>
   {topics.map(topic=><div key={topic.id} className="admin-entry"><div><strong>{topic.en} / {topic.fil}</strong><small>{topic.subject} · Grade {topic.grade} · {topic.active?'Active':'Inactive'}</small></div>
    {isContentAdmin&&<button disabled={busy} onClick={()=>void run(()=>operations.updateTopic({...topic,active:!topic.active}),'Topic updated')}>{topic.active?'Deactivate':'Activate'}</button>}</div>)}
   {isContentAdmin&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await operations.createTopic(newTopic);setNewTopic({subject:'Science',grade:7,en:'',fil:'',active:true});},'Topic created');}}>
    <h3>Add curriculum topic</h3><div className="admin-formgrid">
     <label>Subject<select value={newTopic.subject} onChange={e=>setNewTopic(p=>({...p,subject:e.target.value}))}>{subjects.filter(s=>s.active).map(s=><option key={s.code} value={s.code}>{s.en}</option>)}</select></label>
     <label>Grade<select value={newTopic.grade} onChange={e=>setNewTopic(p=>({...p,grade:Number(e.target.value)}))}>{Array.from({length:12},(_,i)=>i+1).map(g=><option key={g} value={g}>Grade {g}</option>)}</select></label>
     {formField('English topic',newTopic.en,v=>setNewTopic(p=>({...p,en:v})))}
     {formField('Filipino topic',newTopic.fil,v=>setNewTopic(p=>({...p,fil:v})))}
    </div><button className="admin-primary" disabled={busy} type="submit">Create topic</button>
   </form>}
   {isEditor&&<form onSubmit={e=>{e.preventDefault();void run(()=>operations.assignFactTopic(Number(factId),Number(topicId)),'Draft fact linked to curriculum');}}>
    <h3>Assign topic to a draft fact</h3><div className="admin-formgrid">
     {formField('Draft fact ID',factId,setFactId)}
     <label>Topic<select required value={topicId} onChange={e=>setTopicId(e.target.value)}><option value="">Select topic</option>{topics.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.subject} · G{t.grade} · {t.en}</option>)}</select></label>
    </div><button disabled={busy||!factId||!topicId} type="submit">Link topic</button>
   </form>}
  </>}
  {tab==='learners'&&<>
   <h2>Learner Account Directory</h2><p>Only pseudonymous account IDs and statuses are shown. Personal identities and individual learning histories are not exposed here.</p>
   <label>Reason for account status changes<input placeholder="Required for a change" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {learners.map(learner=><div className="admin-entry" key={learner.id}>
    <div><strong>Account {learner.id.slice(0,8)}…</strong><small>{learner.status} · Registered {new Date(learner.createdAt).toLocaleDateString()}</small></div>
    {isSuper&&<button disabled={busy||!reason.trim()} onClick={()=>void run(()=>operations.changeLearnerStatus(learner.id,learner.status==='ACTIVE'?'DISABLED':'ACTIVE',reason), 'Account status changed and audited')}>{learner.status==='ACTIVE'?'Disable account':'Re-enable account'}</button>}
   </div>)}
   {!learners.length&&<p>No registered accounts returned.</p>}
  </>}
  {tab==='analytics'&&<>
   <h2>Aggregate Learning Analytics</h2><p>Counts only—no personally identifying learner details or individual quiz histories.</p>
   {stats&&<>
    <div className="admin-stats">{([
     ['Registered accounts',stats.registeredAccounts],['Active accounts',stats.activeAccounts],
     ['Guest backups',stats.guestBackups],['Recorded quiz attempts',stats.recordedQuizAttempts],
     ['Published facts',stats.publishedFacts],['Published questions',stats.publishedQuizQuestions]
    ] as [string,number][]).map(([name,value])=><div className="admin-stat" key={name}><small>{name}</small><strong>{value}</strong></div>)}</div>
    <h3>Published facts by subject</h3>{stats.factsBySubject.map(entry=><div className="admin-entry" key={entry.subject}><strong>{entry.subject}</strong><span>{entry.count}</span></div>)}
    <h3>Facts by workflow status</h3>{stats.factsByStatus.map(entry=><div className="admin-entry" key={entry.status}><strong>{entry.status}</strong><span>{entry.count}</span></div>)}
    <h3>Questions by workflow status</h3>{stats.quizzesByStatus.map(entry=><div className="admin-entry" key={entry.status}><strong>{entry.status}</strong><span>{entry.count}</span></div>)}
   </>}
  </>}
  {tab==='settings'&&<>
   <h2>Platform Settings & Security</h2><p>Only allowlisted feature flags are configurable. Credentials and security secrets cannot be changed here.</p>
   <label>Reason for change<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe and justify the change"/></label>
   {settings.map(setting=><div className="admin-entry" key={setting.key}><div><strong>{setting.key.replaceAll('_',' ')}</strong><small>{setting.value?'Enabled':'Disabled'} · Updated {new Date(setting.updatedAt).toLocaleString()}</small></div>
    {isSuper&&<button disabled={busy||!reason.trim()} onClick={()=>void run(()=>operations.updateSetting(setting.key,!setting.value,reason),'Setting updated and audited')}>{setting.value?'Turn off':'Turn on'}</button>}
   </div>)}
   {isContentAdmin&&<><h3>Operator security audit</h3>
    {audit.map((event,i)=><div className="admin-entry" key={i}><div><strong>{event.action} · {event.targetType}</strong><small>{event.targetId} · {new Date(event.at).toLocaleString()}</small><p>{event.details}</p></div></div>)}
    {!audit.length&&<p>No operator events recorded.</p>}
   </>}
  </>}
 </section>;
}
