"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Tab="command"|"radar"|"studio"|"tracker";
type Stage="wishlist"|"applied"|"screening"|"interview"|"offer"|"rejected";
type Job={id:number;title:string;company:string;location:string|null;description:string;skills?:string[];score:number;baseScore?:number;learningAdjustment?:number;learningSignals?:string[];calibrationAdjustment?:number;calibrationConfidence?:number;calibrationIndex?:number;calibrationSignals?:string[];postedAt:string|null;applyUrl:string|null};
type Profile={id:number;name:string;headline:string|null;summary:string|null;skills:string[];targetRoles:string[];targetLocations:string[];location:string|null};
type Application={id:number;jobId:number;packageId:number|null;stage:Stage;appliedAt:string|null;nextAction:string|null;nextActionAt:string|null;notes:string|null;outcome:string|null};
type ApplicationRow={application:Application;job:Job;package:any|null};
type Requirement={id:string;requirement:string;matched:boolean;confidence:number;evidence:{source:string;text:string;score:number}[];gap:string|null};
type AppPackage={job:{title:string;company:string};score:number;confidence:number;skillCoverage:number;coverage:number;matchedSkills:string[];missingSkills:string[];blockers:string[];requirements:Requirement[];resume:{content:string;atsScore:number};outreach:{subject:string;body:string;verificationRequired?:boolean};learning:{gap:string;action:string}[];interviewPrep?:unknown[];nextActions:string[]};

const STAGES:Stage[]=["wishlist","applied","screening","interview","offer","rejected"];

function stageIndex(stage:Stage){return STAGES.indexOf(stage);}
function niceStage(stage:string){return stage.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}

