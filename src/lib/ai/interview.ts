import {
  interviewEvaluationJsonSchema,
  interviewEvaluationSchema,
  interviewQuestionSetJsonSchema,
  interviewQuestionSetSchema,
  type ApplicationPackageAI
} from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/provider";

export type InterviewProfile = {
  name:string;
  headline?:string;
  summary?:string;
  skills:string[];
  experience:Array<{title:string;company:string;bullets:string[]}>;
};

function inputBlock(args:{
  title:string;
  company:string;
  jd:string;
  profile:InterviewProfile;
  gaps:string[];
  mode:string;
}) {
  return [
    "TARGET ROLE", "Title: "+args.title, "Company: "+args.company, "Mode: "+args.mode,
    "", "JOB DESCRIPTION", args.jd,
    "", "CANDIDATE PROFILE", JSON.stringify(args.profile,null,2),
    "", "KNOWN APPLICATION GAPS", JSON.stringify(args.gaps),
  ].join("\n");
}

const GENERATION_INSTRUCTIONS=[
  "You are CareerOS Adaptive InterviewOS, an evidence-grounded interview simulator.",
  "Generate interview questions that test the target role, not generic trivia.",
  "Use the job description as the source of role requirements and the candidate profile as the source of candidate facts.",
  "Never invent candidate experience, technologies, employers, metrics, projects, dates, or responsibilities.",
  "Questions may challenge an unverified area, but evidenceContext must state that it is a gap or a hypothetical scenario rather than implying the candidate has done it.",
  "Mix technical, system design/debugging, behavioral, and situational questions when the mode is mixed.",
  "Expected signals are the observable elements a strong answer should cover; they are scoring criteria, not candidate facts.",
  "Keep questions concise, realistic, and answerable in an interview setting.",
  "Avoid requiring private recruiter or employer information.",
].join(" ");

const EVALUATION_INSTRUCTIONS=[
  "You are CareerOS Adaptive InterviewOS evaluating a candidate's practice answer.",
  "Score answer quality for the interview question, not the candidate's employability or likelihood of receiving an offer.",
  "Judge correctness, depth, relevance, and communication using the question and expected signals.",
  "Do not award credit for claims that contradict the supplied candidate evidence when the answer presents them as real past experience.",
  "A hypothetical answer may receive credit for reasoning without being treated as past experience.",
  "Never invent missing facts to make an answer look stronger.",
  "Give concise, actionable feedback and identify the next improvement target.",
].join(" ");

export async function buildAIInterviewQuestions(args:{
  title:string;company:string;jd:string;profile:InterviewProfile;gaps:string[];mode:string;questionCount:number;
}) {
  const result=await generateStructured<unknown>({
    name:"careeros_interview_questions",
    schema:interviewQuestionSetJsonSchema,
    instructions:GENERATION_INSTRUCTIONS,
    input:inputBlock(args)+"\nGenerate exactly "+args.questionCount+" questions."
  });
  const parsed=interviewQuestionSetSchema.parse(result.data);
  return {data:parsed,model:result.model};
}

export async function evaluateAIInterviewAnswer(args:{
  title:string;company:string;question:string;type:string;area:string;expectedSignals:string[];evidenceContext:string[];answer:string;profile:InterviewProfile;
}) {
  const input=[
    "TARGET ROLE", args.title+" @ "+args.company,
    "", "QUESTION", args.question,
    "Type: "+args.type,
    "Area: "+args.area,
    "Expected signals", JSON.stringify(args.expectedSignals),
    "Evidence context", JSON.stringify(args.evidenceContext),
    "", "CANDIDATE PROFILE", JSON.stringify(args.profile,null,2),
    "", "PRACTICE ANSWER", args.answer
  ].join("\n");
  const result=await generateStructured<unknown>({
    name:"careeros_interview_evaluation",
    schema:interviewEvaluationJsonSchema,
    instructions:EVALUATION_INSTRUCTIONS,
    input
  });
  return {data:interviewEvaluationSchema.parse(result.data),model:result.model};
}

export type InterviewPackageHints = Pick<ApplicationPackageAI,"requirements"|"learning">;
