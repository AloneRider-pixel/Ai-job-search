import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, HeadingLevel, Paragraph, Packer, TextRun } from "docx";

export type ResumeModel = {
  name: string;
  title: string;
  contact: string;
  summary?: string;
  skills: string[];
  experience: Array<{ company: string; role: string; bullets: string[] }>;
};

function splitLongLine(text: string, max = 95) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function resumeModelFromText(text: string): ResumeModel {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const name = lines[0] ?? "Candidate";
  const title = lines[1] ?? "Software Engineer";
  const contact = lines[2] ?? "";
  const summaryIndex = lines.findIndex((line) => /^summary$/i.test(line));
  const skillsIndex = lines.findIndex((line) => /^skills$/i.test(line));
  const experienceIndex = lines.findIndex((line) => /^experience$/i.test(line));

  const summary = summaryIndex >= 0
    ? lines.slice(summaryIndex + 1, [skillsIndex, experienceIndex].filter((n) => n > summaryIndex).sort((a, b) => a - b)[0] ?? lines.length).join(" ")
    : lines.slice(3, Math.min(5, lines.length)).join(" ");

  const skills = skillsIndex >= 0
    ? lines.slice(skillsIndex + 1, experienceIndex > skillsIndex ? experienceIndex : lines.length).join(" ").split(/·|,|\|/).map((x) => x.trim()).filter(Boolean)
    : [];

  const experience: ResumeModel["experience"] = [];
  if (experienceIndex >= 0) {
    let current: ResumeModel["experience"][number] | null = null;
    for (const line of lines.slice(experienceIndex + 1)) {
      if (/^•/.test(line) && current) current.bullets.push(line.replace(/^•\s*/, ""));
      else if (line.includes(" — ") || line.includes(" - ")) {
        const separator = line.includes(" — ") ? " — " : " - ";
        const [role, company] = line.split(separator);
        current = { role: role.trim(), company: company.trim(), bullets: [] };
        experience.push(current);
      }
    }
  }

  return { name, title, contact, summary, skills, experience };
}

export async function generateDocx(resume: ResumeModel) {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: resume.name, bold: true, size: 30 })], spacing: { after: 70 } }),
    new Paragraph({ children: [new TextRun({ text: resume.title, bold: true, size: 22 })], spacing: { after: 30 } }),
    new Paragraph({ children: [new TextRun({ text: resume.contact, size: 18 })], spacing: { after: 150 } }),
  ];

  if (resume.summary) {
    children.push(new Paragraph({ text: "SUMMARY", heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: resume.summary }));
  }

  if (resume.skills.length) {
    children.push(new Paragraph({ text: "SKILLS", heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: resume.skills.join(" · ") }));
  }

  children.push(new Paragraph({ text: "EXPERIENCE", heading: HeadingLevel.HEADING_1 }));
  for (const item of resume.experience) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: item.role, bold: true }),
        new TextRun({ text: " — " + item.company }),
      ],
      spacing: { before: 80, after: 40 },
    }));
    for (const bullet of item.bullets) {
      children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
    }
  }

  const doc = new Document({
    creator: "CareerOS",
    title: resume.title,
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function generatePdf(resume: ResumeModel) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(resume.title);
  pdf.setAuthor("CareerOS");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(A4);
  let y = 800;
  const margin = 42;
  const maxWidth = A4[0] - margin * 2;

  const drawWrapped = (text: string, size: number, fontToUse = font, lineGap = 4) => {
    for (const line of splitLongLine(text, size <= 10 ? 105 : 82)) {
      if (y < 52) { page = pdf.addPage(A4); y = 800; }
      page.drawText(line, { x: margin, y, size, font: fontToUse, color: rgb(0.08,0.1,0.09), maxWidth });
      y -= size + lineGap;
    }
  };

  drawWrapped(resume.name, 18, bold, 5);
  drawWrapped(resume.title, 12, bold, 4);
  if (resume.contact) drawWrapped(resume.contact, 9, font, 7);

  const section = (label: string) => {
    if (y < 90) { page = pdf.addPage(A4); y = 800; }
    y -= 8;
    drawWrapped(label, 10, bold, 4);
    y -= 2;
  };

  if (resume.summary) { section("SUMMARY"); drawWrapped(resume.summary, 9, font, 3); }
  if (resume.skills.length) { section("SKILLS"); drawWrapped(resume.skills.join(" · "), 9, font, 3); }

  section("EXPERIENCE");
  for (const item of resume.experience) {
    drawWrapped(item.role + " — " + item.company, 9.5, bold, 3);
    for (const bullet of item.bullets) {
      drawWrapped("• " + bullet, 9, font, 3);
    }
  }

  return Buffer.from(await pdf.save());
}
