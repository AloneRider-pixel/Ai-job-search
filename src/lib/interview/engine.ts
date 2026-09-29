import { buildAIInterviewQuestions, evaluateAIInterviewAnswer, type InterviewProfile } from "@/lib/ai/interview";

export type InterviewQuestionDraft={
  type:"technical"|"system_design"|"debugging"|"behavioral"|"situational";
  area:string;
  question:string;
  expectedSignals:string[];
  evidenceContext:string[];
};

export type InterviewEvaluation={
  score:number;
  confidence:number;
  verdict:"strong"|"solid"|"mixed"|"weak"|"insufficient";
  strengths:string[];
  gaps:string[];
  feedback:string;
  coveredSignals:string[];
  rubric:{correctness:number;depth:number;relevance:number;communication:number};
  model:string|null;
};

function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9+#.\s]/g," ").replace(/\s+/g," ").trim();}
function words(value:string){return new Set(normalize(value).split(" ").filter(x=>x.length>=4));}

function fallbackQuestions(args:{
  title:string;company:string;jd:string;profile:InterviewProfile;gaps:string[];mode:string;questionCount:number;
}):InterviewQuestionDraft[] {
  const jdWords=words(args.jd);
  const relevantSkills=args.profile.skills.filter(skill=>{
    const n=normalize(skill);
    return n && (args.jd.toLowerCase().includes(n) || [...words(skill)].some(w=>jdWords.has(w)));
  });
  const gaps=args.gaps.filter(Boolean);
  const questions:InterviewQuestionDraft[]=[];
  for(const skill of relevantSkills.slice(0,3)){
    questions.push({
      type:"technical",area:skill,
      question:"Explain how you would use "+skill+" in a production system for this role, including one trade-off you would watch closely.",
      expectedSignals:["Concrete approach","Trade-off awareness","Operational considerations"],
      evidenceContext:args.profile.skills.includes(skill)?["Candidate lists "+skill+" in the profile."]:["JD references "+skill+"; no verified candidate evidence is present."]
    });
  }
  if(args.mode==="mixed"||args.mode==="system_design"){
    questions.push({
      type:"system_design",area:"System design",
      question:"Design a reliable service for a key workflow in this role. Walk through components, data flow, failure handling, and observability.",
      expectedSignals:["Clear components and data flow","Failure modes and recovery","Observability and capacity considerations"],
      evidenceContext:["Question is role-specific and hypothetical; it does not assume prior ownership of such a system."]
    });
  }
  if(args.mode==="mixed"||args.mode==="behavioral"){
    questions.push({
      type:"behavioral",area:"Ownership",
      question:"Tell me about a time you had to solve a difficult engineering problem under constraints. What did you do, what trade-offs did you make, and what was the result?",
      expectedSignals:["Specific situation","Personal actions","Trade-offs","Measured or concrete result"],
      evidenceContext:["Answer should use only real experience from the candidate's evidence."]
    });
  }
  if(gaps[0]){
    questions.push({
      type:"situational",area:gaps[0],
      question:"This role calls for "+gaps[0]+". You are given a real production problem involving it. How would you investigate the issue, make a safe change, and validate the result?",
      expectedSignals:["Structured investigation","Safe change strategy","Validation and rollback"],
      evidenceContext:["The skill is an identified application gap; answer as a hypothetical rather than claiming prior experience."]
    });
  }
  return questions.slice(0,Math.max(3,Math.min(args.questionCount,8)));
}

export async function generateInterviewQuestions(args:{
  title:string;company:string;jd:string;profile:InterviewProfile;gaps:string[];mode:"mixed"|"technical"|"behavioral"|"system_design";questionCount:number;
}) {
  if(process.env.OPENAI_API_KEY){
    try{
      const result=await buildAIInterviewQuestions({...args,mode:args.mode});
      return {questions:result.data.questions.slice(0,args.questionCount),model:result.model,mode:"ai" as const};
    }catch(error){
      console.warn("AI interview generation failed; using deterministic questions.",error);
    }
  }
  return {questions:fallbackQuestions(args),model:null,mode:"heuristic" as const};
}

function verdict(score:number):InterviewEvaluation["verdict"]{
  if(score>=85)return "strong";
  if(score>=72)return "solid";
  if(score>=55)return "mixed";
  if(score>=35)return "weak";
  return "insufficient";
}

