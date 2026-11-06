import {accountSession} from './accountSync';

export type LeaderboardEntry={rank:number;displayName:string;points:number;you:boolean};
export type WeeklyLeaderboard={period:'WEEKLY';entries:LeaderboardEntry[];yourRank:number|null;yourPoints:number};
const base=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');

export async function getWeeklyLeaderboard(signal?:AbortSignal):Promise<WeeklyLeaderboard>{
 const session=accountSession.get();
 if(!session)throw new Error('Sign in with Google from Profile to view the weekly leaderboard.');
 const response=await fetch(base+'/leaderboard/weekly',{headers:{Authorization:'Bearer '+session.token},cache:'no-store',signal});
 if(response.status===401)throw new Error('Your sign-in expired. Sign in again from Profile to view the leaderboard.');
 if(!response.ok)throw new Error('Leaderboard service returned HTTP '+response.status+'.');
 return await response.json() as WeeklyLeaderboard;
}
