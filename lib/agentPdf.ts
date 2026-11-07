import { extractText, getDocumentProxy } from "unpdf";

// Reads the text out of a PDF the user attached, so the agent can use it
// (a menu, a brief, a CV). Text PDFs only: scanned pages have no text layer.

export const MAX_PDF_TEXT_CHARS = 30_000;
export const MAX_PDF_PAGES = 40;

export type PdfText = { ok: true; text: string; pages: number; cut: boolean } | { ok: false; error: string };

export async function pdfToText(data: Uint8Array, maxChars = MAX_PDF_TEXT_CHARS): Promise<PdfText> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    if (pdf.numPages > MAX_PDF_PAGES) return { ok: false, error: `This PDF has ${pdf.numPages} pages (limit ${MAX_PDF_PAGES}). Attach fewer pages.` };
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const clean = String(text).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) return { ok: false, error: "No text found in this PDF. It may be scanned images; attach the pages as images instead." };
    const cut = clean.length > maxChars;
    return { ok: true, text: cut ? clean.slice(0, maxChars) : clean, pages: totalPages, cut };
  } catch {
    return { ok: false, error: "This PDF could not be read. It may be damaged or password protected." };
  }
}
