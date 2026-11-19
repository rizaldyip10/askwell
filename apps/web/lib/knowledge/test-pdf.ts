// Test fixture: a tiny, valid PDF (Helvetica 12 pt, one text line per entry), built in code
// so the tests carry no binary file. `lines: []` gives a page with no text layer, like a
// scanned document. pdf.js skips text outside the page, so lines go 45 to a page, and each
// line should stay under about 80 characters to fit the page width.

export const PDF_LINES_PER_PAGE = 45;

/** Escape a string for a PDF literal string: backslash and parentheses. ASCII only. */
function pdfString(text: string): string {
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

export function tinyPdf(lines: string[]): Uint8Array {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += PDF_LINES_PER_PAGE) pages.push(lines.slice(i, i + PDF_LINES_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  // Objects: 1 catalog, 2 pages, 3 font, then a page and its content stream per page.
  const pageId = (i: number) => 4 + i * 2;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [i, pageLines] of pages.entries()) {
    const content = pageLines.length
      ? `BT /F1 12 Tf 14 TL 72 720 Td ${pageLines.map((l) => `${pdfString(l)} Tj T*`).join(" ")} ET`
      : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageId(i) + 1} 0 R ` +
        "/Resources << /Font << /F1 3 0 R >> >> >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
