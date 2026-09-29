"use client";

import { useEffect, useState } from "react";

type Connection={id:number;provider:string;accountEmail:string;scopes:string[];lastSyncAt:string|null;nextSyncAt:string|null;syncFailureCount:number;status:string;lastError:string|null};

export default function IntegrationsPage(){
  const [connections,setConnections]=useState<Connection[]>([]);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");

  async function load(){
    const res=await fetch("/api/connections");
    if(res.ok){const data=await res.json();setConnections(data.connections??[]);}
  }

  useEffect(()=>{load().catch(()=>setMessage("Unable to load integrations."))},[]);

  async function sync(provider:string){
    setBusy(provider);setMessage("");
    try{
      const res=await fetch("/api/connections/"+provider+"/sync",{method:"POST"});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Sync failed.");
      setMessage(provider+" sync: "+data.discovered+" messages checked, "+data.events+" application events detected.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Sync failed.");}finally{setBusy("");}
  }

  function connected(provider:string){return connections.find(c=>c.provider===provider&&c.status==="connected");}

  return <main style={{maxWidth:1000,margin:"0 auto",padding:"38px 22px"}}>
    <div className="row between"><div><div className="kicker">communication intelligence</div><h1>Integrations</h1><p className="sub">Connect your mailbox so CareerOS can detect application confirmations, recruiter replies, assessments, interviews, offers and rejections, then update your application pipeline.</p></div><a href="/" className="btn">← Dashboard</a></div>
    {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}
    <div className="grid grid2" style={{marginTop:14}}>
      {["google","microsoft"].map(provider=>{
        const connection=connected(provider);
        return <div className="card" key={provider}>
          <div className="mono">{provider==="google"?"GMAIL":"OUTLOOK / MICROSOFT 365"}</div>
          <h2 style={{marginTop:5}}>{connection?"Connected":"Not connected"}</h2>
          {connection?<><p className="small muted">{connection.accountEmail}</p><p className="small muted">{connection.lastSyncAt?"Last sync: "+new Date(connection.lastSyncAt).toLocaleString():"Never synced"}{connection.nextSyncAt&&<><br/>Next scheduled: {new Date(connection.nextSyncAt).toLocaleString()}</>}{connection.syncFailureCount>0&&<><br/>Retry failures: {connection.syncFailureCount}</>}</p>{connection.lastError&&<div className="notice warn">{connection.lastError}</div>}<div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy===provider} onClick={()=>sync(provider)}>{busy===provider?"Syncing…":"Sync now"}</button></div></>:<><p className="small muted">OAuth permissions are requested only for mailbox reading and sending.</p><a className="btn primary" style={{display:"inline-block",marginTop:10}} href={"/api/connections/"+provider+"/start"}>Connect {provider==="google"?"Gmail":"Outlook"}</a></>}
        </div>;
      })}
    </div>
    <div className="card" style={{marginTop:14}}><div className="mono">SAFETY</div><h2 style={{marginTop:5}}>Outbound email requires explicit approval</h2><p className="sub">CareerOS never automatically sends a generated recruiter message. A contact must have a verified email, and the send endpoint requires an explicit confirmation value. Incoming mailbox messages can stop follow-up sequences when a reply or definitive outcome is detected.</p></div>
  </main>;
}
