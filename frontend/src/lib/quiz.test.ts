import {describe,it,expect} from 'vitest';
import {chooseQuestions,createQuiz} from './quiz';
const sample=[1,2,3,4].map(id=>({id,question:'Q'+id,choices:['A','B','C'],correctIndex:0,explanation:'E'}));
describe('quiz configuration',()=>{
 it('respects configured count',()=>expect(chooseQuestions(sample,2,[],()=>0.5)).toHaveLength(2));
 it('caps requested count at available items',()=>expect(chooseQuestions(sample,50)).toHaveLength(4));
 it('prioritizes unseen questions for a new set',()=>expect(chooseQuestions(sample,2,[1,2],()=>0.5).every(q=>q.id>2)).toBe(true));
 it('reuses content only after pool exhaustion',()=>expect(chooseQuestions(sample,4,[1,2,3],()=>0.5)).toHaveLength(4));
 it('preserves answer references when shuffling options',()=>{const set=createQuiz(sample,()=>0);expect(set[0].choiceOrder.sort()).toEqual([0,1,2]);});
});
