"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router=useRouter();
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{
      const res=await fetch("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Registration failed.");
      router.replace("/");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Registration failed.");}finally{setBusy(false);}
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <form onSubmit={submit} style={{width:"100%",maxWidth:420,border:"1px solid var(--line)",background:"var(--panel)",borderRadius:20,padding:24}}>
      <div className="kicker">careeros identity</div><h1 style={{fontSize:38}}>Build your career workspace.</h1><p className="sub">Create a private workspace for your candidate profile, evidence and applications.</p>
      <input className="field" style={{marginTop:10}} placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} />
      <input className="field" style={{marginTop:10}} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <input className="field" style={{marginTop:10}} type="password" placeholder="Password (10+ characters)" value={password} onChange={e=>setPassword(e.target.value)} required minLength={10} />
      {error&&<div className="notice warn" style={{marginTop:10}}>{error}</div>}
      <button className="btn primary" style={{marginTop:14,width:"100%"}} disabled={busy}>{busy?"Creating…":"Create workspace"}</button>
      <p className="small muted" style={{marginTop:14}}>Already registered? <a href="/login" style={{color:"var(--lime)"}}>Sign in</a></p>
    </form>
  </main>;
}
