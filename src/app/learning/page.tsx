"use client";

import { useEffect, useState } from "react";

type Model={id:number;profileId:number;version:number;sampleCount:number;baseline:Record<string,any>;featureStats:Record<string,Record<string,any>>;trainedAt:string};
type Calibration={id:number;profileId:number;version:number;sampleCount:number;baseline:Record<string,any>;featureStats:Record<string,Record<string,any>>;interactions:Record<string,any>;methodology:Record<string,any>;trainedAt:string};

type Summary={applications:number;screening:number;interview:number;offers:number;rejected:number};
type Transition={id:number;applicationId:number;jobTitle:string;company:string;fromStage:string|null;toStage:string;source:string;occurredAt:string};

function pct(value:number){return Math.round(value*100);}
function label(value:string){return value.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}

export default function LearningPage(){
  const [model,setModel]=useState<Model|null>(null);
  const [calibration,setCalibration]=useState<Calibration|null>(null);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [transitions,setTransitions]=useState<Transition[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    const [modelRes,statsRes]=await Promise.all([fetch("/api/learning"),fetch("/api/learning/stats")]);
    if(modelRes.ok){const data=await modelRes.json();setModel(data.model??null);setCalibration(data.calibration??null);}
    if(statsRes.ok){const data=await statsRes.json();setSummary(data.summary??null);setTransitions(data.transitions??[]);}
  }

  useEffect(()=>{load().catch(()=>setMessage("Unable to load learning data."))},[]);

  async function retrain(){
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/learning",{method:"POST"});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Retrain failed.");
      setModel(data.model);setCalibration(data.calibration??null);await load();setMessage("Outcome model and ranking calibration retrained from "+data.model.sampleCount+" observed applications.");
    }catch(error){setMessage(error instanceof Error?error.message:"Retrain failed.");}
    finally{setBusy(false);}
  }

  const featureGroups=model?.featureStats??{};
  const renderGroup=(name:string)=>{
    const rows=Object.entries(featureGroups[name]??{}).sort((a,b)=>(b[1].n??0)-(a[1].n??0));
    return <div className="card" key={name}><div className="mono">{name.toUpperCase()}</div><h2 style={{marginTop:5}}>{label(name)}</h2>{rows.length?<div>{rows.map(([key,stat])=><div key={key} style={{borderTop:"1px solid var(--line)",padding:"11px 0"}}><div className="row between"><strong>{key}</strong><span className="chip">{stat.n} apps</span></div><div className="small muted" style={{marginTop:5}}>Reached screening {pct(stat.progressedRate)}% · interview {pct(stat.interviewRate)}% · offer {pct(stat.offerRate)}% · ranking adjustment {stat.adjustment>0?"+":""}{stat.adjustment}</div></div>)}</div>:<p className="sub">Not enough observed data yet.</p>}</div>;
  };

  return <main style={{maxWidth:1200,margin:"0 auto",padding:"38px 22px"}}>
    <div className="row between"><div><div className="kicker">outcome learning engine</div><h1>Learn from what actually happened.</h1><p className="sub">CareerOS learns from your observed application funnel. It does not treat an un-applied job as a negative outcome, and small samples receive conservative smoothing.</p></div><div className="row"><a className="btn" href="/">Dashboard</a><button className="btn primary" disabled={busy} onClick={retrain}>{busy?"Retraining…":"Retrain model"}</button></div></div>
    {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}

    <div className="grid grid3" style={{marginTop:14}}>
      <div className="card stat"><div><div className="mono">APPLICATIONS</div><strong>{summary?.applications??model?.sampleCount??0}</strong></div><span className="chip ok">observed</span></div>
      <div className="card stat"><div><div className="mono">SCREENING</div><strong>{summary?.screening??0}</strong></div><span className="chip">stage ≥ screening</span></div>
      <div className="card stat"><div><div className="mono">INTERVIEW / OFFER</div><strong>{summary?.interview??0} / {summary?.offers??0}</strong></div><span className="chip ok">signals</span></div>
    </div>

    {!model?<div className="card" style={{marginTop:14}}><h2>No trained model yet.</h2><p className="sub">Create or move a few tracked applications, then retrain. The model needs observed outcomes before it influences Job Radar.</p></div>:
    <>
      <div className="card" style={{marginTop:14}}><div className="row between"><div><div className="mono">MODEL V{model.version}</div><h2 style={{marginTop:5}}>Baseline funnel</h2></div><span className="badge">{model.sampleCount} applications</span></div><div className="grid grid3" style={{marginTop:12}}><div><div className="mono">SCREENING RATE</div><strong>{pct(model.baseline.progressedRate)}%</strong></div><div><div className="mono">INTERVIEW RATE</div><strong>{pct(model.baseline.interviewRate)}%</strong></div><div><div className="mono">OFFER RATE</div><strong>{pct(model.baseline.offerRate)}%</strong></div></div><p className="small muted" style={{marginTop:10}}>Rates use light Bayesian smoothing and are descriptive summaries of your observed application funnel, not forecasts of employer decisions.</p></div>
      <div className="grid grid2" style={{marginTop:14}}>{["roleFamily","fitBand","source","workMode"].map(renderGroup)}</div>
      <div className="card" style={{marginTop:14}}><div className="mono">RECENT STAGE EVENTS</div><h2 style={{marginTop:5}}>What the system observed</h2>{transitions.length?<div>{transitions.slice().reverse().map(t=><div key={t.id} style={{borderTop:"1px solid var(--line)",padding:"10px 0"}}><div className="row between"><strong>{t.jobTitle} · {t.company}</strong><span className="chip">{label(t.source)}</span></div><div className="small muted" style={{marginTop:4}}>{t.fromStage?label(t.fromStage)+" → ":""}{label(t.toStage)} · {new Date(t.occurredAt).toLocaleString()}</div></div>)}</div>:<p className="sub">No stage events recorded yet.</p>}</div>
    </>}
    {calibration&&<div className="card" style={{marginTop:14}}><div className="row between"><div><div className="mono">RANKING CALIBRATION V{calibration.version}</div><h2 style={{marginTop:5}}>Observed outcomes now calibrate Job Radar.</h2></div><span className="badge">{calibration.sampleCount} apps</span></div><div className="grid grid3" style={{marginTop:12}}><div><div className="mono">BASELINE OUTCOME INDEX</div><strong>{Math.round((calibration.baseline.outcomeIndex??0.5)*100)}/100</strong></div><div><div className="mono">CALIBRATION WEIGHT</div><strong>{Math.round((calibration.methodology.calibrationWeight??0.22)*100)}%</strong></div><div><div className="mono">MIN HISTORY</div><strong>{calibration.methodology.minimumSamples??3}</strong></div></div><p className="small muted" style={{marginTop:10}}>Only sufficiently observed feature buckets contribute. The calibrated component remains a small part of the final score and is based on your recorded application funnel.</p></div>}
    <div className="card" style={{marginTop:14}}><div className="mono">RANKING POLICY</div><h2 style={{marginTop:5}}>Learning only nudges relevance.</h2><p className="sub">The learned adjustment is capped and requires observed applications per feature bucket. Base profile/JD compatibility remains the dominant signal, while the learner captures patterns such as which role families or sources have produced deeper engagement in your own history.</p></div>
  </main>;
}
