import type {Preferences} from './types';
export const KEY='alammoba.app.m1';
export const defaults:Preferences={mode:null,lang:'en',grade:7,category:'all',quizCount:5,theme:'auto',saved:[],learned:[],streak:0,lastLearned:'',attempts:[]};
export function read():Preferences{try{const raw=JSON.parse(localStorage.getItem(KEY)||'{}');return {...defaults,...raw,mode:raw.mode==='student'||raw.mode==='explore'?raw.mode:null,quizCount:Math.max(1,Math.min(100,Number(raw.quizCount)||5))};}catch{return {...defaults};}}
export function save(data:Preferences):void{try{localStorage.setItem(KEY,JSON.stringify(data));}catch{/* Guest mode works without storage, but progress cannot persist */}}
export function dateKey(d:Date=new Date()):string{return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function yesterday():string{const d=new Date();d.setDate(d.getDate()-1);return dateKey(d);}
export function dayNumber():number{const d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);}
