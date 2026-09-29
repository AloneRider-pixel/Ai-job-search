import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applicationPackages, jobs } from "@/db/schema";
import { requireAuth } from "@/lib/auth/guards";
import { getProfileWithExperiences } from "@/lib/repositories";
import { buildAIApplicationPackage } from "@/lib/ai/application-package";

type Profile={name:string;headline?:string;experienceYears:number;skills:string[];summary?:string;experience:{title:string;company:string;bullets:string[]}[]};
type ExperienceRow={title:string;company:string;bullets:string[];startDate:Date|null;endDate:Date|null};

const requestSchema=z.object({jobId:z.number().int().positive(),jd:z.string().min(0).max(60000).optional().default("")});

const SKILLS=["Python","TypeScript","JavaScript","React","Next.js","Node.js","FastAPI","Flask","PostgreSQL","SQL","Redis","Docker","Kubernetes","AWS","GraphQL","REST APIs","CI/CD","Git","Testing","RAG","LLMs","Prompt Engineering","LangGraph","Airflow","dbt","Snowflake","System Design","Tailwind CSS","HTML","CSS","Java","C++","Power BI"];

function normalize(s:string){return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g," ").replace(/\s+/g," ").trim();}
function overlap(a:string,b:string){const aa=new Set(normalize(a).split(" ").filter(x=>x.length>2));const bb=new Set(normalize(b).split(" ").filter(x=>x.length>2));let n=0;aa.forEach(x=>{if(bb.has(x))n++;});return aa.size?n/aa.size:0;}
function experienceYears(rows:ExperienceRow[]){
  const intervals=rows.map(row=>{
    const start=row.startDate?.getTime()??Date.now();
    const end=Math.min(row.endDate?.getTime()??Date.now(),Date.now());
    return Math.max(0,end-start);
  });
  return Math.min(60,Math.round(intervals.reduce((sum,value)=>sum+value,0)/31557600000*10)/10);
}
function toProfile(profile:{name:string;headline:string|null;summary:string|null;skills:string[]},experiences:ExperienceRow[]):Profile{
  return {
    name:profile.name,
    headline:profile.headline??undefined,
    summary:profile.summary??undefined,
    skills:profile.skills??[],
    experienceYears:experienceYears(experiences),
    experience:experiences.map(e=>({title:e.title,company:e.company,bullets:e.bullets??[]}))
  };
}
function fallback(profile:Profile,jd:string,title:string,company:string){
  const found=SKILLS.filter(s=>jd.toLowerCase().includes(s.toLowerCase()));
  const matched=found.filter(s=>profile.skills.some(p=>normalize(p)===normalize(s)||normalize(p).includes(normalize(s))||normalize(s).includes(normalize(p))));
  const missing=found.filter(s=>!matched.includes(s));
  const reqs=jd.split(/\n|•|·/).map(x=>x.trim()).filter(x=>x.length>=18).slice(0,12);
  const requirements=reqs.map((r,i)=>{
    const best=profile.experience.flatMap(e=>e.bullets.map(b=>({text:"["+e.title+" @ "+e.company+"] "+b,score:overlap(r,b)}))).sort((a,b)=>b.score-a.score)[0];
    const ok=Boolean(best&&best.score>=.22);
    return {id:"req-"+(i+1),requirement:r,matched:ok,confidence:ok?Math.min(95,Math.round(55+best.score*40)):0,evidence:ok?[{source:"profile",text:best.text,score:best.score}]:[],gap:ok?null:"No verified candidate evidence. Do not add this requirement as a resume claim."};
  });
  const coverage=requirements.length?Math.round(requirements.filter(r=>r.matched).length/requirements.length*100):50;
  const skillCoverage=found.length?Math.round(matched.length/found.length*100):50;
  const score=Math.max(10,Math.min(98,Math.round(skillCoverage*.5+coverage*.3+75*.2)));
  const bullets=profile.experience.flatMap(e=>e.bullets.slice().sort((a,b)=>overlap(jd,b)-overlap(jd,a)).slice(0,4));
  return {
    job:{title,company},score,confidence:coverage,skillCoverage,coverage,matchedSkills:matched,missingSkills:missing,
    blockers:requirements.filter(r=>!r.matched).map(r=>r.requirement),requirements,
    resume:{content:[profile.name.toUpperCase(),title,profile.headline??"Software Engineer",profile.summary??"","","SKILLS",[...matched,...profile.skills.filter(s=>!matched.includes(s))].join(" · "),"","EXPERIENCE",...bullets.map(b=>"• "+b)].join("\n"),atsScore:Math.round(score*.7+coverage*.3)},
    outreach:{subject:title+" — application",body:"Hi Hiring Team,\n\nI’m preparing an application for the "+title+" role at "+company+". My strongest verified overlap is "+(matched.slice(0,3).join(", ")||"software engineering")+" .\n\nI’d welcome a brief conversation about the role.\n\n"+profile.name,personalizationSignals:[],verificationRequired:true},
    learning:missing.slice(0,6).map(g=>({gap:g,priority:"medium",rationale:"The JD mentions this skill but the current profile has no verified evidence.",action:"Study "+g+" and build real evidence before claiming it."})),
    interviewPrep:found.slice(0,5).map(s=>({area:s,questions:["Explain your production experience with "+s+".","How would you approach a "+s+" problem in this role?"]})),
    nextActions:["Review uncovered requirements.","Only use evidence-backed resume claims.","Verify recruiter/contact data through an authorized source.","Track the outcome so future ranking can learn."]
  };
}
async function persistPackage(profileId:number,jobId:number,pkg:any,aiPowered:boolean,model:string|null){
  const previous=await db.select({version:applicationPackages.version}).from(applicationPackages).where(and(
    eq(applicationPackages.profileId,profileId),eq(applicationPackages.jobId,jobId)
  ));
  const version=(previous.reduce((max,row)=>Math.max(max,row.version),0)||0)+1;
  const [saved]=await db.insert(applicationPackages).values({
    profileId,jobId,version,status:"ready",fitScore:pkg.score,resumeText:pkg.resume.content,
    outreachDraft:pkg.outreach?.body??null,requirementMatrix:pkg.requirements,learningPlan:pkg.learning,
    nextActions:pkg.nextActions,provenance:{aiPowered,model,generatedAt:new Date().toISOString()}
  }).returning();
  return saved;
}

