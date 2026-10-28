import { PDFDocument } from "pdf-lib";

// Splits a PDF into small PDFs of `pagesPerChunk` pages so each AI call stays short.
export async function splitPdf(bytes: Uint8Array, pagesPerChunk = 4) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = source.getPageCount();
  const chunks: { firstPage: number; bytes: Uint8Array }[] = [];

  for (let start = 0; start < pageCount; start += pagesPerChunk) {
    const doc = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(pagesPerChunk, pageCount - start) }, (_, i) => start + i);
    const pages = await doc.copyPages(source, indices);
    pages.forEach((p) => doc.addPage(p));
    chunks.push({ firstPage: start + 1, bytes: await doc.save() });
  }

  return { pageCount, chunks };
}
