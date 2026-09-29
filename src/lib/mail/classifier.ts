export type ApplicationEventCandidate={
  type:"application_confirmation"|"recruiter_reply"|"screening"|"assessment"|"interview"|"scheduling"|"rejection"|"offer"|"request_info";
  confidence:number;
  evidence:string[];
};

const patterns:Array<[ApplicationEventCandidate["type"],RegExp[],number[]]>=[
  ["offer",[/\boffer\b/i,/\bcompensation\b/i,/\bjoin us\b/i],[95,85,80]],
  ["rejection",[/not moving forward/i,/unfortunately/i,/regret to inform/i,/position has been filled/i,/other candidates/i],[92,75,88,90,82]],
  ["scheduling",[/calendar invite/i,/scheduled for/i,/availability/i,/schedule.*interview/i],[92,90,82,92]],
  ["interview",[/interview/i,/technical round/i,/hiring manager/i,/phone screen/i],[86,88,82,85]],
  ["assessment",[/coding challenge/i,/assessment/i,/take-home/i,/online test/i,/hackerrank/i],[90,88,85,84,82]],
  ["application_confirmation",[/application.*received/i,/thank you for applying/i,/application.*submitted/i],[90,86,84]],
  ["request_info",[/please provide/i,/additional information/i,/can you share/i,/availability/i],[82,84,80,78]],
  ["recruiter_reply",[/recruiter/i,/talent acquisition/i,/candidate experience/i,/thanks for reaching out/i],[78,82,78,86]],
];

export function classifyEmail(subject:string,body:string):ApplicationEventCandidate[]{
  const haystack=(subject+"\n"+body).slice(0,12000);
  const results:ApplicationEventCandidate[]=[];
  for(const [type,regexes,weights] of patterns){
    const evidence:string[]=[];
    let confidence=0;
    regexes.forEach((regex,index)=>{if(regex.test(haystack)){evidence.push("Matched: "+regex.source);confidence=Math.max(confidence,weights[index]??75);}});
    if(evidence.length)results.push({type,confidence,evidence});
  }
  return results.sort((a,b)=>b.confidence-a.confidence).slice(0,3);
}