function fallbackEvaluation(question:InterviewQuestionDraft,answer:string):InterviewEvaluation{
  const normalized=normalize(answer);
  const answerWords=new Set(normalized.split(" ").filter(x=>x.length>=4));
  const signalTerms=question.expectedSignals.flatMap(x=>[...words(x)]);
  const matched=[...new Set(signalTerms.filter(x=>answerWords.has(x)))];
  const lengthScore=Math.min(22,Math.round(answer.length/140*22));
  const signalScore=Math.min(28,matched.length*7);
  const specificityScore=normalized.includes("because")||normalized.includes("trade")||normalized.includes("result")?14:5;
  const score=Math.max(10,Math.min(82,22+lengthScore+signalScore+specificityScore));
  const strengths:string[]=[];
  const gaps:string[]=[];
  if(answer.length>=180)strengths.push("Provides enough detail to evaluate the reasoning.");
  if(matched.length)strengths.push("Covers signal(s): "+matched.slice(0,3).join(", ")+".");
  if(!matched.length)gaps.push("Make the reasoning concrete and address the expected interview signals.");
  if(answer.length<120)gaps.push("Add a specific example, decision, trade-off, or validation step.");
  return {
    score,confidence:45,verdict:verdict(score),
    strengths,gaps,feedback:"Heuristic practice scoring only. Strengthen the answer with concrete reasoning, trade-offs, and a verifiable result; this score does not assess hiring likelihood.",
    coveredSignals:matched.slice(0,8),
    rubric:{
      correctness:Math.min(85,Math.round(score*.9)),
      depth:Math.min(90,Math.round(score*.85)),
      relevance:Math.min(95,Math.round(score*1.05)),
      communication:Math.min(90,Math.round(score*.95))
    },
    model:null
  };
}

export async function generateAdaptiveFollowUp(args:{
  title:string;company:string;jd:string;profile:InterviewProfile;gaps:string[];mode:"mixed"|"technical"|"behavioral"|"system_design";
  parentQuestion:InterviewQuestionDraft;score:number;
}) {
  const targetedGaps=[...args.gaps,...(args.parentQuestion.expectedSignals??[])].filter(Boolean).slice(0,8);
  if(process.env.OPENAI_API_KEY){
    try{
      const result=await buildAIInterviewQuestions({
        title:args.title,company:args.company,jd:args.jd,profile:args.profile,
        gaps:targetedGaps,mode:args.mode,questionCount:3
      });
      const question=result.data.questions[0];
      if(question){
        return {question,model:result.model,mode:"ai" as const};
      }
    }catch(error){
      console.warn("AI adaptive follow-up generation failed; using deterministic follow-up.",error);
    }
  }
  const focus=args.gaps[0]??args.parentQuestion.area;
  const question:InterviewQuestionDraft={
    type:args.parentQuestion.type,
    area:focus,
    question:"Let’s go one level deeper: your previous answer needs more evidence around "+focus+". Give a concrete step-by-step approach, state one trade-off, and explain how you would validate the result.",
    expectedSignals:["Step-by-step reasoning","Explicit trade-off","Validation or rollback plan"],
    evidenceContext:["Follow-up generated from the previous practice answer; it does not add new candidate experience."]
  };
  return {question,model:null,mode:"heuristic" as const};
}

export async function evaluateInterviewAnswer(args:{
  title:string;company:string;question:InterviewQuestionDraft;answer:string;profile:InterviewProfile;
}) {
  const trimmed=args.answer.trim();
  if(trimmed.length<10)throw new Error("Answer is too short to evaluate.");
  if(process.env.OPENAI_API_KEY){
    try{
      const result=await evaluateAIInterviewAnswer({
        title:args.title,company:args.company,question:args.question.question,
        type:args.question.type,area:args.question.area,expectedSignals:args.question.expectedSignals,
        evidenceContext:args.question.evidenceContext,answer:trimmed,profile:args.profile
      });
      return {...result.data,model:result.model};
    }catch(error){
      console.warn("AI interview evaluation failed; using heuristic scoring.",error);
    }
  }
  return fallbackEvaluation(args.question,trimmed);
}
