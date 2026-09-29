import { NextRequest } from "next/server";

type Profile = {
  name: string;
  headline: string;
  experienceYears: number;
  skills: string[];
  summary: string;
  experience: { title: string; company: string; bullets: string[] }[];
};

const SKILLS = [
  "Python","TypeScript","JavaScript","React","Next.js","Node.js","FastAPI","Flask","PostgreSQL",
  "SQL","Redis","Docker","Kubernetes","AWS","GraphQL","REST APIs","CI/CD","Git","Testing",
  "RAG","LLMs","Prompt Engineering","LangGraph","Airflow","dbt","Snowflake","System Design",
  "Tailwind CSS","HTML","CSS","Java","C++","Power BI"
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string) {
  return new Set(normalize(s).split(" ").filter(function (x) { return x.length > 2; }));
}
function overlap(a: string, b: string) {
  const aa=tokens(a), bb=tokens(b);
  if (!aa.size || !bb.size) return 0;
  let n=0; aa.forEach(function(t){if(bb.has(t))n++});
  return n/Math.max(aa.size,1);
}
function extractSkills(jd: string) {
  const low=jd.toLowerCase();
  return SKILLS.filter(function(s){return low.includes(s.toLowerCase());});
}
function extractRequirements(jd: string) {
  const lines=jd.split(/\n|•|·/).map(function(x){return x.trim();}).filter(function(x){return x.length>=14 && x.length<=240;});
  return lines.filter(function(x){return /\b(require|must|minimum|experience|build|design|develop|ship|own|strong|proficient|expert|knowledge|familiar)\b/i.test(x);}).slice(0,16);
}

function buildPackage(profile: Profile, jd: string, title: string, company: string) {
  const skills=extractSkills(jd);
  const reqs=extractRequirements(jd);
  const corpus=profile.experience.flatMap(function(e){return e.bullets.map(function(b){return {source:"experience",text:e.title+" @ "+e.company+": "+b};});});
  const matchedSkills=skills.filter(function(s){
    const ns=normalize(s);
    return profile.skills.some(function(p){const np=normalize(p);return np===ns || np.indexOf(ns)>=0 || ns.indexOf(np)>=0;});
  });
  const missingSkills=skills.filter(function(s){return !matchedSkills.includes(s);});
  const evidence=reqs.map(function(r,i){
    const ranked=corpus.map(function(x){return {...x,score:overlap(r,x.text)};}).filter(function(x){return x.score>=0.2;}).sort(function(a,b){return b.score-a.score;}).slice(0,2);
    const direct=matchedSkills.find(function(s){return normalize(r).indexOf(normalize(s))>=0;});
    if(direct && ranked.length===0) ranked.push({source:"skill",text:"Verified profile skill: "+direct,score:.72});
    const ok=ranked.length>0;
    return {id:"req-"+(i+1),requirement:r,matched:ok,confidence:ok?Math.min(99,Math.round(55+ranked[0].score*40)):0,evidence:ranked,gap:ok?null:"No verified evidence in the profile. Keep this requirement visible; do not add it as a resume claim."};
  });
  const coverage=reqs.length?Math.round(evidence.filter(function(e){return e.matched;}).length/reqs.length*100):Math.round(matchedSkills.length/Math.max(skills.length,1)*100);
  const skillCoverage=skills.length?Math.round(matchedSkills.length/skills.length*100):50;
  const years=profile.experienceYears;
  const yrMatch=jd.match(/(\d{1,2})\+?\s*(?:years|yrs?)/i);
  const seniority=yrMatch ? (years>=Number(yrMatch[1])?95:Math.max(30,70-(Number(yrMatch[1])-years)*12)) : 75;
  const score=Math.max(10,Math.min(98,Math.round(skillCoverage*.45+coverage*.35+seniority*.2)));
  const topProof=profile.experience[0]?.bullets?.slice(0,2) ?? [];
  const orderedSkills=[...matchedSkills,...profile.skills.filter(function(s){return !matchedSkills.includes(s);})];
  const resume=[
    profile.name.toUpperCase(),
    title,
    profile.headline+" · "+profile.experienceYears+"+ years",
    profile.summary,
    "",
    "SKILLS",
    orderedSkills.join(" · "),
    "",
    "EXPERIENCE",
    ...profile.experience.flatMap(function(e){return [e.title+" — "+e.company,...e.bullets.slice().sort(function(a,b){return overlap(jd,a)-overlap(jd,b);}).slice(0,4).map(function(b){return "• "+b;}),""];})
  ].join("\n");
  const proof=topProof[0] ?? profile.summary;
  const email={
    subject:title+" — relevant engineering evidence",
    body:"Hi Hiring Team,\n\nI'm preparing an application for the "+title+" role at "+company+". The strongest overlap I can prove is "+(matchedSkills.slice(0,3).join(", ")||"core software engineering")+" .\n\nOne concrete proof point: "+proof+"\n\nI've tailored my resume around the requirements I can genuinely prove, while keeping missing requirements explicit.\n\nI'd appreciate a brief conversation about the role and where this background could be useful.\n\n"+profile.name
  };
  const gaps=missingSkills.slice(0,5).map(function(g){return {gap:g,action:"Study "+g+", complete one hands-on exercise, and only add it to the resume after you have real evidence."};});
  return {
    job:{title,company},score,confidence:Math.max(50,Math.min(99,coverage)),
    skillCoverage,coverage,matchedSkills,missingSkills,blockers:evidence.filter(function(e){return !e.matched;}).length,
    requirements:evidence,resume:{content:resume,atsScore:Math.max(0,Math.min(99,Math.round(score*.7+coverage*.3)))},outreach:email,learning:gaps,
    nextActions:[
      "Review every missing must-have before applying.",
      "Use only evidence-backed resume claims.",
      "Verify a real recruiter or hiring manager through an authorized source.",
      "Submit manually, then log the outcome so future ranking can learn."
    ]
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jd=String(body.jd??"").trim();
  if(jd.length<40) return Response.json({error:"Paste a full job description (at least 40 characters)."}, {status:400});
  const profile:Profile=body.profile ?? {
    name:"Candidate",headline:"Software Engineer",experienceYears:2,skills:["Python","SQL","FastAPI","PostgreSQL","Docker","AWS"],summary:"Software engineer with production experience building reliable backend systems.",experience:[{title:"Software Engineer",company:"Current Company",bullets:["Built and shipped production services with measurable reliability and performance improvements."]}]
  };
  return Response.json({package:buildPackage(profile,jd,String(body.title??"Target role"),String(body.company??"Target company"))});
}