export async function POST(req:NextRequest){
  try{
    const current=await requireAuth();
    const currentProfile=await getProfileWithExperiences(current.user.id);
    if(!currentProfile)return Response.json({error:"Profile not found."},{status:404});
    const payload=requestSchema.parse(await req.json());
    const [job]=await db.select().from(jobs).where(eq(jobs.id,payload.jobId)).limit(1);
    if(!job)return Response.json({error:"Job not found."},{status:404});

    const profile=toProfile(currentProfile.profile,currentProfile.experiences as ExperienceRow[]);
    const jd=payload.jd.trim()||job.description;
    let pkg:any;
    let aiPowered=false;
    let model:string|null=null;

    if(process.env.OPENAI_API_KEY){
      try{
        const result=await buildAIApplicationPackage({jd,title:job.title,company:job.company,profile});
        const ai=result.data;
        aiPowered=true;model=result.model;
        const resumeContent=[profile.name.toUpperCase(),job.title,profile.headline??"",ai.resume.summary,"","SKILLS",ai.resume.skills.join(" · "),"","EXPERIENCE",...ai.resume.bullets.map(b=>"• "+b.bullet)].join("\n");
        pkg={
          job:{title:job.title,company:job.company},score:ai.fitScore,confidence:ai.confidence,
          skillCoverage:ai.matchedSkills.length?Math.round(ai.matchedSkills.length/Math.max(ai.matchedSkills.length+ai.missingSkills.length,1)*100):50,
          coverage:ai.requirements.length?Math.round(ai.requirements.filter(r=>r.matched).length/ai.requirements.length*100):0,
          matchedSkills:ai.matchedSkills,missingSkills:ai.missingSkills,blockers:ai.blockers,
          requirements:ai.requirements.map((x,i)=>({id:"req-"+(i+1),...x,evidence:x.evidence.map(t=>({source:"AI evidence mapping",text:t,score:x.confidence/100}))})),
          resume:{content:resumeContent,atsScore:ai.resume.atsScore},outreach:ai.outreach,learning:ai.learning,interviewPrep:ai.interviewPrep,nextActions:ai.nextActions
        };
      }catch(error){console.warn("AI application package failed; using deterministic fallback.",error);}
    }
    if(!pkg)pkg=fallback(profile,jd,job.title,job.company);
    const saved=await persistPackage(currentProfile.profile.id,job.id,pkg,aiPowered,model);
    return Response.json({package:pkg,packageId:saved.id,version:saved.version,aiPowered,model,generatedAt:new Date().toISOString()});
  }catch(error){
    if(error instanceof Response)return error;
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application package request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to build application package."},{status:400});
  }
}
