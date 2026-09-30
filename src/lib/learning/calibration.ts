import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { applicationPackages, applicationStageEvents, applications, jobs, rankingCalibrations } from "@/db/schema";

const STAGES:Record<string,number>={wishlist:0,applied:1,screening:2,interview:3,offer:4,rejected:5};
const RECENCY_HALF_LIFE_DAYS=120;
const MIN_EFFECTIVE_SAMPLES=3;
const MIN_MODEL_SAMPLES=5;

export type CalibrationStat={
  n:number;
  effectiveN:number;
  screened:number;
  interviewed:number;
  offered:number;
  rejected:number;
  screenRate:number;
  interviewRate:number;
  offerRate:number;
  outcomeIndex:number;
  reliability:number;
  freshness:number;
  uncertainty:number;
  lift:number;
};

export type RankingCalibrationModel={
  baseline:CalibrationStat;
  features:Record<string,Record<string,CalibrationStat>>;
  interactions:Record<string,CalibrationStat>;
  methodology:{
    version:string;
    minimumSamples:number;
    minimumEffectiveSamples:number;
    smoothing:string;
    recencyHalfLifeDays:number;
    baseWeight:number;
    calibrationWeight:number;
    interactionWeight:number;
  };
};

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
function round(value:number,digits=4){const p=10**digits;return Math.round(value*p)/p;}
function betaRate(success:number,n:number){return n?round((success+2)/(n+4)):0.5;}
function outcomeIndex(screenRate:number,interviewRate:number,offerRate:number){
  return round(screenRate*.5+interviewRate*.3+offerRate*.2);
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
type WeightedRecord={rank:number;rejected:number;weight:number};

function recencyWeight(occurredAt:Date){
  const ageDays=Math.max(0,(Date.now()-occurredAt.getTime())/86_400_000);
  return clamp(Math.pow(0.5,ageDays/RECENCY_HALF_LIFE_DAYS),0.2,1);
}

function smoothStat(records:WeightedRecord[],baselineIndex:number):CalibrationStat{
  const n=records.length;
  const effectiveN=records.reduce((sum,r)=>sum+r.weight,0);
  const screenedWeight=records.filter(r=>r.rank>=2).reduce((sum,r)=>sum+r.weight,0);
  const interviewedWeight=records.filter(r=>r.rank>=3).reduce((sum,r)=>sum+r.weight,0);
  const offeredWeight=records.filter(r=>r.rank>=4).reduce((sum,r)=>sum+r.weight,0);
  const rejected=records.reduce((sum,r)=>sum+r.rejected,0);
  const screenRate=betaRate(screenedWeight,effectiveN);
  const interviewRate=betaRate(interviewedWeight,effectiveN);
  const offerRate=betaRate(offeredWeight,effectiveN);
  const index=outcomeIndex(screenRate,interviewRate,offerRate);
  const freshness=effectiveN?clamp(effectiveN/n,0.2,1):0;
  const uncertainty=round(Math.sqrt(Math.max(index*(1-index),0)/(effectiveN+4)));
  const reliability=round(clamp(Math.sqrt(effectiveN/12)*freshness*(1-clamp(uncertainty/0.5,0,0.55)),0,1));
  return {
    n,effectiveN:round(effectiveN),screened:records.filter(r=>r.rank>=2).length,
    interviewed:records.filter(r=>r.rank>=3).length,offered:records.filter(r=>r.rank>=4).length,rejected,
    screenRate,interviewRate,offerRate,outcomeIndex:index,
    reliability,freshness,uncertainty,lift:round((index-baselineIndex)*reliability)
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
    .where(and(eq(applications.profileId,profileId),ne(applications.stage,"wishlist"),ne(applications.stage,"applied")))
    .orderBy(desc(applications.updatedAt));
}

type StageEventRow={toStage:string;occurredAt:Date};
function recordFor(
  row:Awaited<ReturnType<typeof loadRows>>[number],
  stageHistory:Map<number,StageEventRow[]>
){
  const history=stageHistory.get(row.application.id)??[];
  const historicalStages=[...history.map(event=>event.toStage),row.application.stage];
  const nonRejected=historicalStages.filter(value=>value!=="rejected");
  const rank=Math.max(0,...nonRejected.map(value=>STAGES[value]??0));
  const observedAt=history.length?history[history.length-1].occurredAt:row.application.updatedAt;
  const weight=recencyWeight(observedAt);
  return {
    roleFamily:roleFamily(row.job.title),
    seniority:seniority(row.job.title),
    fitBand:fitBand(row.package?.fitScore??null),
    source:row.job.source||"unknown",
    workMode:workMode(row.job.location),
    interaction:roleFamily(row.job.title)+"|"+fitBand(row.package?.fitScore??null),
    rank,
    rejected:row.application.stage==="rejected"?1:0,
    weight
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
  const stageHistory=new Map<number,StageEventRow[]>();
  for(const event of historyRows){
    const list=stageHistory.get(event.applicationId)??[];
    list.push({toStage:event.toStage,occurredAt:event.occurredAt});
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
      const key=String(record[feature as keyof typeof record]);
      const list=groups.get(key)??[];
      list.push(record);
      groups.set(key,list);
    }
    for(const [key,group] of groups){
      featureGroups[feature][key]=smoothStat(group.map(({rank,rejected,weight})=>({rank,rejected,weight})),baselineIndex);
    }
  }

  const interactions:Record<string,CalibrationStat>={};
  const groups=new Map<string,typeof records>();
  for(const record of records){
    const list=groups.get(record.interaction)??[];
    list.push(record);
    groups.set(record.interaction,list);
  }
  for(const [key,group] of groups){
    interactions[key]=smoothStat(group.map(({rank,rejected,weight})=>({rank,rejected,weight})),baselineIndex);
  }

  const model:RankingCalibrationModel={
    baseline,
    features:featureGroups,
    interactions,
    methodology:{
      version:"calibration-v2",
      minimumSamples:MIN_MODEL_SAMPLES,
      minimumEffectiveSamples:MIN_EFFECTIVE_SAMPLES,
      smoothing:"Beta(2,2) prior on each observed milestone with recency-weighted evidence",
      recencyHalfLifeDays:RECENCY_HALF_LIFE_DAYS,
      baseWeight:.78,
      calibrationWeight:.22,
      interactionWeight:.25
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

export function getCalibrationAdjustment(
  model:Awaited<ReturnType<typeof getRankingCalibration>>,
  job:{title:string;source:string;location:string|null},
  baseScore:number
){
  if(!model||model.sampleCount<MIN_MODEL_SAMPLES){
    return {adjustment:0,calibratedScore:baseScore,confidence:0,signals:[],modelVersion:null,calibrationIndex:null};
  }

  const stored=model as typeof model & {
    baseline:RankingCalibrationModel["baseline"];
    featureStats:RankingCalibrationModel["features"];
    interactions:RankingCalibrationModel["interactions"];
    methodology:RankingCalibrationModel["methodology"];
  };
  const baseline=stored.baseline.outcomeIndex??.5;
  const keys=[
    ["roleFamily",roleFamily(job.title)],
    ["seniority",seniority(job.title)],
    ["fitBand",fitBand(baseScore)],
    ["source",job.source||"unknown"],
    ["workMode",workMode(job.location)]
  ] as const;

  const evidence:Array<{name:string;stat:CalibrationStat}>=[];
  function normalizeStoredStat(value:CalibrationStat|undefined):CalibrationStat|null{
    if(!value)return null;
    const effectiveN=value.effectiveN??value.n??0;
    const freshness=value.freshness??1;
    const uncertainty=value.uncertainty??Math.sqrt(Math.max((value.outcomeIndex??.5)*(1-(value.outcomeIndex??.5)),0)/(effectiveN+4));
    const reliability=value.reliability??clamp((value.n??0)/12,0,1);
    return {...value,effectiveN,freshness,uncertainty,reliability};
  }

  for(const [kind,key] of keys){
    const stat=normalizeStoredStat(stored.featureStats?.[kind]?.[key]);
    if(stat&&stat.n>=3&&stat.effectiveN>=MIN_EFFECTIVE_SAMPLES)evidence.push({
      name:kind+":"+key,stat
    });
  }

  const interactionKey=roleFamily(job.title)+"|"+fitBand(baseScore);
  const interaction=normalizeStoredStat(stored.interactions?.[interactionKey]);
  const usableInteraction=interaction&&interaction.n>=3&&interaction.effectiveN>=MIN_EFFECTIVE_SAMPLES?interaction:null;

  const evidenceWeights=evidence.map(x=>{
    const uncertaintyPenalty=1/(1+4*x.stat.uncertainty);
    return x.stat.reliability*uncertaintyPenalty;
  });
  const totalWeight=evidenceWeights.reduce((s,w)=>s+w,0);
  const featureIndex=totalWeight
    ?evidence.reduce((s,x,i)=>s+x.stat.outcomeIndex*evidenceWeights[i],0)/totalWeight
    :baseline;

  const interactionWeight=usableInteraction
    ?Math.min(stored.methodology.interactionWeight??.25,usableInteraction.reliability*(stored.methodology.interactionWeight??.25))
    :0;

  const combinedIndex=(featureIndex*(1-interactionWeight)+(usableInteraction?.outcomeIndex??featureIndex)*interactionWeight);
  const rawDelta=combinedIndex-baseline;
  const reliabilityAverage=evidence.length
    ?evidence.reduce((s,x)=>s+x.stat.reliability,0)/evidence.length
    :(usableInteraction?.reliability??0);
  const freshnessAverage=evidence.length
    ?evidence.reduce((s,x)=>s+x.stat.freshness,0)/evidence.length
    :(usableInteraction?.freshness??0);
  const coverage=clamp(evidence.length/5,0,1);
  const sampleCoverage=clamp(model.sampleCount/20,0,1);
  const confidence=clamp(Math.round(
    sampleCoverage*45+reliabilityAverage*25+freshnessAverage*15+coverage*15
  ),0,100);

  if(confidence<35||Math.abs(rawDelta)<0.015){
    return {
      adjustment:0,calibratedScore:baseScore,confidence,signals:evidence.map(x=>x.name+" · "+x.stat.n+" apps · effective "+x.stat.effectiveN),
      modelVersion:model.version,calibrationIndex:Math.round(combinedIndex*100)
    };
  }

  const shrinkage=clamp(confidence/100,0.35,1);
  const adjustment=clamp(Math.round(rawDelta*45*shrinkage),-10,10);
  const calibratedScore=clamp(Math.round(baseScore*.78+(clamp(baseScore+adjustment,0,100))*.22),0,100);
  const finalAdjustment=calibratedScore-baseScore;

  return {
    adjustment:finalAdjustment,
    calibratedScore,
    confidence,
    signals:[
      ...evidence.map(x=>x.name+" · "+x.stat.n+" apps · effective "+x.stat.effectiveN+" · outcome "+Math.round(x.stat.outcomeIndex*100)+"% · freshness "+Math.round(x.stat.freshness*100)+"%"),
      ...(usableInteraction?[interactionKey+" · "+usableInteraction.n+" apps · effective "+usableInteraction.effectiveN]:[])
    ],
    modelVersion:model.version,
    calibrationIndex:Math.round(combinedIndex*100)
  };
}
