"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Message={id:number;direction:string;subject:string|null;fromEmail:string|null;toEmails:string[];receivedAt:string|null;sentAt:string|null;snippet:string|null;bodyText:string|null};
type Event={id:number;eventType:string;confidence:number;evidence:string[];occurredAt:string;message:Message;application:{id:number;stage:string}|null;job:{title:string;company:string}|null};

function label(value:string){return value.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());}

export default function Inbox(){
  const [messages,setMessages]=useState<Message[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [syncing,setSyncing]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const [messagesRes,eventsRes]=await Promise.all([fetch("/api/mail/messages"),fetch("/api/mail/events")]);
    if(messagesRes.ok)setMessages((await messagesRes.json()).messages??[]);
    if(eventsRes.ok)setEvents((await eventsRes.json()).events??[]);
  }

  useEffect(() => {
  let cancelled = false;
  Promise.all([fetch("/api/mail/messages"), fetch("/api/mail/events")])
    .then(async ([messagesRes, eventsRes]) => {
      const messagesData = messagesRes.ok ? await messagesRes.json() : { messages: [] };
      const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
      if (cancelled) return;
      setMessages(messagesData.messages ?? []);
      setEvents(eventsData.events ?? []);
    })
    .catch(() => {
      if (!cancelled) setMessage("Unable to load mailbox intelligence.");
    });
  return () => {
    cancelled = true;
  };
}, []);

  async function syncAll(){
    setSyncing(true);setMessage("");
    try{
      const connections=await fetch("/api/connections");
      const data=await connections.json();
      const connected=(data.connections??[]).filter((c:{provider:string;status:string})=>c.status==="connected");
      if(!connected.length)throw new Error("Connect Gmail or Outlook first.");
      const results=[];
      for(const c of connected){
        const res=await fetch("/api/connections/"+c.provider+"/sync",{method:"POST"});
        results.push(await res.json());
      }
      setMessage(results.map((r:{provider:string;inserted:number;events:number})=>r.provider+": "+r.inserted+" new messages, "+r.events+" events").join(" · "));
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Sync failed.");}finally{setSyncing(false);}
  }

  return <main style={{maxWidth:1200,margin:"0 auto",padding:"38px 22px"}}>
    <div className="row between"><div><div className="kicker">communication intelligence</div><h1>Inbox & Events</h1><p className="sub">CareerOS converts mailbox signals into application events: recruiter replies, screening, assessments, interviews, scheduling, offers and rejections.</p></div><div className="row"><a className="btn" href="/settings/integrations">Integrations</a><Link className="btn" href="/">Dashboard</Link><button className="btn primary" disabled={syncing} onClick={syncAll}>{syncing?"Syncing…":"Sync mail"}</button></div></div>
    {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}
    <div className="grid grid2" style={{marginTop:14}}>
      <div className="card"><div className="mono">EVENT STREAM</div><h2 style={{marginTop:5}}>Application signals</h2>
        {events.length===0?<p className="sub">No application events detected yet.</p>:<div style={{marginTop:10}}>{events.map(e=><div key={e.id} style={{borderTop:"1px solid var(--line)",padding:"12px 0"}}><div className="row between"><strong>{label(e.eventType)}</strong><span className="chip ok">{e.confidence}%</span></div><div className="small muted" style={{marginTop:5}}>{e.job?e.job.title+" · "+e.job.company:"Unmatched application"} · {new Date(e.occurredAt).toLocaleString()}</div><div className="small" style={{marginTop:5}}>{e.message.subject||"(no subject)"}</div></div>)}</div>}
      </div>
      <div className="card"><div className="mono">MAILBOX</div><h2 style={{marginTop:5}}>Recent messages</h2>
        {messages.length===0?<p className="sub">No messages synchronized yet.</p>:<div style={{marginTop:10}}>{messages.slice(0,30).map(m=><div key={m.id} style={{borderTop:"1px solid var(--line)",padding:"12px 0"}}><div className="row between"><strong>{m.subject||"(no subject)"}</strong><span className={"chip "+(m.direction==="inbound"?"ok":"")}>{m.direction}</span></div><div className="small muted" style={{marginTop:4}}>{m.fromEmail||"unknown"} · {new Date(m.receivedAt || m.sentAt || "").toLocaleString()}</div><div className="small muted" style={{marginTop:5}}>{(m.snippet||m.bodyText||"").slice(0,180)}</div></div>)}</div>}
      </div>
    </div>
    <div className="card" style={{marginTop:14}}><div className="mono">AUTOMATION POLICY</div><h2 style={{marginTop:5}}>Replies stop outreach sequences</h2><p className="sub">A sufficiently confident recruiter reply, interview, scheduling event, offer, or rejection is recorded and stops the corresponding follow-up sequence. Application stage updates are also scoped to the signed-in candidate.</p></div>
  </main>;
}
