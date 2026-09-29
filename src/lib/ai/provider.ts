type StructuredRequest={name:string;schema:Record<string,unknown>;instructions:string;input:string;model?:string};
type RawResponse={output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;output_text?:string;error?:{message?:string}};

function extractText(response:RawResponse){
  if(response.output_text)return response.output_text;
  const parts:string[]=[];
  for(const item of response.output??[])for(const content of item.content??[])if(content.type==="output_text"&&content.text)parts.push(content.text);
  return parts.join("\n").trim();
}

export async function generateStructured<T>(request:StructuredRequest):Promise<{data:T;model:string}>{
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)throw new Error("OPENAI_API_KEY is not configured.");
  const model=request.model??process.env.OPENAI_MODEL??"gpt-5.6-luna";
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{authorization:"Bearer "+apiKey,"content-type":"application/json"},
    body:JSON.stringify({model,reasoning:{effort:"low"},instructions:request.instructions,input:request.input,text:{format:{type:"json_schema",name:request.name,strict:true,schema:request.schema}}}),
    signal:AbortSignal.timeout(45_000),cache:"no-store"
  });
  const payload=(await response.json()) as RawResponse;
  if(!response.ok)throw new Error(payload.error?.message??"AI provider request failed.");
  const text=extractText(payload);
  if(!text)throw new Error("AI provider returned no structured text.");
  try{return{data:JSON.parse(text) as T,model};}catch{throw new Error("AI provider returned invalid JSON.");}
}
