"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError("");
    try{
      const res=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Login failed.");
      router.replace(searchParams.get("next")||"/");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Login failed.");}finally{setBusy(false);}
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <form onSubmit={submit} style={{width:"100%",maxWidth:420,border:"1px solid var(--line)",background:"var(--panel)",borderRadius:20,padding:24}}>
      <div className="kicker">careeros identity</div><h1 style={{fontSize:38}}>Welcome back.</h1><p className="sub">Your applications, profile evidence and resume versions stay behind your account.</p>
      <input className="field" style={{marginTop:10}} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
      <input className="field" style={{marginTop:10}} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
      {error&&<div className="notice warn" style={{marginTop:10}}>{error}</div>}
      <button className="btn primary" style={{marginTop:14,width:"100%"}} disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
      <p className="small muted" style={{marginTop:14}}>No account? <a href="/register" style={{color:"var(--lime)"}}>Create one</a></p>
    </form>
  </main>;
}
