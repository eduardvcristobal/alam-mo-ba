import {adminApi} from './adminApi';
import type {FactDraft,QuestionDraft} from './adminApi';

type StarterItem={fact:FactDraft;quiz:Omit<QuestionDraft,'factId'>};
const starterItems:StarterItem[]=[
 {fact:{key:'starter-earth-day-night',subject:'Science',emoji:'🌍',
   en:'Earth’s rotation on its axis causes day and night.',
   fil:'Ang pag-ikot ng Daigdig sa sariling aksis nito ang sanhi ng araw at gabi.',
   student:true,grade:7,explore:true,
   sourceTitle:'NASA Space Place: What Causes the Seasons?',
   sourceUrl:'https://spaceplace.nasa.gov/seasons/en/'},
  quiz:{en:'What causes day and night on Earth?',fil:'Ano ang sanhi ng araw at gabi sa Daigdig?',
   explanationEn:'Earth rotates on its axis. The side facing the Sun has day; the other side has night.',
   explanationFil:'Umiikot ang Daigdig sa aksis nito. Araw sa bahaging nakaharap sa Araw at gabi sa kabilang panig.',
   options:[
    {en:'Earth rotating on its axis',fil:'Pag-ikot ng Daigdig sa aksis nito',correct:true},
    {en:'The Moon orbiting Earth',fil:'Pag-ikot ng Buwan sa Daigdig',correct:false},
    {en:'Clouds covering the Sun',fil:'Pagtakip ng mga ulap sa Araw',correct:false}
   ]}},
 {fact:{key:'starter-water-cycle',subject:'Science',emoji:'💧',
   en:'The Sun’s heat drives evaporation in the water cycle. Water vapor can condense into clouds and later fall as precipitation.',
   fil:'Pinaiinit ng Araw ang tubig kaya sumisingaw ito. Maaaring lumamig at mag-condense ang singaw bilang ulap bago bumagsak bilang ulan o iba pang presipitasyon.',
   student:true,grade:7,explore:true,
   sourceTitle:'USGS Water Science School: The Water Cycle',
   sourceUrl:'https://www.usgs.gov/water-science-school/water-cycle'},
  quiz:{en:'What is the change from water vapor to tiny liquid droplets called?',
   fil:'Ano ang tawag sa pagbabago ng singaw ng tubig tungo sa maliliit na patak ng likido?',
   explanationEn:'During condensation, water vapor cools and changes into liquid droplets, such as those in clouds.',
   explanationFil:'Sa condensation, lumalamig ang singaw ng tubig at nagiging maliliit na patak ng likido, gaya ng nasa ulap.',
   options:[
    {en:'Condensation',fil:'Condensation o pagkondensa',correct:true},
    {en:'Evaporation',fil:'Evaporation o pagsingaw',correct:false},
    {en:'Collection',fil:'Pagtitipon',correct:false}
   ]}}
];

/** Add the bilingual starter set as editable drafts; repeated runs skip existing keys/questions. */
export async function seedStarterContent():Promise<{factsCreated:number;quizzesCreated:number}>{
 const [facts,questions]=await Promise.all([adminApi.facts(),adminApi.questions()]);
 let factsCreated=0,quizzesCreated=0;
 for(const item of starterItems){
  let fact=facts.find(row=>row.key===item.fact.key);
  if(!fact){
   const created=await adminApi.createFact(item.fact);
   fact={...item.fact,id:created.id,status:created.status,en:item.fact.en,fil:item.fact.fil};
   facts.push(fact);factsCreated++;
  }
  if(fact.status==='RETIRED'||questions.some(question=>question.factId===fact.id))continue;
  await adminApi.createQuestion({...item.quiz,factId:fact.id});
  questions.push({id:-1,factId:fact.id,status:'DRAFT',prompt:item.quiz.en});
  quizzesCreated++;
 }
 return {factsCreated,quizzesCreated};
}
