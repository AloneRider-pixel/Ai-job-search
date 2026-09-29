type RecordLike=Record<string,any>;

export type ContactCandidate={
  provider:"apollo";
  providerPersonId:string|null;
  company:string;
  name:string|null;
  role:string|null;
  profileUrl:string|null;
  email:string|null;
  emailStatus:string|null;
  matchConfidence:string|null;
  confidence:number;
  sourceDomain:string|null;
  evidence:Record<string,unknown>[];
};

const ATS_HOSTS=new Set([
  "lever.co","jobs.lever.co","ashbyhq.com","jobs.ashbyhq.com",
  "greenhouse.io","boards.greenhouse.io","workable.com","jobvite.com",
  "smartrecruiters.com","myworkdayjobs.com","linkedin.com","indeed.com"
]);

function text(value:unknown){return typeof value==="string"&&value.trim()?value.trim():null;}
function required(name:string){const value=process.env[name];if(!value)throw new Error(name+" is not configured.");return value;}

function cleanDomain(value:string|null){
  if(!value)return null;
  try{
    const url=value.includes("://")?new URL(value):new URL("https://"+value);
    const host=url.hostname.toLowerCase().replace(/^www\./,"");
    if(!host||ATS_HOSTS.has(host)||host.endsWith(".lever.co")||host.endsWith(".ashbyhq.com")||host.endsWith(".greenhouse.io"))return null;
    return host;
  }catch{return null;}
}

function urlDomain(value:unknown){
  return cleanDomain(typeof value==="string"?value:null);
}

export async function resolveCompanyDomain(company:string,metadata:RecordLike,applyUrl:string|null,sourceUrl:string|null){
  const hints=["companyDomain","domain","company_domain"].map((key)=>text(metadata[key])).map(cleanDomain).filter(Boolean) as string[];
  if(hints[0])return {domain:hints[0],source:"job_metadata"};

  if(process.env.HUNTER_API_KEY){
    const response=await fetch("https://api.hunter.io/v2/domain-finder?"+new URLSearchParams({
      company,
      api_key:process.env.HUNTER_API_KEY,
      limit:"5",
      perfect_match:"true"
    }).toString(),{headers:{accept:"application/json"},signal:AbortSignal.timeout(12_000),cache:"no-store"});
    const payload=await response.json() as RecordLike;
    if(!response.ok)throw new Error("Hunter domain resolution failed: "+response.status);
    const rows=Array.isArray(payload.data)?payload.data:[];
    const match=rows.find((row:unknown)=>cleanDomain(text((row as RecordLike).domain)));
    const domain=match?cleanDomain(text(match.domain)):null;
    if(domain)return {domain,source:"hunter_domain_finder"};
  }

  const hinted=[applyUrl,sourceUrl].map(urlDomain).filter(Boolean) as string[];
  if(hinted[0])return {domain:hinted[0],source:"job_url"};
  return {domain:null,source:null};
}

function titleFit(role:string|null){
  const value=(role??"").toLowerCase();
  const exact=[
    "technical recruiter","engineering recruiter","talent acquisition",
    "talent partner","recruiter","recruiting","hiring manager",
    "human resources","people partner","campus recruiter"
  ];
  const strong=exact.some((term)=>value.includes(term));
  if(strong)return 36;
  if(/people|hr|talent|recruit/.test(value))return 30;
  if(/manager|director|head|vp|lead/.test(value))return 18;
  return 8;
}

function clamp(value:number){return Math.max(0,Math.min(100,Math.round(value)));}

function scoreContact(args:{role:string|null;profileUrl:string|null;email:string|null;emailStatus:string|null;matchConfidence:string|null;companyMatches:boolean;domainMatches:boolean}){
  let score=titleFit(args.role);
  if(args.companyMatches)score+=25;
  if(args.domainMatches)score+=15;
  if(args.profileUrl)score+=10;
  if(args.email)score+=5;
  if(args.emailStatus==="verified")score+=10;
  else if(args.emailStatus==="likely to engage"||args.emailStatus==="valid")score+=6;
  if(args.matchConfidence==="high")score+=5;
  else if(args.matchConfidence==="medium")score+=3;
  return clamp(score);
}

