import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { applicationStageEvents, applications, applicationPackages, jobs, outcomeLearningModels } from "@/db/schema";
import { and } from "drizzle-orm";
import { trainRankingCalibration } from "@/lib/learning/calibration";

const STAGE_RANK:Record<string,number>={wishlist:0,applied:1,screening:2,interview:3,offer:4,rejected:5};

type FeatureStat={
  n:number;
  progressed:number;
  interviewed:number;
  offered:number;
  rejected:number;
  progressedRate:number;
  interviewRate:number;
  offerRate:number;
  adjustment:number;
};

type LearningModel={
  baseline:FeatureStat;
  features:Record<string,Record<string,FeatureStat>>;
};

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
function rate(success:number,n:number){return n?Number(((success+2)/(n+4)).toFixed(4)):0.5;}
function makeStat(n:number,progressed:number,interviewed:number,offered:number,rejected:number,baselineRate:number):FeatureStat{
  const progressedRate=rate(progressed,n);
  const interviewRate=rate(interviewed,n);
  const offerRate=rate(offered,n);
  const lift=progressedRate-baselineRate;
  const support=clamp(n/8,0,1);
  return {
    n,progressed,interviewed,offered,rejected,
    progressedRate,
    interviewRate,
    offerRate,
    adjustment:clamp(Math.round(lift*24*support),-8,8)
  };
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

async function loadTrainingRows(profileId:number){
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

function aggregate(rows:Awaited<ReturnType<typeof loadTrainingRows>>,stageHistory:Map<number,string[]>):LearningModel{
  const records=rows.map(row=>{
    const stage=row.application.stage;
    const history=stageHistory.get(row.application.id)??[];
    const historicalStages=[...history,stage];
    const nonRejected=historicalStages.filter(value=>value!=="rejected");
    const rank=Math.max(0,...nonRejected.map(value=>STAGE_RANK[value]??0));
    const fitScore=row.package?.fitScore??null;
    return {
      roleFamily:roleFamily(row.job.title),
      fitBand:fitBand(fitScore),
      source:row.job.source||"unknown",
      workMode:workMode(row.job.location),
      rank,
      progressed:rank>=2?1:0,
      interviewed:rank>=3?1:0,
      offered:rank>=4?1:0,
      rejected:stage==="rejected"?1:0
    };
  });

  const total=records.length;
  const progressed=records.reduce((s,r)=>s+r.progressed,0);
  const interviewed=records.reduce((s,r)=>s+r.interviewed,0);
  const offered=records.reduce((s,r)=>s+r.offered,0);
  const rejected=records.reduce((s,r)=>s+r.rejected,0);
  const baselineRate=rate(progressed,total);

  const baseline=makeStat(total,progressed,interviewed,offered,rejected,baselineRate);
  const buckets:Record<string,Record<string,FeatureStat>>={roleFamily:{},fitBand:{},source:{},workMode:{}};

  for(const kind of Object.keys(buckets) as Array<keyof typeof buckets>){
    const groups=new Map<string,typeof records>();
    for(const record of records){
      const key=record[kind];
      const list=groups.get(key)??[];
      list.push(record);
      groups.set(key,list);
    }
    for(const [key,group] of groups){
      const n=group.length;
      buckets[kind][key]=makeStat(
        n,
        group.reduce((s,r)=>s+r.progressed,0),
        group.reduce((s,r)=>s+r.interviewed,0),
        group.reduce((s,r)=>s+r.offered,0),
        group.reduce((s,r)=>s+r.rejected,0),
        baselineRate
      );
    }
  }
  return {baseline,features:buckets};
}

export async function recordApplicationStageEvent(args:{
  profileId:number;
  applicationId:number;
  fromStage:string|null;
  toStage:string;
  source:"user"|"mailbox"|"system";
  metadata?:Record<string,unknown>;
}){
  const [event]=await db.insert(applicationStageEvents).values({
    profileId:args.profileId,
    applicationId:args.applicationId,
    fromStage:args.fromStage,
    toStage:args.toStage,
    source:args.source,
    metadata:args.metadata??{}
  }).returning();
  return event;
}

export async function retrainOutcomeModel(profileId:number){
  const rows=await loadTrainingRows(profileId);
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
  const model=aggregate(rows,stageHistory);
  const [existing]=await db.select().from(outcomeLearningModels).where(eq(outcomeLearningModels.profileId,profileId)).limit(1);
  const nextVersion=(existing?.version??0)+1;
  const values={
    profileId,version:nextVersion,sampleCount:rows.length,
    baseline:model.baseline,featureStats:model.features,trainedAt:new Date(),updatedAt:new Date()
  };
  let saved;
  if(existing){
    [saved]=await db.update(outcomeLearningModels).set(values).where(eq(outcomeLearningModels.id,existing.id)).returning();
  }else{
    [saved]=await db.insert(outcomeLearningModels).values(values).returning();
  }
  await trainRankingCalibration(profileId);
  return saved;
}

export async function getOutcomeModel(profileId:number){
  const [model]=await db.select().from(outcomeLearningModels).where(eq(outcomeLearningModels.profileId,profileId)).limit(1);
  return model??null;
}

export function getLearningAdjustment(model:Awaited<ReturnType<typeof getOutcomeModel>>,job:{title:string;source:string;location:string|null},fitScore:number){
  if(!model||model.sampleCount<3)return {adjustment:0,signals:[],modelVersion:null};
  const features=model.featureStats as Record<string,Record<string,FeatureStat>>;
  const lookups=[
    ["roleFamily",roleFamily(job.title)],
    ["fitBand",fitBand(fitScore)],
    ["source",job.source||"unknown"],
    ["workMode",workMode(job.location)]
  ] as const;
  const signals:string[]=[];
  let adjustment=0;
  for(const [kind,key] of lookups){
    const stat=features[kind]?.[key];
    if(!stat||stat.n<2)continue;
    adjustment+=Math.round(stat.adjustment*clamp(stat.n/6,0,1));
    signals.push(kind+":"+key+" ("+stat.n+" apps)");
  }
  adjustment=clamp(adjustment,-10,10);
  return {adjustment,signals,modelVersion:model.version};
}
