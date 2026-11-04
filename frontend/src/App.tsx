import {useEffect,useMemo,useState} from 'react';
import GuestBackup from './components/GuestBackup';
import {contentApi} from './lib/contentApi';
import type {ApiFact,ApiQuestion} from './lib/contentApi';
import {sampleFacts} from './data/sample';
import {sampleQuizFil} from './data/sampleQuizFil';
import {chooseQuestions,createQuiz,shuffled} from './lib/quiz';
import type {QuizItem} from './lib/quiz';

type Mode='student'|'explore';
type Lang='en'|'fil';
type Screen='home'|'learn'|'quiz'|'progress'|'saved'|'profile';
type Preferences={mode:Mode|null;lang:Lang;grade:string;subject:string;count:number;saved:number[];learned:number[];streak:number;last:string;attempts:{score:number;total:number;date:string;mode?:Mode;questionIds?:number[];wrongIds?:number[]}[]};
const initial:Preferences={mode:null,lang:'en',grade:'7',subject:'all',count:5,saved:[],learned:[],streak:0,last:'',attempts:[]};
const storage='alam-mo-ba-v2.1-react-guest';
function load():Preferences{try{const v=JSON.parse(localStorage.getItem(storage)||'null');if(v&&typeof v==='object')return {...initial,...v};}catch{}return initial;}
function today(){return new Date().toLocaleDateString('en-CA');}
function yesterday(){const d=new Date();d.setDate(d.getDate()-1);return d.toLocaleDateString('en-CA');}
const subjects=['Science','AP','MAPEH','Filipino','Math','TLE'];
type Play={kind:'sample'|'api';type:string;items:QuizItem[];apiItems:ApiQuestion[];index:number;score:number;correct:number|null;pick:number|null;busy:boolean;historyIds:number[];feedback:string;hidden:number[];lifelineUsed:boolean;wrongIds:number[]};
const Nav=({icon,label,active,onClick}:{icon:string;label:string;active:boolean;onClick:()=>void})=><button className={active?'active':''} onClick={onClick} aria-current={active?'page':undefined}><span>{icon}</span><small>{label}</small></button>;
export default function App(){
 const [prefs,setPrefs]=useState<Preferences>(load);
 const [screen,setScreen]=useState<Screen>('home');
 const [search,setSearch]=useState('');
 const [offset,setOffset]=useState(0);
 const [play,setPlay]=useState<Play|null>(null);
 const [published,setPublished]=useState<ApiFact[]>([]);
 const [savedPublished,setSavedPublished]=useState<ApiFact[]>([]);
 const [questions,setQuestions]=useState<ApiQuestion[]>([]);
 const [apiStatus,setApiStatus]=useState<'loading'|'ready'|'offline'>('loading');
 const [apiAttempt,setApiAttempt]=useState(0);
 const [message,setMessage]=useState('');
 const lang=prefs.lang;
 const tr=(en:string,fil:string)=>lang==='fil'?fil:en;
 const update=(patch:Partial<Preferences>)=>setPrefs(p=>({...p,...patch}));
 const mode=prefs.mode;
 useEffect(()=>{localStorage.setItem(storage,JSON.stringify(prefs));document.documentElement.lang=prefs.lang==='fil'?'fil':'en';},[prefs]);
 useEffect(()=>{
  if(!mode)return;
  const controller=new AbortController();
  setApiStatus('loading');
  const filter={mode,grade:mode==='student'&&prefs.grade!=='all'?Number(prefs.grade):undefined,subject:prefs.subject!=='all'?prefs.subject:undefined,limit:100};
  Promise.all([contentApi.facts(filter,controller.signal),contentApi.questions(filter,controller.signal)])
   .then(([facts,qs])=>{if(!controller.signal.aborted){setPublished(facts.items);setQuestions(qs.items);setApiStatus('ready');}})
   .catch(()=>{if(!controller.signal.aborted){setPublished([]);setQuestions([]);setApiStatus('offline');}});
  return ()=>controller.abort();
 },[mode,prefs.grade,prefs.subject,apiAttempt]);
 useEffect(()=>{
  if(screen!=='saved')return;
  const ids=prefs.saved.filter(id=>id<0).map(id=>-id);
  if(!ids.length){setSavedPublished([]);return;}
  let active=true;
  Promise.all(ids.map(id=>contentApi.fact(id).catch(()=>null)))
   .then(records=>{if(active)setSavedPublished(records.filter((f):f is ApiFact=>f!==null));});
  return ()=>{active=false;};
 },[screen,prefs.saved]);
 const samples=useMemo(()=>sampleFacts.filter(f=>(mode!=='student'||prefs.grade==='all'||f.grade===Number(prefs.grade))&&(prefs.subject==='all'||prefs.subject===f.subject)),[mode,prefs.grade,prefs.subject]);
 const fact=samples.length?samples[(Math.floor(Date.now()/86400000)+offset)%samples.length]:null;
 const saved=sampleFacts.filter(f=>prefs.saved.includes(f.id));
 const verifiedFact=published.length?published[(Math.floor(Date.now()/86400000)+offset)%published.length]:null;
 const normalizedSearch=search.trim().toLocaleLowerCase();
 const matchingSamples=samples.filter(f=>(f.en+' '+f.fil+' '+f.subject).toLocaleLowerCase().includes(normalizedSearch));
 const matchingPublished=published.filter(f=>(f.subject+' '+Object.values(f.translations).join(' ')).toLocaleLowerCase().includes(normalizedSearch));
 const saveFact=(id:number)=>update({saved:prefs.saved.includes(id)?prefs.saved.filter(x=>x!==id):[...prefs.saved,id]});
 const markLearned=(id:number)=>{const d=today();setPrefs(p=>({...p,learned:p.learned.includes(id)?p.learned:[...p.learned,id],streak:p.last===d?p.streak:p.last===yesterday()?p.streak+1:1,last:d}));};
 const switchMode=(m:Mode)=>{update({mode:m,subject:'all'});setScreen('home');setPlay(null);setSearch('');};
 const go=(s:Screen)=>{setScreen(s);setPlay(null);setMessage('');};
 const quizPool=samples.filter(f=>f.quiz).map(f=>{const q=f.quiz!;const fil=sampleQuizFil[q.id];return lang==='fil'&&fil?{...q,question:fil.question,choices:fil.choices,explanation:fil.explanation}:q;});
 const startQuiz=(type='mixed',action:'new'|'repeat'='new')=>{
  if(action==='repeat'&&play){setPlay({...play,index:0,score:0,correct:null,pick:null,busy:false,feedback:'',hidden:[],lifelineUsed:false,wrongIds:[],historyIds:[...play.historyIds]});return;}
  const previous=play?.historyIds||[];
  const sample=chooseQuestions(quizPool,prefs.count,previous);
  const fresh=shuffled(questions.filter(q=>!previous.includes(q.id)));const recycled=shuffled(questions.filter(q=>previous.includes(q.id)));const live=[...fresh,...recycled].slice(0,Math.min(prefs.count,questions.length));
  if(live.length){
   setPlay({kind:'api',type,items:[],apiItems:live,index:0,score:0,correct:null,pick:null,busy:false,feedback:'',hidden:[],lifelineUsed:false,wrongIds:[],historyIds:live.map(x=>x.id)});
  }else{
   setPlay({kind:'sample',type,items:createQuiz(sample),apiItems:[],index:0,score:0,correct:null,pick:null,busy:false,feedback:'',hidden:[],lifelineUsed:false,wrongIds:[],historyIds:sample.map(q=>q.id)});
  }
  setScreen('quiz');
 };
 const total=play?(play.kind==='sample'?play.items.length:play.apiItems.length):0;
 const submit=async()=>{
  if(!play||play.pick===null||play.correct!==null||play.busy)return;
  const picked=play.pick;
  if(play.kind==='sample'){
   const q=play.items[play.index];const answer=q.correctIndex;
   setPlay(p=>p?{...p,correct:answer,score:p.score+Number(answer===picked),wrongIds:answer!==picked?[...p.wrongIds,q.id]:p.wrongIds,feedback:q.explanation}:p);
   return;
  }
  const q=play.apiItems[play.index];const option=q.options[picked];
  if(!option)return;
  setPlay(p=>p?{...p,busy:true}:p);
  try{
   const result=await contentApi.submitQuiz({mode:mode!,grade:mode==='student'&&prefs.grade!=='all'?Number(prefs.grade):undefined,subject:prefs.subject==='all'?undefined:prefs.subject,answers:[{questionId:q.id,optionId:option.id}]});
   const graded=result.answers[0];const right=q.options.findIndex(o=>o.id===graded.correctOptionId);
   setPlay(p=>p?{...p,correct:right,score:p.score+Number(graded.correct),wrongIds:graded.correct?p.wrongIds:[...p.wrongIds,q.id],feedback:graded.explanations[lang]||graded.explanations.en||'',busy:false}:p);
  }catch{setPlay(p=>p?{...p,busy:false}:p);setMessage(tr('Could not submit your answer. Please retry.','Hindi naisumite ang sagot. Subukang muli.'));}
 };
 const next=()=>{
  if(!play)return;
  if(play.index+1>=total){update({attempts:[...prefs.attempts,{score:play.score,total,date:today(),mode:mode!,questionIds:play.historyIds,wrongIds:play.wrongIds}].slice(-100)});}
  setPlay(p=>p?{...p,index:p.index+1,correct:null,pick:null,feedback:'',hidden:[]}:p);
 };
 const card=(f:typeof sampleFacts[number])=><article className="fact-item" key={f.id}><span className="emoji">{f.emoji}</span><div><small>{f.subject} · {tr('Grade','Baitang')} {f.grade}</small><p>{lang==='fil'?f.fil:f.en}</p><span className="sample-tag">{tr('Sample · unverified','Halimbawa · hindi beripikado')}</span><div className="actions"><button onClick={()=>markLearned(f.id)}>{prefs.learned.includes(f.id)?'✓ ':''}{tr('Learned','Natutunan')}</button><button onClick={()=>saveFact(f.id)}>{prefs.saved.includes(f.id)?'★':'☆'} {tr('Save','I-save')}</button></div></div></article>;
 const publishedCard=(f:ApiFact)=><article className="fact-item" key={'verified-'+f.id}><span className="emoji">{f.emoji||'💡'}</span><div><small>{f.subject} · {tr('Verified content','Beripikadong nilalaman')}</small><p>{f.translations[lang]||f.translations.en||''}</p><div className="actions"><button onClick={()=>markLearned(-f.id)}>{prefs.learned.includes(-f.id)?'✓ ':''}{tr('Learned','Natutunan')}</button><button onClick={()=>saveFact(-f.id)}>{prefs.saved.includes(-f.id)?'★':'☆'} {tr('Save','I-save')}</button></div></div></article>;
 if(!mode)return <main className="onboarding"><div className="bulb">💡</div><h1>Alam Mo Ba?</h1><p>{tr('Discover. Learn. Challenge Yourself.','Tumuklas. Matuto. Subukan ang sarili.')}</p><h2>{tr('How would you like to learn?','Paano mo gustong matuto?')}</h2><button className="mode-card" onClick={()=>switchMode('student')}>🎓 <span><b>{tr('Student Mode','Student Mode')}</b><small>{tr('Learn by grade and subject','Matuto ayon sa baitang at paksa')}</small></span> →</button><button className="mode-card" onClick={()=>switchMode('explore')}>🌍 <span><b>{tr('Explore Mode','Explore Mode')}</b><small>{tr('Daily facts and trivia','Mga kaalaman at trivia')}</small></span> →</button><p className="muted">🔒 {tr('No account required. Progress is stored in this browser.','Walang account na kailangan. Sa browser naka-save ang progreso.')}</p><button className="text-button" onClick={()=>update({lang:lang==='en'?'fil':'en'})}>🌐 {lang.toUpperCase()} ⇄</button></main>;
 const tabs: {id:Screen;icon:string;en:string;fil:string}[]=mode==='student'?
 [{id:'home',icon:'🏠',en:'Home',fil:'Home'},{id:'learn',icon:'📚',en:'Learn',fil:'Aralin'},{id:'quiz',icon:'🧠',en:'Quiz',fil:'Quiz'},{id:'progress',icon:'📊',en:'Progress',fil:'Progreso'},{id:'profile',icon:'👤',en:'Profile',fil:'Profile'}]:
 [{id:'home',icon:'🏠',en:'Home',fil:'Home'},{id:'learn',icon:'🧭',en:'Discover',fil:'Tuklas'},{id:'quiz',icon:'🏆',en:'Trivia',fil:'Trivia'},{id:'saved',icon:'⭐',en:'Saved',fil:'Naka-save'},{id:'profile',icon:'👤',en:'Profile',fil:'Profile'}];
 const filterBar=<div className="filters">{mode==='student'&&<select aria-label="Grade" value={prefs.grade} onChange={e=>update({grade:e.target.value})}><option value="all">{tr('All grades','Lahat ng baitang')}</option>{[7,8,9].map(g=><option value={g} key={g}>{tr('Grade','Baitang')} {g}</option>)}</select>}<select aria-label="Subject" value={prefs.subject} onChange={e=>update({subject:e.target.value})}><option value="all">{tr('All topics','Lahat ng paksa')}</option>{subjects.map(s=><option value={s} key={s}>{s}</option>)}</select><button onClick={()=>update({lang:lang==='en'?'fil':'en'})}>{lang.toUpperCase()} ⇄</button></div>;
 const publishedSection=<section className="panel" aria-live="polite"><h3>📚 {tr('Verified knowledge library','Beripikadong kaalaman')}</h3>{apiStatus==='loading'?<p className="muted">{tr('Loading verified content…','Kinukuha ang nilalaman…')}</p>:apiStatus==='offline'?<><p className="muted">{tr('Could not reach the content service. Sample content is available while you are offline.','Hindi maabot ang content service. Magagamit ang mga halimbawang kaalaman habang offline.')}</p><button onClick={()=>setApiAttempt(x=>x+1)}>{tr('Retry connection','Subukang kumonekta muli')}</button></>:published.length?<><p className="muted">{tr(published.length+' published facts available.',published.length+' beripikadong kaalaman.')}</p>{published.map(publishedCard)}</>:<p className="muted">{tr('The service is connected, but no verified facts match these filters yet. Try another grade or topic.','Nakakonekta ang serbisyo, ngunit wala pang beripikadong kaalamang tugma sa mga filter na ito. Sumubok ng ibang baitang o paksa.')}</p>}</section>;
 let main:React.ReactNode;
 if(screen==='home')main=<>{filterBar}{verifiedFact?<section className="hero"><div className="art">{verifiedFact.emoji||'💡'}</div><span className="chip">📅 {tr('Verified Fact of the Day','Beripikadong Kaalaman ng Araw')}</span><span className="chip">{verifiedFact.subject}</span><h2>{tr('Did you know?','Alam mo ba?')}</h2><p>{verifiedFact.translations[lang]||verifiedFact.translations.en||''}</p><div className="row"><button className="gold" onClick={()=>markLearned(-verifiedFact.id)}>✓ {tr('I learned this','Natutunan ko')}</button><button onClick={()=>saveFact(-verifiedFact.id)}>{prefs.saved.includes(-verifiedFact.id)?'★':'☆'} {tr('Save','I-save')}</button></div><small>{tr('Published, source-checked content','Inilathalang nilalamang sinuri ang sanggunian')}</small></section>:apiStatus==='loading'?<section className="panel" aria-live="polite"><p>{tr('Loading today’s fact…','Kinukuha ang kaalaman ngayon…')}</p></section>:fact?<section className="hero"><div className="art">{fact.emoji}</div><span className="chip">📅 {tr('Sample Fact of the Day','Halimbawang kaalaman ngayon')}</span><span className="chip">{fact.subject}</span><h2>{tr('Did you know?','Alam mo ba?')}</h2><p>{lang==='fil'?fact.fil:fact.en}</p><div className="row"><button className="gold" onClick={()=>markLearned(fact.id)}>✓ {tr('I learned this','Natutunan ko')}</button><button onClick={()=>saveFact(fact.id)}>{prefs.saved.includes(fact.id)?'★':'☆'} {tr('Save','I-save')}</button></div><small>{apiStatus==='offline'?tr('Sample · API unavailable · unverified','Halimbawa · hindi magamit ang API · hindi beripikado'):tr('Sample · verification pending','Halimbawa · hindi beripikado')}</small></section>:<section className="panel">{tr('No facts for this filter.','Walang kaalaman para sa napili.')}</section>}{apiStatus==='offline'&&<button className="wide" onClick={()=>setApiAttempt(x=>x+1)}>{tr('Retry content connection','Subukang ikonekta muli')}</button>}<button className="wide" onClick={()=>setOffset(x=>x+1)}>{tr('Preview another fact','Ibang kaalaman')} →</button><section className="panel"><h3>🧠 {tr('Daily challenge','Araw-araw na hamon')}</h3><p className="muted">{tr('Choose how many questions you want to answer.','Piliin ang bilang ng mga tanong.')}</p><button className="gold" onClick={()=>{setScreen('quiz');setPlay(null);}}>{tr('Start Quiz','Simulan ang Quiz')} →</button></section>{publishedSection}</>;
 else if(screen==='learn')main=<><h2>{mode==='student'?tr('Learn by subject','Matuto ayon sa paksa'):tr('Discover more','Tuklasin pa')}</h2>{filterBar}<input className="search" aria-label="Search facts" placeholder={tr('Search sample and verified facts…','Maghanap ng halimbawang at beripikadong kaalaman…')} value={search} onChange={e=>setSearch(e.target.value)}/><section aria-live="polite"><h3>{tr('Verified facts','Beripikadong kaalaman')}</h3>{apiStatus==='loading'?<p className="muted">{tr('Loading verified facts…','Kinukuha ang beripikadong kaalaman…')}</p>:apiStatus==='offline'?<p className="muted">{tr('Verified facts are unavailable offline. You can browse the sample library below.','Hindi magagamit offline ang beripikadong kaalaman. Maaari mong tingnan ang mga halimbawa sa ibaba.')}</p>:matchingPublished.length?matchingPublished.map(publishedCard):<p className="muted">{normalizedSearch?tr('No verified facts match your search.','Walang beripikadong kaalamang tugma sa paghahanap.'):tr('No verified facts match these filters yet.','Wala pang beripikadong kaalamang tugma sa mga filter.')}</p>}</section><section aria-live="polite"><h3>{tr('Sample library','Mga halimbawa')}</h3>{matchingSamples.length?matchingSamples.map(card):<p className="muted">{normalizedSearch?tr('No sample facts match your search.','Walang halimbawang kaalamang tugma sa paghahanap.'):tr('No sample facts match these filters.','Walang halimbawang kaalamang tugma sa mga filter.')}</p>}</section>{publishedSection}</>;
 else if(screen==='saved')main=<><h2>⭐ {tr('Saved Facts','Naka-save')}</h2>{(saved.length||savedPublished.length)?<>{saved.map(card)}{savedPublished.map(publishedCard)}</>:<div className="panel">{tr('Nothing saved yet.','Wala pang naka-save.')}</div>}</>;
 else if(screen==='progress')main=<><h2>📊 {tr('Learning Progress','Progreso')}</h2><div className="stats"><div className="panel"><b>{prefs.learned.length}</b><small>{tr('Facts learned','Natutuhan')}</small></div><div className="panel"><b>{prefs.attempts.length}</b><small>{tr('Quizzes completed','Quiz')}</small></div><div className="panel"><b>{prefs.streak}</b><small>{tr('Day streak','Sunod-sunod na araw')}</small></div><div className="panel"><b>{prefs.attempts.length?Math.round(prefs.attempts.reduce((s,a)=>s+a.score,0)/Math.max(1,prefs.attempts.reduce((s,a)=>s+a.total,0))*100):0}%</b><small>{tr('Accuracy','Katumpakan')}</small></div></div>{prefs.attempts.slice(-10).reverse().map((a,i)=><div className="panel history" key={i}>{a.date}<b>{a.score} / {a.total}</b></div>)}<button onClick={()=>go('saved')}>⭐ {tr('Saved facts','Naka-save')}</button></>;
 else if(screen==='profile')main=<><h2>👤 {tr('Guest Profile','Guest Profile')}</h2><section className="panel settings"><h3>{tr('Learning settings','Mga setting')}</h3><button onClick={()=>switchMode(mode==='student'?'explore':'student')}>🔄 {tr('Switch learning mode','Palitan ang mode')} →</button><button onClick={()=>update({lang:lang==='en'?'fil':'en'})}>🌐 {tr('Language','Wika')}: {lang.toUpperCase()} →</button><button onClick={()=>go('saved')}>⭐ {tr('Saved','Naka-save')}: {prefs.saved.length} →</button><button onClick={()=>go('progress')}>📊 {tr('Progress','Progreso')} →</button><p className="muted">{tr('Optional sign-in and cross-device sync will follow secure provider verification.','Susunod ang opsyonal na sign-in at sync kapag kumpleto na ang seguridad ng provider.')}</p></section><GuestBackup progress={prefs} onRestore={setPrefs} lang={lang}/><button onClick={()=>{if(window.confirm(tr('Delete local guest progress?','Burahin ang progreso?')))setPrefs({...initial,mode,lang});}}>{tr('Reset guest progress','Burahin ang progreso')}</button></>;
 else if(!play)main=<><h2>{mode==='student'?tr('Practice Quiz','Pagsusulit'):tr('Trivia Arena','Trivia Arena')}</h2><section className="panel"><h3>⚙️ {tr('Quiz settings','Mga setting ng quiz')}</h3><label htmlFor="count">{tr('Number of questions','Bilang ng tanong')}</label><div className="counter"><button onClick={()=>update({count:Math.max(1,prefs.count-1)})} disabled={prefs.count<=1}>−</button><input id="count" type="number" min="1" max="100" value={prefs.count} onChange={e=>update({count:Math.min(100,Math.max(1,Number(e.target.value)||1))})}/><button onClick={()=>update({count:Math.min(100,prefs.count+1)})} disabled={prefs.count>=100}>+</button></div><div className="row">{[5,10,20,50].map(n=><button key={n} className={prefs.count===n?'gold':''} onClick={()=>update({count:n})}>{n}</button>)}</div><p className="muted">{tr('Available:','Available:')} {questions.length?questions.length:quizPool.length} {tr('questions','tanong')}. {questions.length?'Verified API content':apiStatus==='offline'?'Sample quiz · API offline':'Sample quiz · unverified'}</p></section>{filterBar}<section className="panel"><h3>🏆 {tr('Daily Challenge','Araw-araw na Hamon')}</h3><p>{tr('Answer questions, then repeat the set or try new ones.','Sagutin ang quiz, pagkatapos ulitin o pumili ng bago.')}</p><button className="gold" disabled={!questions.length&&!quizPool.length} onClick={()=>startQuiz('mixed')}>{tr('Start quiz','Simulan')}</button></section></>;
 else if(play.index>=total)main=<section className="panel center"><div className="art">🏆</div><h2>{tr('Quiz complete!','Tapos na ang quiz!')}</h2><h1>{play.score} / {total}</h1><p>{tr('What would you like to do next?','Ano ang susunod?')}</p><button className="gold wide" onClick={()=>startQuiz(play.type,'repeat')}>🔁 {tr('Repeat the same questions','Ulitin ang parehong mga tanong')}</button><button className="wide" onClick={()=>startQuiz(play.type,'new')}>🔀 {tr('Try another question set','Subukan ang bagong set')}</button><button className="wide" onClick={()=>setPlay(null)}>{tr('Back to quiz menu','Bumalik sa quiz')}</button></section>;
 else{
  const item=play.kind==='sample'?play.items[play.index]:null;
  const remote=play.kind==='api'?play.apiItems[play.index]:null;
  const choices=item?item.choiceOrder.filter(i=>!play.hidden.includes(i)).map(i=>({text:item.choices[i],original:i})):remote?remote.options.map((o,i)=>({text:o.translations[lang]||o.translations.en||'',original:i})):[];
  const prompt=item?.question||(remote?.translations[lang]?.prompt||remote?.translations.en?.prompt)||'';
  main=<section className="game"><div className="game-top"><button className="lifeline" disabled={play.kind!=='sample'||play.lifelineUsed||play.correct!==null} onClick={()=>setPlay(p=>{if(!p||p.kind!=='sample'||p.lifelineUsed)return p;const q=p.items[p.index];const wrong=q.choiceOrder.filter(i=>i!==q.correctIndex&&i!==p.pick);return {...p,hidden:shuffled(wrong).slice(0,Math.max(0,wrong.length-1)),lifelineUsed:true};})}>50:50</button><button onClick={()=>setPlay(null)}>✕ {tr('Exit','Lumabas')}</button></div><p className="game-meta">{play.kind==='sample'&&<span className="sample-quiz-label">{tr('Sample quiz · unverified','Halimbawang quiz · hindi beripikado')}<br/></span>}{tr('Question','Tanong')} {play.index+1} / {total} · {play.score} {tr('points','puntos')}</p><div className="hex"><h2>{prompt}</h2></div>{choices.map((c,i)=><button key={i} aria-pressed={play.pick===c.original} className={'answer '+(play.pick===c.original?'picked ':'')+(play.correct!==null&&play.correct===c.original?'right ':'')+(play.correct!==null&&play.pick===c.original&&play.correct!==c.original?'wrong ':'')} disabled={play.correct!==null||play.busy} onClick={()=>{setPlay(p=>p?{...p,pick:c.original}:p);setMessage('');}}><b>{'ABCD'[i]}:</b> {c.text}</button>)}{message&&<p role="alert">{message}</p>}{play.correct!==null?<><p role="status" aria-live="polite">{play.correct===play.pick?'✅ '+tr('Correct!','Tama!'):'❌ '+tr('Not quite.','Hindi pa tama.')} {play.feedback}</p><button className="gold wide" onClick={next}>{play.index+1===total?tr('See results','Tingnan ang resulta'):tr('Next question','Susunod na tanong')}</button></>:<button className="gold wide" disabled={play.pick===null||play.busy} onClick={()=>void submit()}>{play.busy?tr('Checking…','Sinusuri…'):tr('Final answer','Pinal na sagot')}</button>}</section>;
 }
 return <div className="app"><a href="#main-content" className="skip-link">{tr('Skip to content','Tumalon sa nilalaman')}</a><header><div><h1>Alam Mo Ba?</h1><small>{mode==='student'?'🎓 Student Mode':'🌍 Explore Mode'}</small></div><button className="streak" onClick={()=>go('progress')}>🔥 {prefs.streak} {tr('days','araw')}</button></header><main className="content" id="main-content" tabIndex={-1}>{main}</main><nav className="bottom" aria-label="Main navigation">{tabs.map(n=><Nav key={n.id} icon={n.icon} label={lang==='en'?n.en:n.fil} active={screen===n.id} onClick={()=>go(n.id)}/>)}</nav></div>;
}
