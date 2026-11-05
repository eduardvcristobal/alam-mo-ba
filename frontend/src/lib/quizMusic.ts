let stopCurrent: (()=>void)|null=null;
let activeContext:AudioContext|null=null;
let activeMaster:GainNode|null=null;

/** Start an original, pulse-led quiz suspense bed using Web Audio. */
export function startQuizMusic():void{
 stopQuizMusic();
 if(typeof window==='undefined'||typeof window.AudioContext==='undefined')return;
 const context=new window.AudioContext();
 const master=context.createGain();
 const compressor=context.createDynamicsCompressor();
 master.gain.value=.92;
 compressor.threshold.value=-18;
 compressor.knee.value=10;
 compressor.ratio.value=6;
 compressor.attack.value=.004;
 compressor.release.value=.18;
 master.connect(compressor);compressor.connect(context.destination);
 activeContext=context;activeMaster=master;
 const oscillators=new Set<OscillatorNode>();
 const pads:[number,number][]=[[110,.09],[164.81,.055],[220,.03]];
 for(const [frequency,volume] of pads){
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.type='sine';
  oscillator.frequency.value=frequency;
  gain.gain.value=volume;
  oscillator.connect(gain);gain.connect(master);oscillator.onended=()=>oscillators.delete(oscillator);oscillator.start();oscillators.add(oscillator);
 }
 const notes=[220,293.66,329.63,392,329.63,293.66,261.63,293.66];
 let step=0;
 const playNote=()=>{
  const now=context.currentTime;
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.type='triangle';
  oscillator.frequency.setValueAtTime(notes[step%notes.length],now);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.24,now+.07);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.62);
  oscillator.connect(gain);gain.connect(master);
  oscillator.onended=()=>oscillators.delete(oscillator);
  oscillator.start(now);oscillator.stop(now+.64);
  oscillators.add(oscillator);step++;
 };
 const pulse=(at:number,level:number)=>{
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.type='triangle';oscillator.frequency.value=110;
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(level,at+.018);
  gain.gain.exponentialRampToValueAtTime(.0001,at+.16);
  oscillator.connect(gain);gain.connect(master);
  oscillator.onended=()=>oscillators.delete(oscillator);
  oscillator.start(at);oscillator.stop(at+.17);oscillators.add(oscillator);
 };
 const beat=()=>{const now=context.currentTime;pulse(now,.27);pulse(now+.19,.19);};
 const interval=window.setInterval(playNote,660);
 const heartbeat=window.setInterval(beat,1320);
 void context.resume().catch(()=>{});
 let stopped=false;
 const cleanup=()=>{
  if(stopped)return;
  stopped=true;
  window.clearInterval(interval);
  window.clearInterval(heartbeat);
  for(const node of oscillators){try{node.stop();}catch{/* Already ended. */}}
  oscillators.clear();
  void context.close().catch(()=>{});
  if(activeContext===context){activeContext=null;activeMaster=null;}
  if(stopCurrent===cleanup)stopCurrent=null;
 };
 stopCurrent=cleanup;
 playNote();
 beat();
}

export function stopQuizMusic():void{
 stopCurrent?.();
 stopCurrent=null;
}

/** Play a short, original feedback cue through the active quiz audio context. */
export function playAnswerSound(correct:boolean):void{
 const context=activeContext;
 const master=activeMaster;
 if(!context||!master||context.state!=='running')return;
 const notes=correct?[392,493.88,587.33,783.99]:[440,415.3,311.13];
 const spacing=correct ? 0.15 : 0.2;
 notes.forEach((frequency,index)=>{
  const start=context.currentTime+index*spacing;
  const duration=correct ? 0.28 : 0.36;
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.type=correct?'triangle':'sine';
  oscillator.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(correct ? 0.4 : 0.44,start+.04);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  oscillator.connect(gain);gain.connect(master);
  oscillator.start(start);oscillator.stop(start+duration+.01);
 });
}
