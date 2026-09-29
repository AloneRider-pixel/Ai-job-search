import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationPackages, applicationStageEvents, applications, jobs, rankingCalibrations } from "@/db/schema";

const STAGES:Record<string,number>={wishlist:0,applied:1,screening:2,interview:3,offer:4,rejected:5};

export type CalibrationStat={
  n:number;
  screened:number;
  interviewed:number;
  offered:number;
  rejected:number;
  screenRate:number;
  interviewRate:number;
  offerRate:number;
  outcomeIndex:number;
  reliability:number;
  lift:number;
};

export type RankingCalibrationModel={
  baseline:CalibrationStat;
  features:Record<string,Record<string,CalibrationStat>>;
  interactions:Record<string,CalibrationStat>;
  methodology:{
    version:string;
    minimumSamples:number;
    smoothing:string;
    baseWeight:number;
    calibrationWeight:number;
    interactionWeight:number;
  };
};

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
function betaRate(success:number,n:number){return n?Number(((success+2)/(n+4)).toFixed(4)):0.5;}
function outcomeIndex(screenRate:number,interviewRate:number,offerRate:number){
  return Number((screenRate*.5+interviewRate*.3+offerRate*.2).toFixed(4));
}
function seniority(title:string){
  const t=title.toLowerCase();
  if(/intern|internship|trainee|apprentice/.test(t))return "entry";
  if(/staff|principal|distinguished|architect/.test(t))return "staff";
  if(/lead|manager|head/.test(t))return "lead";
  if(/senior|sr\b/.test(t))return "senior";
  if(/junior|jr\b|associate|graduate/.test(t))return "junior";
  return "mid";
}
function roleFamily(title:string){
  const t=title.toLowerCase();
  if(/machine learning|ml |ai |artificial intelligence|llm|data scientist/.test(t))return "ai";
  if(/data engineer|analytics engineer|data platform|etl/.test(t))return "data";
  if(/frontend|front end|react|ui engineer/.test(t))return "frontend";
  if(/full.?stack|full stack/.test(t))return "fullstack";
  if(/backend|back end|api engineer/.test(t))return "backend";
  if(/devops|sre|site reliability|platform engineer|cloud engineer|infrastructure/.test(t))return "platform";
  if(/qa|quality assurance|test engineer|sdet/.test(t))return "quality";
  if(/software engineer|software developer|application engineer|developer/.test(t))return "software";
  if(/product manager|program manager|business analyst|analyst/.test(t))return "product";
  return "other";
}
function fitBand(score:number|null){
  if(score===null||score===undefined)return "unknown";
  if(score>=90)return "90-100";
  if(score>=75)return "75-89";
  if(score>=60)return "60-74";
  return "0-59";
}
function workMode(location:string|null){
  const l=(location??"").toLowerCase();
  if(/remote/.test(l))return "remote";
  if(/hybrid/.test(l))return "hybrid";
  if(/on.?site|onsite/.test(l))return "onsite";
  return "unknown";
}
function smoothStat(records:Array<{rank:number;rejected:number}>,baselineIndex:number):CalibrationStat{
  const n=records.length;
  const screened=records.filter(r=>r.rank>=2).length;
  const interviewed=records.filter(r=>r.rank>=3).length;
  const offered=records.filter(r=>r.rank>=4).length;
  const rejected=records.reduce((s,r)=>s+r.rejected,0);
  const screenRate=betaRate(screened,n);
  const interviewRate=betaRate(interviewed,n);
  const offerRate=betaRate(offered,n);
  const index=outcomeIndex(screenRate,interviewRate,offerRate);
  const reliability=clamp(n/12,0,1);
  return {
    n,screened,interviewed,offered,rejected,
    screenRate,interviewRate,offerRate,outcomeIndex:index,
    reliability,
    lift:Number((index-baselineIndex).toFixed(4))
  };
}
async function loadRows(profileId:number){
  return db.select({
    application:applications,
    job:jobs,
    package:applicationPackages
  }).from(applications)
    .innerJoin(jobs,eq(applications.jobId,jobs.id))
    .leftJoin(applicationPackages,eq(applications.packageId,applicationPackages.id))
    .where(eq(applications.profileId,profileId))
    .orderBy(desc(applications.updatedAt));
}
function recordFor(row:Awaited<ReturnType<typeof loadRows>>[number],stageHistory:Map<number,string[]>){
  const history=stageHistory.get(row.application.id)??[];
  const historicalStages=[...history,row.application.stage];
  const nonRejected=historicalStages.filter(value=>value!=="rejected");
  const rank=Math.max(0,...nonRejected.map(value=>STAGES[value]??0));
  return {
    roleFamily:roleFamily(row.job.title),
    seniority:seniority(row.job.title),
    fitBand:fitBand(row.package?.fitScore??null),
    source:row.job.source||"unknown",
    workMode:workMode(row.job.location),
    interaction:roleFamily(row.job.title)+"|"+fitBand(row.package?.fitScore??null),
    rank,
    rejected:row.application.stage==="rejected"?1:0
  };
}
export async function trainRankingCalibration(profileId:number){
  const rows=await loadRows(profileId);
  const historyRows=await db.select({
    applicationId:applicationStageEvents.applicationId,
    toStage:applicationStageEvents.toStage,
    occurredAt:applicationStageEvents.occurredAt
  }).from(applicationStageEvents)
    .where(eq(applicationStageEvents.profileId,profileId))
    .orderBy(applicationStageEvents.occurredAt);
  const stageHistory=new Map<number,string[]>();
  for(const event of historyRows){
    const list=stageHistory.get(event.applicationId)??[];
    list.push(event.toStage);
    stageHistory.set(event.applicationId,list);
  }
  const records=rows.map(row=>recordFor(row,stageHistory));
  const baseline=smoothStat(records,0.5);
  const baselineIndex=baseline.outcomeIndex;
  const featureGroups:Record<string,Record<string,CalibrationStat>>={
    roleFamily:{},seniority:{},fitBand:{},source:{},workMode:{}
  };
  for(const feature of Object.keys(featureGroups) as Array<keyof typeof featureGroups>){
    const groups=new Map<string,typeof records>();
    for(const record of records){
      const key=record[feature];
      const list=groups.get(key)??[];
      list.push(record);
      groups.set(key,list);
    }
    for(const [key,group] of groups)featureGroups[feature][key]=smoothStat(group.map(r=>({rank:r.rank,rejected:r.rejected})),baselineIndex);
  }
  const interactions:Record<string,CalibrationStat>={};
  const groups=new Map<string,typeof records>();
  for(const record of records){
    const list=groups.get(record.interaction)??[];
    list.push(record);
    groups.set(record.interaction,list);
  }
  for(const [key,group] of groups)interactions[key]=smoothStat(group.map(r=>({rank:r.rank,rejected:r.rejected})),baselineIndex);
  const model:RankingCalibrationModel={
    baseline,
    features:featureGroups,
    interactions,
    methodology:{
      version:"calibration-v1",
      minimumSamples:3,
      smoothing:"Beta(2,2) prior on each observed milestone",
      baseWeight:.78,
      calibrationWeight:.22,
      interactionWeight:.35
    }
  };
  const [existing]=await db.select().from(rankingCalibrations).where(eq(rankingCalibrations.profileId,profileId)).limit(1);
  const values={
    profileId,
    version:(existing?.version??0)+1,
    sampleCount:records.length,
    baseline:model.baseline,
    featureStats:model.features,
    interactions:model.interactions,
    methodology:model.methodology,
    trainedAt:new Date(),
    updatedAt:new Date()
  };
  if(existing){
    const [saved]=await db.update(rankingCalibrations).set(values).where(eq(rankingCalibrations.id,existing.id)).returning();
    return saved;
  }
  const [saved]=await db.insert(rankingCalibrations).values(values).returning();
  return saved;
}
export async function getRankingCalibration(profileId:number){
  const [model]=await db.select().from(rankingCalibrations).where(eq(rankingCalibrations.profileId,profileId)).limit(1);
  return model??null;
}
export function getCalibrationAdjustment(model:Awaited<ReturnType<typeof getRankingCalibration>>,job:{title:string;source:string;location:string|null},baseScore:number){
  if(!model||model.sampleCount<5)return {adjustment:0,calibratedScore:baseScore,confidence:0,signals:[],modelVersion:null,calibrationIndex:null};
  const stored=model as typeof model & {baseline:RankingCalibrationModel["baseline"];featureStats:RankingCalibrationModel["features"];interactions:RankingCalibrationModel["interactions"];methodology:RankingCalibrationModel["methodology"]};
  const baseline=stored.baseline.outcomeIndex??.5;
  const keys=[
    ["roleFamily",roleFamily(job.title)],
    ["seniority",seniority(job.title)],
    ["fitBand",fitBand(baseScore)],
    ["source",job.source||"unknown"],
    ["workMode",workMode(job.location)]
  ] as const;
  const evidence:Array<{name:string;stat:CalibrationStat}>=[];
  for(const [kind,key] of keys){
    const stat=stored.featureStats?.[kind]?.[key];
    if(stat&&stat.n>=3)evidence.push({name:kind+":"+key,stat});
  }
  const interactionKey=roleFamily(job.title)+"|"+fitBand(baseScore);
  const interaction=stored.interactions?.[interactionKey];
  const usableInteraction=interaction&&interaction.n>=3?interaction:null;
  const weights=evidence.map(x=>x.stat.reliability);
  const totalWeight=weights.reduce((s,w)=>s+w,0);
  const featureIndex=totalWeight
    ?evidence.reduce((s,x)=>s+x.stat.outcomeIndex*x.stat.reliability,0)/totalWeight
    :baseline;
  const interactionWeight=usableInteraction?Math.min(.35,usableInteraction.reliability):0;
  const combinedIndex=(featureIndex*(1-interactionWeight)+ (usableInteraction?.outcomeIndex??featureIndex)*interactionWeight);
  const rawDelta=combinedIndex-baseline;
  const calibrationConfidence=clamp(Math.round((clamp(model.sampleCount/20,0,1)*55)+(evidence.length/5*30)+(usableInteraction?15:0)),0,100);
  const adjustment=clamp(Math.round(rawDelta*45*clamp(calibrationConfidence/70,0,1)),-12,12);
  const calibratedScore=clamp(Math.round(baseScore*.78+(clamp(baseScore+adjustment,0,100))*.22),0,100);
  const finalAdjustment=calibratedScore-baseScore;
  return {
    adjustment:finalAdjustment,
    calibratedScore,
    confidence:calibrationConfidence,
    signals:[
      ...evidence.map(x=>x.name+" · "+x.stat.n+" apps · outcome index "+Math.round(x.stat.outcomeIndex*100)+"%"),
      ...(usableInteraction?[interactionKey+" · "+usableInteraction.n+" apps"]:[])
    ],
    modelVersion:model.version,
    calibrationIndex:Math.round(combinedIndex*100)
  };
}
