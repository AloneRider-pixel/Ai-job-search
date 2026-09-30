"use client";

import { ChangeEvent, useEffect, useState } from "react";

type Document={id:number;filename:string|null;sourceType:string;mimeType:string|null;isMaster:boolean;createdAt:string};
type Me={user:{id:number;name:string;email:string}|null;profile:{name:string;headline:string|null;summary:string|null;skills:string[]}|null};

export default function ResumeVault(){
  const [documents,setDocuments]=useState<Document[]>([]);
  const [me,setMe]=useState<Me|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [resumeRes,meRes]=await Promise.all([fetch("/api/resumes"),fetch("/api/auth/me")]);
    if(resumeRes.ok){const data=await resumeRes.json();setDocuments(data.documents??[]);}
    if(meRes.ok)setMe(await meRes.json());
  }
  useEffect(() => {
  let cancelled = false;
  Promise.all([fetch("/api/resumes"), fetch("/api/auth/me")])
    .then(async ([resumeRes, meRes]) => {
      const resumeData = resumeRes.ok ? await resumeRes.json() : { documents: [] };
      const meData = meRes.ok ? await meRes.json() : null;
      if (cancelled) return;
      setDocuments(resumeData.documents ?? []);
      setMe(meData);
    })
    .catch(() => {
      if (!cancelled) setError("Unable to load your Resume Vault.");
    });
  return () => {
    cancelled = true;
  };
}, []);

  async function upload(event:ChangeEvent<HTMLFormElement>){
    event.preventDefault();
    if(!file)return setError("Choose a PDF, DOCX, or TXT resume.");
    setBusy(true);setError("");setMessage("");
    try{
      const form=new FormData();form.set("file",file);
      const res=await fetch("/api/resumes",{method:"POST",body:form});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Upload failed.");
      setMessage("Resume ingested. Verified facts were added to your candidate profile.");
      setFile(null);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Upload failed.");}finally{setBusy(false);}
  }

  return <main style={{maxWidth:1100,margin:"0 auto",padding:"38px 22px"}}>
    <div className="row between"><div><div className="kicker">candidate evidence</div><h1>Resume Vault</h1><p className="sub">Upload the source resume once. CareerOS keeps the raw document text, extracts only observable facts, and uses it as evidence for future applications.</p></div><Link href="/" className="btn">← Dashboard</Link></div>

    {me?.profile&&<div className="grid grid3" style={{marginTop:18}}>
      <div className="card"><div className="mono">NAME</div><h2 style={{marginTop:5}}>{me.profile.name}</h2></div>
      <div className="card"><div className="mono">STORED SKILLS</div><h2 style={{marginTop:5}}>{me.profile.skills?.length??0}</h2></div>
      <div className="card"><div className="mono">RESUME DOCUMENTS</div><h2 style={{marginTop:5}}>{documents.length}</h2></div>
    </div>}

    <div className="grid grid2" style={{marginTop:14}}>
      <form className="card" onSubmit={upload}>
        <div className="mono">UPLOAD SOURCE RESUME</div>
        <input style={{marginTop:12,width:"100%"}} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={e=>setFile(e.target.files?.[0]??null)} />
        <div className="notice" style={{marginTop:12}}>Maximum 10 MB. PDF/DOCX extraction is text-first; scanned image-only PDFs are flagged rather than silently hallucinated.</div>
        {error&&<div className="notice warn" style={{marginTop:10}}>{error}</div>}
        {message&&<div className="notice" style={{marginTop:10}}>{message}</div>}
        <button className="btn primary" style={{marginTop:12}} disabled={busy}>{busy?"Parsing + storing…":"Ingest resume"}</button>
      </form>

      <div className="card">
        <div className="mono">SOURCE-OF-TRUTH RULE</div>
        <h2 style={{marginTop:5}}>Evidence beats keywords.</h2>
        <p className="sub">The vault stores the original extracted text and a deterministic fact layer. The AI is allowed to reorganize verified evidence for a JD, but it cannot invent missing experience.</p>
        <div className="grid" style={{marginTop:12}}>
          <div className="notice">✓ PDF / DOCX / TXT ingestion</div>
          <div className="notice">✓ SHA-256 fingerprint per document</div>
          <div className="notice">✓ Master candidate profile update</div>
          <div className="notice">✓ Private DOCX + PDF export</div>
        </div>
      </div>
    </div>

    <div className="grid" style={{marginTop:14}}>
      <div className="card"><div className="row between"><div><div className="mono">DOCUMENT HISTORY</div><h2 style={{marginTop:5}}>Your resume sources</h2></div><span className="badge">{documents.length} stored</span></div>
        {documents.length===0?<p className="sub" style={{marginTop:12}}>No resume source has been uploaded yet.</p>:<div style={{marginTop:10}}>
          {documents.map(doc=><div key={doc.id} className="row between" style={{padding:"13px 0",borderTop:"1px solid var(--line)"}}>
            <div><strong>{doc.filename??("Resume #"+doc.id)}</strong><div className="small muted">{doc.sourceType.toUpperCase()} · {new Date(doc.createdAt).toLocaleString()} {doc.isMaster?"· MASTER":""}</div></div>
            <div className="row"><a className="btn" href={"/api/resumes/"+doc.id+"/artifact?format=docx"}>DOCX</a><a className="btn" href={"/api/resumes/"+doc.id+"/artifact?format=pdf"}>PDF</a></div>
          </div>)}
        </div>}
      </div>
    </div>
  </main>;
}
