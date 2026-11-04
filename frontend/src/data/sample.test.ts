import {describe,expect,it} from 'vitest';
import {sampleFacts} from './sample';

describe('approved V2.1 sample content',()=>{
 it('contains 36 unique fact cards',()=>{
  expect(sampleFacts).toHaveLength(36);
  expect(new Set(sampleFacts.map(f=>f.id)).size).toBe(36);
 });
 it('covers Grades 7–9 and all six subjects',()=>{
  expect(new Set(sampleFacts.map(f=>f.grade))).toEqual(new Set([7,8,9]));
  expect(new Set(sampleFacts.map(f=>f.subject))).toEqual(new Set(['Science','AP','MAPEH','Filipino','Math','TLE']));
 });
 it('contains exactly nine usable quiz questions',()=>{
  const questions=sampleFacts.filter(f=>f.quiz);
  expect(questions).toHaveLength(9);
  for(const f of questions){
   expect(f.quiz!.choices.length).toBeGreaterThanOrEqual(3);
   expect(f.quiz!.correctIndex).toBeGreaterThanOrEqual(0);
   expect(f.quiz!.correctIndex).toBeLessThan(f.quiz!.choices.length);
  }
 });
 it('has non-empty English and Filipino text for all facts',()=>{
  for(const fact of sampleFacts){
   expect(fact.en.trim().length).toBeGreaterThan(10);
   expect(fact.fil.trim().length).toBeGreaterThan(10);
  }
 });
});
