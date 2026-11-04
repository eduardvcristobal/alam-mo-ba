import {describe,it,expect} from 'vitest';
import data from '../data/facts.json';
import {canRepeat,makeQuizItems,selectQuestions} from './quiz';
import type {Fact} from './types';
const facts=data as Fact[];
const stable=()=>0.5;
describe('Quiz selection',()=>{
 it('caps requests at the available question bank',()=>expect(selectQuestions(facts,50,[],stable)).toHaveLength(9));
 it('provides a set of configurable size',()=>expect(selectQuestions(facts,5,[],stable)).toHaveLength(5));
 it('prioritizes unseen questions',()=>{const first=selectQuestions(facts,5,[],stable);const second=selectQuestions(facts,5,first.map(f=>f.id),stable);expect(second.filter(f=>first.some(x=>x.id===f.id))).toHaveLength(1);});
 it('does not duplicate questions in one quiz',()=>{const set=selectQuestions(facts,9,[],stable);expect(new Set(set.map(q=>q.id)).size).toBe(9);});
 it('recognizes repeat as the same ordered questions',()=>{const set=selectQuestions(facts,5,[],stable);expect(canRepeat(makeQuizItems(set,stable),makeQuizItems(set,stable))).toBe(true);});
 it('randomizes answer positions with an intact source answer',()=>{const set=makeQuizItems(selectQuestions(facts,5,[],stable),stable);expect(set[0].order.sort()).toEqual([0,1,2]);expect(set[0].fact.q?.a).toBe(0);});
});