export default function Home(){
  const [tab,setTab]=useState<Tab>("command");
  const [profile,setProfile]=useState<Profile|null>(null);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [applications,setApplications]=useState<ApplicationRow[]>([]);
  const [jobId,setJobId]=useState<number|null>(null);
  const [jd,setJd]=useState("");
  const [pkg,setPkg]=useState<AppPackage|null>(null);
  const [packageId,setPackageId]=useState<number|null>(null);
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");

  async function load(){
    setBusy("loading");
    try{
      const [meRes,jobsRes,appsRes]=await Promise.all([fetch("/api/auth/me"),fetch("/api/jobs?limit=100"),fetch("/api/applications")]);
      if(!meRes.ok||!jobsRes.ok||!appsRes.ok)throw new Error("Unable to load CareerOS data.");
      const me=await meRes.json();
      const jobData=await jobsRes.json();
      const appData=await appsRes.json();
      setProfile(me.profile??null);
      const loadedJobs=jobData.jobs??[];
      setJobs(loadedJobs);
      setApplications(appData.applications??[]);
      if(jobId===null&&loadedJobs[0])setJobId(loadedJobs[0].id);
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to load CareerOS data.");}
    finally{setBusy("");}
  }

  useEffect(() => {
  let cancelled = false;
  Promise.all([fetch("/api/auth/me"), fetch("/api/jobs?limit=100"), fetch("/api/applications")])
    .then(async ([meRes, jobsRes, appsRes]) => {
      if (!meRes.ok || !jobsRes.ok || !appsRes.ok) throw new Error("Unable to load CareerOS data.");
      const me = await meRes.json();
      const jobData = await jobsRes.json();
      const appData = await appsRes.json();
      const loadedJobs = jobData.jobs ?? [];
      if (cancelled) return;
      setProfile(me.profile ?? null);
      setJobs(loadedJobs);
      setApplications(appData.applications ?? []);
      setJobId(current => current ?? loadedJobs[0]?.id ?? null);
    })
    .catch(error => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Unable to load CareerOS data.");
    });
  return () => {
    cancelled = true;
  };
}, []);

  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim();
    if(!q)return jobs;
    return jobs.filter(j=>(j.title+" "+j.company+" "+(j.location??"")+" "+(j.description??"")).toLowerCase().includes(q));
  },[jobs,query]);

  const selected=jobs.find(j=>j.id===jobId)??jobs[0];
  const trackedIds=new Set(applications.map(row=>row.application.jobId));

  async function track(job:number,packageIdArg:number|null=null){
    setBusy("track-"+job);setNotice("");
    try{
      const res=await fetch("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:job,packageId:packageIdArg,stage:"wishlist"})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to track job.");
      await load();
      setNotice("Saved to your persistent application pipeline.");
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to track job.");}
    finally{setBusy("");}
  }

  async function advance(row:ApplicationRow,next:Stage){
    if(row.application.stage==="rejected"||row.application.stage==="offer")return;
    setBusy("advance-"+row.application.id);setNotice("");
    try{
      const res=await fetch("/api/applications/"+row.application.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage:next})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to update application.");
      setApplications(rows=>rows.map(x=>x.application.id===row.application.id?{...x,application:data.application}:x));
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to update application.");}
    finally{setBusy("");}
  }

  async function build(){
    if(!selected){setNotice("No job is available yet.");return;}
    setBusy("build");setNotice("");setPkg(null);setPackageId(null);
    try{
      const res=await fetch("/api/application-package",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:selected.id,jd:jd.trim()})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Build failed.");
      setPkg(data.package);setPackageId(data.packageId??null);setTab("studio");
      setNotice((data.aiPowered?"AI":"Deterministic")+" package generated and persisted as version "+data.version+".");
      await load();
    }catch(error){setNotice(error instanceof Error?error.message:"Build failed.");}
    finally{setBusy("");}
  }

  function openStudio(job:number){
    setJobId(job);setJd("");setPkg(null);setPackageId(null);setTab("studio");setNotice("");
  }

  const avgFit=jobs.length?Math.round(jobs.reduce((sum,j)=>sum+j.score,0)/jobs.length):0;
  const activeApps=applications.filter(x=>!["offer","rejected"].includes(x.application.stage)).length;

  return <div className="shell">
    <header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark">◎</span><span>Career<span style={{color:"var(--lime)"}}>OS</span></span></div><div className="row"><a className="btn" href="/inbox">Inbox</a><a className="btn" href="/settings/integrations">Integrations</a><a className="btn" href="/recruiter-intelligence">Recruiters</a><a className="btn" href="/learning">Learning</a><a className="btn" href="/interview">InterviewOS</a><a className="btn" href="/resumes">Resume Vault</a><span className="badge">Persistent + Learning Career OS</span></div></div></header>

    <div className="layout">
      <aside className="sidebar"><nav className="nav">
        {([["command","Command Center"],["radar","Job Radar"],["studio","Application Studio"],["tracker","Application Tracker"]] as const).map(item=><button key={item[0]} className={tab===item[0]?"active":""} onClick={()=>setTab(item[0])}>{item[1]}</button>)}
      </nav><div className="card" style={{marginTop:12}}><div className="mono">PERSISTENT DATA</div><h3 style={{marginTop:7}}>{profile?.name??"Candidate profile"}</h3><p className="small muted">{profile?.headline??"Complete your profile to improve ranking and package quality."}</p><div className="chips" style={{marginTop:8}}>{(profile?.skills??[]).slice(0,5).map(s=><span className="chip ok" key={s}>{s}</span>)}</div></div></aside>

      <main className="content">
        {notice&&<div className="notice" style={{marginBottom:14}}>{notice}</div>}

        {tab==="command"&&<section>
          <div className="hero"><div><div className="kicker">persistent evidence-backed search</div><h1>Build proof.<br/><span style={{color:"var(--lime)"}}>Apply with precision.</span></h1><p className="sub">Your profile, jobs, application stages and generated packages now live behind authenticated APIs instead of browser-local tracker state.</p></div><button className="btn primary" onClick={()=>setTab("radar")}>Open Job Radar →</button></div>
          <div className="grid grid3"><div className="card stat"><div><div className="mono">TARGET JOBS</div><strong>{jobs.length}</strong></div><span className="chip ok">persistent</span></div><div className="card stat"><div><div className="mono">AVG FIT</div><strong>{avgFit}</strong></div><span className="chip ok">profile-ranked</span></div><div className="card stat"><div><div className="mono">ACTIVE APPLICATIONS</div><strong>{activeApps}</strong></div><span className="chip">{applications.length} observed</span></div></div>
          <div className="grid grid2" style={{marginTop:14}}><div className="card"><div className="mono">CANDIDATE PROFILE</div><h2 style={{marginTop:5}}>{profile?.name??"Profile not initialized"}</h2><p className="sub">{profile?.summary??"Create a candidate profile to power evidence-backed ranking and tailored packages."}</p><div className="chips">{(profile?.targetRoles??[]).map(x=><span className="chip" key={x}>{x}</span>)}</div></div><div className="card"><div className="mono">SYSTEM LOOP</div><h2 style={{marginTop:5}}>Search → package → track → outcome</h2><div className="grid" style={{marginTop:12}}>{["Profile-aware job ranking","Versioned application package","PostgreSQL application CRM","Recruiter intelligence","Mailbox event automation","Outcome learning","Adaptive InterviewOS"].map((x,i)=><div className="row" key={x}><span className="chip ok">{String(i+1).padStart(2,"0")}</span><span className="small">{x}</span></div>)}</div></div></div>
        </section>}

        {tab==="radar"&&<section>
          <div className="hero"><div><div className="kicker">live persisted job index</div><h1>Job Radar</h1><p className="sub">Jobs are loaded from the server and ranked against the authenticated profile.</p></div><input value={query} onChange={e=>setQuery(e.target.value)} className="field" style={{maxWidth:320}} placeholder="Search role, company, skill"/></div>
          {busy==="loading"?<div className="card">Loading persisted jobs…</div>:<div className="grid">{filtered.map(j=><div className="card job" key={j.id}><div><div className="job-title">{j.title}</div><div className="muted small">{j.company} · {j.location??"Location not specified"} · {j.postedAt?new Date(j.postedAt).toLocaleDateString():"date unknown"}</div><div className="chips" style={{marginTop:8}}>{(j.skills??[]).slice(0,7).map(s=><span className="chip ok" key={s}>{s}</span>)}</div></div><div className="row"><div><div className="score">{j.score}</div>{j.calibrationAdjustment? <div className="small muted">cal {j.calibrationAdjustment>0?"+":""}{j.calibrationAdjustment} · {j.calibrationConfidence??0}% conf</div>:j.learningAdjustment? <div className="small muted">learn {j.learningAdjustment>0?"+":""}{j.learningAdjustment}</div>:null}</div><button className="btn primary" onClick={()=>openStudio(j.id)}>Build</button>{trackedIds.has(j.id)?<span className="chip ok">Tracked</span>:<button className="btn" disabled={busy==="track-"+j.id} onClick={()=>track(j.id)}>{busy==="track-"+j.id?"Saving…":"Track"}</button>}</div></div>)}</div>}
        </section>}

        {tab==="studio"&&<section>
          <div className="hero"><div><div className="kicker">versioned application studio</div><h1>Application Studio</h1><p className="sub">The server builds from your authenticated profile and persists every generated application package as a version.</p></div></div>
          <div className="grid grid2"><div className="card"><div className="mono">1 · TARGET</div><select className="field" style={{marginTop:8}} value={selected?.id??""} onChange={e=>setJobId(Number(e.target.value))}><option value="">Select a persisted job…</option>{jobs.map(j=><option value={j.id} key={j.id}>{j.title} @ {j.company}</option>)}</select><div className="mono" style={{marginTop:14}}>2 · OPTIONAL JD OVERRIDE</div><textarea className="field" style={{marginTop:8,minHeight:220}} value={jd} onChange={e=>setJd(e.target.value)} placeholder="Paste a newer/full JD to override the stored description…"/><button className="btn primary" style={{marginTop:10}} disabled={!selected||busy==="build"} onClick={build}>{busy==="build"?"Generating + persisting…":"Build application package"}</button><div className="notice" style={{marginTop:12}}>Truth layer: the server owns candidate evidence. Do not type invented experience into the profile.</div></div>
          <div className="card">{!pkg?<div style={{minHeight:320,display:"grid",placeItems:"center",textAlign:"center"}}><div><div style={{fontSize:32}}>⌁</div><h2>No package loaded</h2><p className="muted">Build from a persisted job to generate a versioned package.</p></div></div>:<><div className="row between"><div><div className="mono">PACKAGE V{packageId??"?"}</div><div style={{fontSize:38,fontWeight:900,color:"var(--lime)",marginTop:5}}>{pkg.score}<span className="muted" style={{fontSize:14}}>/100</span></div></div><div className="score">{pkg.resume.atsScore}</div></div><p className="sub">Evidence confidence {pkg.confidence}% · {pkg.blockers.length} uncovered requirements.</p><div className="chips"><span className="chip ok">skill {pkg.skillCoverage}%</span><span className="chip ok">evidence {pkg.coverage}%</span>{pkg.missingSkills.slice(0,5).map(x=><span className="chip warn" key={x}>{x}</span>)}</div><button className="btn primary" style={{marginTop:14}} onClick={()=>selected&&track(selected.id,packageId)}>Save package to application pipeline</button></>}</div></div>
          {pkg&&<div className="grid" style={{marginTop:14}}><div className="card"><div className="row between"><div><div className="mono">REQUIREMENT → PROOF</div><h2 style={{marginTop:5}}>Evidence graph</h2></div><span className="badge">{pkg.requirements.filter(r=>r.matched).length}/{pkg.requirements.length} mapped</span></div><div className="matrix" style={{marginTop:12}}>{pkg.requirements.map(r=><div key={r.id} className={"matrix-row "+(r.matched?"ok":"bad")}><div className={r.matched?"iconok":"iconbad"}>{r.matched?"✓":"×"}</div><div><strong>{r.requirement}</strong><div className="mono" style={{marginTop:4}}>{r.matched?"confidence "+r.confidence+"%":"MISSING EVIDENCE"}</div></div><div>{r.matched?r.evidence.map(e=><div className="small muted" key={e.text}><span className="mono">{e.source}</span> · {e.text}</div>):<div className="small" style={{color:"var(--amber)"}}>{r.gap}</div>}</div></div>)}</div></div><div className="grid grid2"><div className="card"><div className="mono">TAILORED RESUME</div><h2 style={{marginTop:5}}>Evidence-backed resume</h2><div className="resume" style={{marginTop:10}}>{pkg.resume.content}</div></div><div className="card"><div className="mono">OUTREACH DRAFT</div><h2 style={{marginTop:5}}>{pkg.outreach.subject}</h2><div className="email" style={{marginTop:12}}>{pkg.outreach.body}</div><div className="notice warn" style={{marginTop:14}}>Recipient data still requires recruiter-intelligence verification and human approval.</div></div></div><div className="grid grid2"><div className="card"><div className="mono">LEARNING ENGINE</div><h2 style={{marginTop:5}}>Evidence gaps</h2>{pkg.learning.length?pkg.learning.map(l=><div style={{borderTop:"1px solid var(--line)",padding:"10px 0"}} key={l.gap}><strong>{l.gap}</strong><div className="small muted">{l.action}</div></div>):<div className="notice">No material gaps surfaced.</div>}</div><div className="card"><div className="mono">NEXT ACTIONS</div><h2 style={{marginTop:5}}>Execution queue</h2>{pkg.nextActions.map(a=><div className="row" style={{marginTop:10,alignItems:"flex-start"}} key={a}><span style={{color:"var(--lime)"}}>→</span><span className="small">{a}</span></div>)}</div></div></div>}
        </section>}

        {tab==="tracker"&&<section>
          <div className="hero"><div><div className="kicker">persistent application CRM</div><h1>Application Tracker</h1><p className="sub">Every stage change is written to PostgreSQL and scoped to your authenticated profile.</p></div><button className="btn" onClick={()=>load()}>{busy==="loading"?"Refreshing…":"Refresh"}</button></div>
          {!applications.length?<div className="card"><h2>No tracked applications yet.</h2><p className="sub">Track a job from Job Radar or save a generated package.</p></div>:<div className="board">{STAGES.map(stage=><div className="col" key={stage}><h3>{niceStage(stage)}</h3>{applications.filter(row=>row.application.stage===stage).map(row=>{const next=stageIndex(stage)<STAGES.length-1?STAGES[stageIndex(stage)+1]:stage;return <div className="card-mini" key={row.application.id}><strong>{row.job.title}</strong><span>{row.job.company}</span><span>fit {row.job.score}%</span>{row.application.nextAction&&<span>{row.application.nextAction}</span>}{!["offer","rejected"].includes(stage)&&<button className="btn" style={{marginTop:8,width:"100%",padding:"7px"}} disabled={busy==="advance-"+row.application.id} onClick={()=>advance(row,next)}>Move → {niceStage(next)}</button>}</div>})}</div>)}</div>}
        </section>}
      </main>
    </div>
    <div className="footer">CareerOS · Persistent authenticated state · Evidence-backed generation · Human approval before outreach or submission</div>
  </div>
}
