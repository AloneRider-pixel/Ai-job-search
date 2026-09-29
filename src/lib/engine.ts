export async function analyzeJobDescription(text: string) {
  return { score: 0, summary: text.slice(0, 500) };
}