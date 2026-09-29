"use client";

import { useEffect, useMemo, useState } from "react";

type Job={id:number;title:string;company:string;location:string|null;score:number;description:string};
type Session={id:number;jobId:number;status:string;mode:string;questionCount:number;answeredCount:number;overallScore:number|null;readinessScore:number|null;summary:string|null;strengths:string[];gaps:string[];startedAt:string;completedAt:string|null;generator?:string;model?:string|null};
type Question={id:number;sequence:number;type:string;area:string;question:string;expectedSignals:string[];evidenceContext:string[];isFollowUp:boolean;parentQuestionId:number|null;latestAnswer:Answer|null};
type Answer={id:number;questionId:number;attempt:number;answerText:string;score:number;confidence:number;verdict:string;strengths:string[];gaps:string[];feedback:string;coveredSignals:string[];rubric:Record<string,number>;createdAt:string};
type Evaluation={score:number;confidence:number;verdict:string;strengths:string[];gaps:string[];feedback:string;coveredSignals:string[];rubric:Record<string,number>;model:string|null};

function label(value:string){return value.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}

export default function InterviewPage(){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [jobId,setJobId]=useState<number|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [answer,setAnswer]=useState("");
  const [evaluation,setEvaluation]=useState<Evaluation|null>(null);
  const [mode,setMode]=useState<"mixed"|"technical"|"behavioral"|"system_design">("mixed");
  const [questionCount,setQuestionCount]=useState(6);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");

  const selectedJob=useMemo(()=>jobs.find(job=>job.id===jobId)??jobs[0]??null,[jobs,jobId]);
  const currentQuestion=questions.find(question=>!question.latestAnswer)||null;
  const progress=session?Math.round((session.answeredCount/Math.max(session.questionCount,1))*100):0;

  async function loadBase(){
    setBusy("loading");
    try{
      const [jobsRes,sessionsRes]=await Promise.all([
        fetch("/api/jobs?limit=100"),
        fetch("/api/interview/sessions")
      ]);
      if(!jobsRes.ok||!sessionsRes.ok)throw new Error("Unable to load InterviewOS.");
      const jobData=await jobsRes.json();
      const sessionData=await sessionsRes.json();
      const loadedJobs=(jobData.jobs??[]) as Job[];
      setJobs(loadedJobs);
      setSessions((sessionData.sessions??[]) as Session[]);
      if(jobId===null&&loadedJobs[0])setJobId(loadedJobs[0].id);
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to load InterviewOS.");}
    finally{setBusy("");}
  }

  useEffect(()=>{loadBase().catch(()=>undefined)},[]);

  async function openSession(id:number){
    setBusy("open-"+id);setNotice("");setEvaluation(null);setAnswer("");
    try{
      const res=await fetch("/api/interview/sessions/"+id);
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to load interview session.");
      setSession(data.session as Session);
      setJobId(data.session.jobId);
      setQuestions((data.questions??[]) as Question[]);
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to load interview session.");}
    finally{setBusy("");}
  }

  async function startSession(){
    if(!selectedJob){setNotice("Select a target job first.");return;}
    setBusy("start");setNotice("");setEvaluation(null);setAnswer("");
    try{
      const res=await fetch("/api/interview/sessions",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jobId:selectedJob.id,mode,questionCount})
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to start interview.");
      await openSession(data.session.id);
      await loadBase();
      setNotice((data.session.generator==="ai"?"AI":"Heuristic")+" interview created. The simulator is grounded in the selected JD and your stored evidence.");
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to start interview.");}
    finally{setBusy("");}
  }

  async function submitAnswer(){
    if(!session||!currentQuestion)return;
    setBusy("answer");setNotice("");
    try{
      const res=await fetch("/api/interview/sessions/"+session.id+"/answer",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({questionId:currentQuestion.id,answer})
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to evaluate answer.");
      setEvaluation(data.evaluation as Evaluation);
      setAnswer("");
      if(data.nextQuestion){
        setQuestions(prev=>prev.map(question=>question.id===currentQuestion.id
          ?{...question,latestAnswer:{id:0,questionId:question.id,attempt:data.attempt,answerText:"",score:data.evaluation.score,confidence:data.evaluation.confidence,verdict:data.evaluation.verdict,strengths:data.evaluation.strengths,gaps:data.evaluation.gaps,feedback:data.evaluation.feedback,coveredSignals:data.evaluation.coveredSignals,rubric:data.evaluation.rubric,createdAt:new Date().toISOString()}}
          :question));
        if(data.followUpCreated)setNotice("Low-score answer detected. A targeted follow-up was inserted into the interview.");
      }else{
        const refreshed=await fetch("/api/interview/sessions/"+session.id);
        const refreshedData=await refreshed.json();
        if(refreshed.ok){
          setSession(refreshedData.session as Session);
          setQuestions((refreshedData.questions??[]) as Question[]);
        }
      }
      setSession(prev=>prev?{...prev,answeredCount:data.answeredCount,questionCount:data.questionCount}:prev);
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to evaluate answer.");}
    finally{setBusy("");}
  }

  async function complete(){
    if(!session)return;
    setBusy("complete");setNotice("");
    try{
      const res=await fetch("/api/interview/sessions/"+session.id,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete"})
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Unable to complete interview.");
      setSession(data.session as Session);
      await loadBase();
      setNotice("Interview session completed and saved.");
    }catch(error){setNotice(error instanceof Error?error.message:"Unable to complete interview.");}
    finally{setBusy("");}
  }

  return <main style={{maxWidth:1240,margin:"0 auto",padding:"38px 22px"}}>
    <div className="hero">
      <div><div className="kicker">adaptive interview os</div><h1>Practice against the job, not a generic question bank.</h1><p className="sub">Interview questions are grounded in the target JD, your stored profile evidence, and verified application gaps. Weak answers can trigger targeted follow-ups.</p></div>
      <div className="row"><a className="btn" href="/">Dashboard</a><a className="btn" href="/learning">Learning</a></div>
    </div>

    {notice&&<div className="notice" style={{marginBottom:14}}>{notice}</div>}

    <div className="grid grid2">
      <section className="card">
        <div className="mono">1 · TARGET</div>
        <select className="field" style={{marginTop:8}} value={selectedJob?.id??""} onChange={event=>setJobId(Number(event.target.value))}>
          <option value="">Select a persisted job…</option>
          {jobs.map(job=><option value={job.id} key={job.id}>{job.title} @ {job.company}</option>)}
        </select>
        <div className="row" style={{marginTop:12}}>
          <div style={{flex:1,minWidth:170}}><div className="mono">MODE</div><select className="field" style={{marginTop:6}} value={mode} onChange={event=>setMode(event.target.value as typeof mode)}><option value="mixed">Mixed</option><option value="technical">Technical</option><option value="system_design">System design</option><option value="behavioral">Behavioral</option></select></div>
          <div style={{width:150}}><div className="mono">QUESTIONS</div><select className="field" style={{marginTop:6}} value={questionCount} onChange={event=>setQuestionCount(Number(event.target.value))}><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option><option value={6}>6</option><option value={7}>7</option><option value={8}>8</option></select></div>
        </div>
        {selectedJob&&<div className="notice" style={{marginTop:12}}><strong>{selectedJob.title}</strong> · {selectedJob.company}<div className="small muted" style={{marginTop:4}}>Radar relevance {selectedJob.score}/100 · latest application package is used as an optional source of known gaps.</div></div>}
        <button className="btn primary" style={{marginTop:12}} disabled={busy==="start"||!selectedJob} onClick={startSession}>{busy==="start"?"Generating…":"Start adaptive interview"}</button>
      </section>

      <section className="card">
        <div className="row between"><div><div className="mono">SESSION HISTORY</div><h2 style={{marginTop:5}}>Saved practice sessions</h2></div><span className="chip">{sessions.length} stored</span></div>
        {!sessions.length?<p className="sub">No interviews yet. Start one for any persisted job.</p>:<div>{sessions.slice(0,8).map(item=><button className="btn" key={item.id} style={{width:"100%",marginTop:8,textAlign:"left"}} onClick={()=>openSession(item.id)} disabled={busy==="open-"+item.id}><div className="row between"><strong>{jobs.find(j=>j.id===item.jobId)?.title??("Job #"+item.jobId)}</strong><span className="chip">{item.overallScore===null?"active":item.overallScore+"/100"}</span></div><div className="small muted" style={{marginTop:4}}>{label(item.mode)} · {item.answeredCount}/{item.questionCount} answered · {new Date(item.startedAt).toLocaleString()}</div></button>)}</div>}
      </section>
    </div>

    {!session?<div className="card" style={{marginTop:14,textAlign:"center",padding:"46px 18px"}}><div className="mono">INTERVIEW WORKSPACE</div><h2 style={{marginTop:7}}>Start a session to enter the simulator.</h2><p className="sub" style={{margin:"8px auto 0"}}>Each answer is scored for practice quality—correctness, depth, relevance, and communication—not for hiring probability.</p></div>:
    <section style={{marginTop:14}}>
      <div className="card">
        <div className="row between"><div><div className="mono">SESSION #{session.id} · {label(session.mode)}</div><h2 style={{marginTop:5}}>{selectedJob?.title??"Interview"} · {selectedJob?.company??""}</h2></div><div className="row"><span className="chip">{session.generator??"persisted"}</span>{session.status==="completed"?<span className="chip ok">completed</span>:<span className="chip ok">{progress}% complete</span>}</div></div>
        <div style={{marginTop:14,height:8,borderRadius:99,background:"var(--line)",overflow:"hidden"}}><div style={{width:Math.min(progress,100)+"%",height:"100%",background:"var(--lime)"}}/></div>
      </div>

      {session.status==="completed"?<div className="grid grid2" style={{marginTop:14}}>
        <div className="card"><div className="mono">RESULT</div><div style={{fontSize:42,fontWeight:900,color:"var(--lime)",marginTop:6}}>{session.overallScore??0}<span className="muted" style={{fontSize:15}}>/100</span></div><div className="small muted">Readiness score {session.readinessScore??0}/100</div><p className="sub" style={{marginTop:12}}>{session.summary}</p></div>
        <div className="card"><div className="mono">REPEATED SIGNALS</div><h2 style={{marginTop:5}}>What to work on next</h2><div className="chips">{session.strengths.map(item=><span className="chip ok" key={"s"+item}>{item}</span>)}{session.gaps.map(item=><span className="chip warn" key={"g"+item}>{item}</span>)}</div><p className="small muted" style={{marginTop:12}}>Use these gaps to drive another practice round or create targeted learning tasks.</p></div>
      </div>:
      <div className="grid grid2" style={{marginTop:14}}>
        <div className="card">
          {currentQuestion?<><div className="row between"><div><div className="mono">QUESTION {currentQuestion.sequence} · {label(currentQuestion.type)}</div><h2 style={{marginTop:7}}>{currentQuestion.area}</h2></div>{currentQuestion.isFollowUp&&<span className="chip warn">adaptive follow-up</span>}</div><p style={{fontSize:18,lineHeight:1.55,margin:"18px 0"}}>{currentQuestion.question}</p><textarea className="field" value={answer} onChange={event=>setAnswer(event.target.value)} placeholder="Answer as you would in a real interview. Use concrete reasoning; only claim real experience when it is true." style={{minHeight:230}}/><button className="btn primary" style={{marginTop:10}} disabled={busy==="answer"||answer.trim().length<10} onClick={submitAnswer}>{busy==="answer"?"Evaluating…":"Submit answer"}</button></>:<div className="notice"><strong>All questions answered.</strong><div style={{marginTop:6}}>Complete the session to save the final score and summary.</div><button className="btn primary" style={{marginTop:10}} disabled={busy==="complete"} onClick={complete}>{busy==="complete"?"Saving…":"Complete interview"}</button></div>}
          {evaluation&&<div className="card" style={{marginTop:14,padding:14,background:"rgba(191,255,60,.035)"}}><div className="row between"><div><div className="mono">LATEST EVALUATION · {evaluation.model?"AI":"HEURISTIC"}</div><strong style={{fontSize:28}}>{evaluation.score}/100</strong></div><span className="badge">{label(evaluation.verdict)}</span></div><p className="sub" style={{marginTop:10}}>{evaluation.feedback}</p><div className="chips">{evaluation.strengths.map(item=><span className="chip ok" key={"s"+item}>{item}</span>)}{evaluation.gaps.map(item=><span className="chip warn" key={"g"+item}>{item}</span>)}</div></div>}
        </div>
        <div className="card"><div className="mono">SCORING CONTEXT</div><h2 style={{marginTop:5}}>What a strong answer should demonstrate</h2><div style={{marginTop:10}}>{currentQuestion?.expectedSignals.map(signal=><div className="row" style={{borderTop:"1px solid var(--line)",padding:"10px 0",alignItems:"flex-start"}} key={signal}><span style={{color:"var(--lime)"}}>✓</span><span className="small">{signal}</span></div>)}</div><div className="notice" style={{marginTop:12}}>Evidence context is recorded for traceability. A question can test a missing skill without treating it as existing candidate experience.</div></div>
      </div>}
    </section>}
  </main>;
}
