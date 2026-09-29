import {applicationPackageSchema,applicationPackageJsonSchema,type ApplicationPackageAI} from "@/lib/ai/schemas";
import {generateStructured} from "@/lib/ai/provider";
import {APPLICATION_PACKAGE_INSTRUCTIONS,buildApplicationPackageInput} from "@/lib/ai/prompts";

export type CandidateProfileInput={name:string;headline?:string;experienceYears:number;skills:string[];summary?:string;experience:Array<{title:string;company:string;bullets:string[]}>};

export async function buildAIApplicationPackage(args:{title:string;company:string;jd:string;profile:CandidateProfileInput}){
  const result=await generateStructured<ApplicationPackageAI>({
    name:"careeros_application_package",schema:applicationPackageJsonSchema,instructions:APPLICATION_PACKAGE_INSTRUCTIONS,
    input:buildApplicationPackageInput(args)
  });
  return{data:applicationPackageSchema.parse(result.data),model:result.model};
}
