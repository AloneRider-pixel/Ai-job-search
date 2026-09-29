import { z } from "zod";

export const applicationPackageSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  roleSummary: z.string().max(1200),
  strengths: z.array(z.string().max(400)).max(12),
  matchedSkills: z.array(z.string().max(120)).max(40),
  missingSkills: z.array(z.string().max(120)).max(40),
  blockers: z.array(z.string().max(400)).max(12),
  requirements: z.array(z.object({
    requirement:z.string().max(800),category:z.enum(["MUST_HAVE","STRONG_SIGNAL","NICE_TO_HAVE","SCREENING_RISK","OPTIONAL"]),
    priority:z.enum(["critical","high","medium","low"]),matched:z.boolean(),confidence:z.number().int().min(0).max(100),
    evidence:z.array(z.string().max(1000)).max(4),gap:z.string().max(600)
  })).max(30),
  resume:z.object({
    summary:z.string().max(1200),skills:z.array(z.string().max(120)).max(50),
    bullets:z.array(z.object({
      experience:z.string().max(180),company:z.string().max(180),bullet:z.string().max(700),evidence:z.array(z.string().max(500)).max(3)
    })).max(24),atsScore:z.number().int().min(0).max(100)
  }),
  outreach:z.object({
    subject:z.string().max(180),body:z.string().max(4000),personalizationSignals:z.array(z.string().max(400)).max(8),verificationRequired:z.boolean()
  }),
  learning:z.array(z.object({
    gap:z.string().max(160),priority:z.enum(["critical","high","medium","low"]),rationale:z.string().max(500),action:z.string().max(700)
  })).max(12),
  interviewPrep:z.array(z.object({area:z.string().max(160),questions:z.array(z.string().max(500)).max(8)})).max(10),
  nextActions:z.array(z.string().max(700)).max(10)
});

export type ApplicationPackageAI=z.infer<typeof applicationPackageSchema>;

export const applicationPackageJsonSchema={
  type:"object",additionalProperties:false,
  required:["fitScore","confidence","roleSummary","strengths","matchedSkills","missingSkills","blockers","requirements","resume","outreach","learning","interviewPrep","nextActions"],
  properties:{
    fitScore:{type:"integer",minimum:0,maximum:100},confidence:{type:"integer",minimum:0,maximum:100},roleSummary:{type:"string"},
    strengths:{type:"array",items:{type:"string"},maxItems:12},matchedSkills:{type:"array",items:{type:"string"},maxItems:40},missingSkills:{type:"array",items:{type:"string"},maxItems:40},blockers:{type:"array",items:{type:"string"},maxItems:12},
    requirements:{type:"array",maxItems:30,items:{type:"object",additionalProperties:false,required:["requirement","category","priority","matched","confidence","evidence","gap"],properties:{
      requirement:{type:"string"},category:{type:"string",enum:["MUST_HAVE","STRONG_SIGNAL","NICE_TO_HAVE","SCREENING_RISK","OPTIONAL"]},priority:{type:"string",enum:["critical","high","medium","low"]},matched:{type:"boolean"},confidence:{type:"integer",minimum:0,maximum:100},evidence:{type:"array",items:{type:"string"},maxItems:4},gap:{type:"string"}
    }}},
    resume:{type:"object",additionalProperties:false,required:["summary","skills","bullets","atsScore"],properties:{
      summary:{type:"string"},skills:{type:"array",items:{type:"string"},maxItems:50},bullets:{type:"array",maxItems:24,items:{type:"object",additionalProperties:false,required:["experience","company","bullet","evidence"],properties:{
        experience:{type:"string"},company:{type:"string"},bullet:{type:"string"},evidence:{type:"array",items:{type:"string"},maxItems:3}
      }}},atsScore:{type:"integer",minimum:0,maximum:100}
    }},
    outreach:{type:"object",additionalProperties:false,required:["subject","body","personalizationSignals","verificationRequired"],properties:{
      subject:{type:"string"},body:{type:"string"},personalizationSignals:{type:"array",items:{type:"string"},maxItems:8},verificationRequired:{type:"boolean"}
    }},
    learning:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["gap","priority","rationale","action"],properties:{
      gap:{type:"string"},priority:{type:"string",enum:["critical","high","medium","low"]},rationale:{type:"string"},action:{type:"string"}
    }}},
    interviewPrep:{type:"array",maxItems:10,items:{type:"object",additionalProperties:false,required:["area","questions"],properties:{
      area:{type:"string"},questions:{type:"array",items:{type:"string"},maxItems:8}
    }}},
    nextActions:{type:"array",items:{type:"string"},maxItems:10}
  }
} as const;