async function apolloRequest(url:string,init:RequestInit={}){
  const response=await fetch(url,{
    ...init,
    headers:{
      accept:"application/json",
      "content-type":"application/json",
      "cache-control":"no-cache",
      "x-api-key":required("APOLLO_API_KEY"),
      ...(init.headers??{})
    },
    signal:AbortSignal.timeout(15_000)
  });
  const payload=await response.json().catch(()=>({})) as RecordLike;
  if(!response.ok)throw new Error("Apollo request failed: "+response.status);
  return payload;
}

const recruiterTitles=[
  "Technical Recruiter","Engineering Recruiter","Technical Talent Partner",
  "Talent Acquisition Partner","Talent Acquisition Specialist","Senior Recruiter",
  "Recruiter","Recruiting Manager","Talent Partner","Hiring Manager",
  "People Partner","Campus Recruiter"
];

export async function discoverContacts(input:{
  company:string;
  domain:string;
  maxResults:number;
}):Promise<ContactCandidate[]>{
  const params=new URLSearchParams();
  for(const title of recruiterTitles)params.append("person_titles[]",title);
  params.set("include_similar_titles","false");
  params.append("q_organization_domains_list[]",input.domain);
  params.set("per_page",String(Math.min(Math.max(input.maxResults,1),25)));
  params.set("page","1");

  const search=await apolloRequest("https://api.apollo.io/api/v1/mixed_people/api_search?"+params.toString(),{method:"POST",body:"{}"});
  const people=Array.isArray(search.people)?search.people:[];
  const candidates:ContactCandidate[]=[];

  for(const raw of people.slice(0,input.maxResults)){
    const person=raw as RecordLike;
    const personId=text(person.person_id)??text(person.id);
    let enriched:RecordLike=person;

    if(personId){
      try{
        const enrichUrl="https://api.apollo.io/api/v1/people/match?"+new URLSearchParams({
          id:personId,
          reveal_personal_emails:"false",
          reveal_phone_number:"false"
        }).toString();
        const result=await apolloRequest(enrichUrl,{method:"POST",body:"{}"});
        if(result.person&&typeof result.person==="object")enriched=result.person as RecordLike;
      }catch{
        // Search results are still useful without enrichment. Preserve the provider evidence.
      }
    }

    const name=text(enriched.name)??[text(enriched.first_name),text(enriched.last_name)].filter(Boolean).join(" ")||null;
    const role=text(enriched.title)??text(person.title);
    const profileUrl=text(enriched.linkedin_url)??text(person.linkedin_url);
    const email=text(enriched.email);
    const emailStatus=text(enriched.email_status)??text(person.email_status);
    const matchConfidence=text(enriched.match_confidence)??text(person.match_confidence);
    const organization=enriched.organization&&typeof enriched.organization==="object"?enriched.organization as RecordLike:{};
    const organizationName=text(organization.name)??text(enriched.organization_name)??text(person.organization_name)??input.company;
    const organizationDomain=cleanDomain(text(organization.primary_domain)??input.domain);
    const companyMatches=organizationName.toLowerCase().replace(/[^a-z0-9]/g,"").includes(input.company.toLowerCase().replace(/[^a-z0-9]/g,""))
      || input.company.toLowerCase().replace(/[^a-z0-9]/g,"").includes(organizationName.toLowerCase().replace(/[^a-z0-9]/g,""));
    const domainMatches=organizationDomain===input.domain;

    const confidence=scoreContact({role,profileUrl,email,emailStatus,matchConfidence,companyMatches,domainMatches});
    const sources=Array.isArray(enriched.sources)?enriched.sources:[] as unknown[];
    const evidence:Record<string,unknown>[]=[
      {provider:"apollo",providerPersonId:personId,company:organizationName,domain:organizationDomain,jobTitle:role,matchConfidence,emailStatus,retrievedAt:new Date().toISOString()},
      ...sources.slice(0,10).map((source:unknown)=>({provider:"apollo",source}))
    ];

    candidates.push({
      provider:"apollo",
      providerPersonId:personId,
      company:organizationName,
      name,
      role,
      profileUrl,
      email,
      emailStatus,
      matchConfidence,
      confidence,
      sourceDomain:organizationDomain,
      evidence
    });
  }

  return candidates.sort((a,b)=>b.confidence-a.confidence);
}
