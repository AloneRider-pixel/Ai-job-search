"use client";

import { useEffect, useState } from "react";

type Job={id:number;title:string;company:string;location:string|null};
type Contact={id:number;jobId:number|null;company:string;name:string|null;role:string|null;profileUrl:string|null;email:string|null;source:string|null;verificationState:string;approvalState:string;confidence:number;lastVerifiedAt:string|null};

function label(value:string){return value.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());}

export default function RecruiterIntelligence(){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [jobId,setJobId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const [jobsRes,contactsRes]=await Promise.all([fetch("/api/jobs?limit=100"),fetch("/api/contacts")]);
    if(jobsRes.ok)setJobs((await jobsRes.json()).jobs??[]);
    if(contactsRes.ok)setContacts((await contactsRes.json()).contacts??[]);
  }

  useEffect(()=>{load().catch(()=>setMessage("Unable to load recruiter intelligence."))},[]);

  async function discover(){
    if(!jobId){setMessage("Select a job first.");return;}
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/contacts/discover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:Number(jobId),maxResults:6})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Discovery failed.");
      setMessage("Found "+data.discovered+" contact candidates for "+data.job.company+" · domain "+data.domain+" · "+data.domainSource+".");
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Discovery failed.");}
    finally{setBusy(false);}
  }

  async function verify(id:number){
    const res=await fetch("/api/contacts/"+id+"/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
    const data=await res.json();
    if(!res.ok){setMessage(data.error??"Unable to verify email.");return;}
    setContacts(xs=>xs.map(c=>c.id===id?data.contact:c));
    setMessage("Email verification: "+(data.verification?.status??"unknown")+".");
  }

  async function act(id:number,action:"approve"|"reject"){
    const res=await fetch("/api/contacts/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
    const data=await res.json();
    if(!res.ok){setMessage(data.error??"Unable to update contact.");return;}
    setContacts(xs=>xs.map(c=>c.id===id?data.contact:c));
  }

  const selectedJob=jobs.find(j=>j.id===Number(jobId));

  return <main style={{maxWidth:1100,margin:"0 auto",padding:"38px 22px"}}>
    <div className="row between"><div><div className="kicker">recruiter intelligence</div><h1>Discover the right contact.</h1><p className="sub">Find current recruiting or hiring-side contacts for a specific job, preserve provider evidence, and require human approval before outreach.</p></div><div className="row"><a className="btn" href="/inbox">Inbox</a><a className="btn" href="/">Dashboard</a></div></div>
    <div className="card" style={{marginTop:14}}>
      <div className="mono">1 · TARGET JOB</div>
      <div className="row" style={{marginTop:8}}>
        <select value={jobId} onChange={e=>setJobId(e.target.value)} className="field" style={{flex:1}}>
          <option value="">Select a job…</option>
          {jobs.map(j=><option key={j.id} value={j.id}>{j.title} @ {j.company} {j.location?"· "+j.location:""}</option>)}
        </select>
        <button className="btn primary" disabled={busy||!jobId} onClick={discover}>{busy?"Discovering…":"Discover contacts"}</button>
      </div>
      {selectedJob&&<p className="small muted" style={{marginTop:8}}>Discovery is scoped to <strong>{selectedJob.title}</strong> at <strong>{selectedJob.company}</strong>.</p>}
      {message&&<div className="notice" style={{marginTop:10}}>{message}</div>}
    </div>

    <div className="grid" style={{marginTop:14}}>
      {contacts.length===0?<div className="card"><h2>No recruiter contacts yet.</h2><p className="sub">Run discovery for a target job. Candidates remain unapproved until you review them.</p></div>:
      contacts.map(c=><div className="card" key={c.id}>
        <div className="row between">
          <div><div className="job-title">{c.name??"Unnamed contact"}</div><div className="muted small">{c.role??"Role not returned"} · {c.company}</div></div>
          <div className="row"><span className="score">{c.confidence}</span><span className={"chip "+(c.verificationState==="verified"?"ok":"")}>{label(c.verificationState)}</span><span className={"chip "+(c.approvalState==="approved"?"ok":c.approvalState==="rejected"?"bad":"warn")}>{label(c.approvalState)}</span></div>
        </div>
        <div className="grid grid2" style={{marginTop:12}}>
          <div><div className="mono">IDENTITY</div>{c.profileUrl?<a className="small" href={c.profileUrl} target="_blank" rel="noreferrer">Open professional profile ↗</a>:<div className="small muted">No profile URL returned.</div>}</div>
          <div><div className="mono">EMAIL</div><div className="small">{c.email??"No email returned."}</div>{c.lastVerifiedAt&&<div className="small muted">Verified {new Date(c.lastVerifiedAt).toLocaleString()}</div>}</div>
        </div>
        <div className="row between" style={{marginTop:12}}>
          <div className="small muted">Source: {c.source??"unknown"} · confidence is evidence-weighted, not a hiring prediction.</div>
          <div className="row">{c.email&&c.verificationState!=="verified"&&<button className="btn" onClick={()=>verify(c.id)}>Re-check email</button>}{c.approvalState!=="approved"&&<button className="btn primary" onClick={()=>act(c.id,"approve")}>Approve</button>}{c.approvalState!=="rejected"&&<button className="btn" onClick={()=>act(c.id,"reject")}>Reject</button>}</div>
        </div>
      </div>)}
    </div>

    <div className="card" style={{marginTop:14}}><div className="mono">OUTREACH GATE</div><h2 style={{marginTop:5}}>Verified + approved only</h2><p className="sub">A discovered contact can provide a LinkedIn profile and/or email, but the send path still requires a verified email and explicit approval. Provider records are stored as evidence so stale or mismatched identities can be reviewed before contacting anyone.</p></div>
  </main>;
}
