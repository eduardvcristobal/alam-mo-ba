export type QuizCandidate={id:number;question:string;choices:string[];correctIndex:number;explanation:string};
export type QuizItem=QuizCandidate & {choiceOrder:number[]};
export function shuffled<T>(items:readonly T[], random:()=>number=Math.random):T[]{const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function chooseQuestions(pool:readonly QuizCandidate[],count:number,exclude:number[]=[],random:()=>number=Math.random):QuizCandidate[]{const size=Math.min(Math.max(1,Math.floor(count)||1),100,pool.length);const fresh=shuffled(pool.filter(q=>!exclude.includes(q.id)),random);const used=shuffled(pool.filter(q=>exclude.includes(q.id)),random);return [...fresh,...used].slice(0,size);}
export function createQuiz(items:readonly QuizCandidate[],random:()=>number=Math.random):QuizItem[]{return items.map(q=>({...q,choiceOrder:shuffled(q.choices.map((_,i)=>i),random)}));}
