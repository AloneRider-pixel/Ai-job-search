import { NextRequest } from "next/server";
import { z } from "zod";
import { buildAIApplicationPackage } from "@/lib/ai/application-package";

type Profile = {
  name: string;
  headline?: string;
  experienceYears: number;
  skills: string[];
  summary?: string;
  experience: { title: string; company: string; bullets: string[] }[];
};

const requestSchema = z.object({
  jd: z.string().min(40).max(60000),
  title: z.string().min(1).max(240),
  company: z.string().min(1).max(240),
  profile: z.object({
    name: z.string().min(1).max(160),
    headline: z.string().max(240).optional(),
    experienceYears: z.number().min(0).max(60),
    skills: z.array(z.string().min(1).max(120)).max(200),
    summary: z.string().max(5000).optional(),
    experience: z.array(z.object({
      title: z.string().max(180),
      company: z.string().max(180),
      bullets: z.array(z.string().max(1000)).max(20),
    })).max(30),
  }),
});

const SKILLS=["Python","TypeScript","JavaScript","React","Next.js","Node.js","FastAPI","Flask","PostgreSQL","SQL","Redis","Docker","Kubernetes","AWS","GraphQL","REST APIs","CI/CD","Git","Testing","RAG","LLMs","Prompt Engineering","LangGraph","Airflow","dbt","Snowflake","System Design","Tailwind CSS","HTML","CSS","Java","C++","Power BI"];

function normalize(s:string){return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g," ").replace(/\s+/g," ").trim();}
function overlap(a:string,b:string){const aa=new Set(normalize(a).split(" ").filter(x=>x.length>2));const bb=new Set(normalize(b).split(" ").filter(x=>x.length>2));let n=0;aa.forEach(x=>{if(bb.has(x))n++;});return aa.size?n/aa.size:0;}
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
  const bullets=profile.experience.flatMap(e=>e.bullets.slice().sort((a,b)=>overlap(jd,b)-overlap(jd,a)).slice(0,4).map(b=>({experience:e.title,company:e.company,bullet:b,evidence:["Source profile experience"]})));
  return {
    job:{title,company},score,confidence:coverage,skillCoverage,coverage,matchedSkills:matched,missingSkills:missing,
    blockers:requirements.filter(r=>!r.matched).map(r=>r.requirement),requirements,
    resume:{content:[profile.name.toUpperCase(),title,profile.headline??"Software Engineer",profile.summary??"","","SKILLS",[...matched,...profile.skills.filter(s=>!matched.includes(s))].join(" · "),"","EXPERIENCE",...bullets.map(b=>"• "+b.bullet)].join("\n"),atsScore:Math.round(score*.7+coverage*.3)},
    outreach:{subject:title+" — application",body:"Hi Hiring Team,\n\nI’m preparing an application for the "+title+" role at "+company+". My strongest verified overlap is "+(matched.slice(0,3).join(", ")||"software engineering")+" .\n\nI’d welcome a brief conversation about the role.\n\n"+profile.name,personalizationSignals:[],verificationRequired:true},
    learning:missing.slice(0,6).map(g=>({gap:g,priority:"medium",rationale:"The JD mentions this skill but the current profile has no verified evidence.",action:"Study "+g+" and build real evidence before claiming it."})),
    interviewPrep:found.slice(0,5).map(s=>({area:s,questions:["Explain your production experience with "+s+".","How would you approach a "+s+" problem in this role?"]})),
    nextActions:["Review uncovered requirements.","Only use evidence-backed resume claims.","Verify recruiter/contact data through an authorized source.","Track the outcome so future ranking can learn."]
  };
}

export async function POST(req:NextRequest){
  try{
    const payload=requestSchema.parse(await req.json());
    if(process.env.OPENAI_API_KEY){
      try{
        const result=await buildAIApplicationPackage(payload);
        const ai=result.data;
        const resumeContent=[payload.profile.name.toUpperCase(),payload.title,payload.profile.headline??"",ai.resume.summary,"","SKILLS",ai.resume.skills.join(" · "),"","EXPERIENCE",...ai.resume.bullets.map(b=>"• "+b.bullet)].join("\n");
        return Response.json({
          package:{
            job:{title:payload.title,company:payload.company},score:ai.fitScore,confidence:ai.confidence,
            skillCoverage:ai.matchedSkills.length?Math.round(ai.matchedSkills.length/Math.max(ai.matchedSkills.length+ai.missingSkills.length,1)*100):50,
            coverage:ai.requirements.length?Math.round(ai.requirements.filter(r=>r.matched).length/ai.requirements.length*100):0,
            matchedSkills:ai.matchedSkills,missingSkills:ai.missingSkills,blockers:ai.blockers,
            requirements:ai.requirements.map((r,i)=>({id:"req-"+(i+1),...r,evidence:r.evidence.map(text=>({source:"AI evidence mapping",text,score:r.confidence/100}))})),
            resume:{content:resumeContent,atsScore:ai.resume.atsScore},
            outreach:ai.outreach,learning:ai.learning,interviewPrep:ai.interviewPrep,nextActions:ai.nextActions
          },
          aiPowered:true,model:result.model,generatedAt:new Date().toISOString()
        });
      }catch(error){
        console.warn("AI application package failed; using deterministic fallback.",error);
      }
    }
    return Response.json({package:fallback(payload.profile,payload.jd,payload.title,payload.company),aiPowered:false,model:null,generatedAt:new Date().toISOString()});
  }catch(error){
    if(error&&typeof error==="object"&&"issues" in error)return Response.json({error:"Invalid application package request.",details:(error as {issues:unknown}).issues},{status:400});
    return Response.json({error:error instanceof Error?error.message:"Unable to build application package."},{status:400});
  }
}
