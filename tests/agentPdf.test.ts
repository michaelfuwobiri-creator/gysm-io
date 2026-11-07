import { describe, expect, it } from "vitest";
import { pdfToText } from "@/lib/agentPdf";

// A tiny hand-made one-page PDF with a text layer.
function makePdf(text: string, lines = 1): Uint8Array {
  const stream = `BT /F1 10 Tf 72 740 Td 12 TL ` + Array.from({ length: lines }, () => `(${text}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe("pdfToText", () => {
  it("extracts the text of a PDF", async () => {
    const r = await pdfToText(makePdf("Bakery menu croissant 3 EUR"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Bakery menu croissant 3 EUR");
      expect(r.pages).toBe(1);
    }
  });
  it("cuts long text at the limit", async () => {
    const r = await pdfToText(makePdf("word word word word", 40), 100);
    expect(r).toMatchObject({ ok: true, cut: true });
    if (r.ok) expect(r.text.length).toBe(100);
  });
  it("fails kindly on bytes that are not a PDF", async () => {
    const r = await pdfToText(new TextEncoder().encode("hello"));
    expect(r.ok).toBe(false);
  });
});
