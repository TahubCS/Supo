// Turns an uploaded document into plain text / light Markdown for the
// knowledge base and help center. Runs server-side only.
import { extractDocument } from "./extract";

/** Vercel functions accept request bodies up to ~4.5 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 200_000;

export const UPLOAD_EXTENSIONS = [".pdf", ".docx", ".md", ".markdown", ".txt", ".csv", ".html", ".htm"] as const;

export type ParsedFile = { title: string; text: string; format: "pdf" | "docx" | "markdown" | "text" | "csv" | "html" };

export class UploadError extends Error {}

function extensionOf(name: string): string {
  const match = /\.[a-z0-9]+$/i.exec(name.trim());
  return match ? match[0].toLowerCase() : "";
}

function titleFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return (base || "Untitled document").slice(0, 160);
}

function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Strip a UTF-8 BOM and NULs (Postgres text can't store \0).
  return text.replace(/^﻿/, "").replace(/\u0000/g, "");
}

function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

function isZip(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // PK..
}

function finish(title: string, text: string, format: ParsedFile["format"]): ParsedFile {
  const cleaned = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) throw new UploadError("No readable text was found in this file.");
  return { title, text: cleaned.slice(0, MAX_EXTRACTED_CHARS), format };
}

export async function parseUploadedFile(name: string, bytes: Uint8Array): Promise<ParsedFile> {
  if (bytes.byteLength === 0) throw new UploadError("The file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(`Files are limited to ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  const ext = extensionOf(name);
  const title = titleFromName(name);

  switch (ext) {
    case ".pdf": {
      if (!isPdf(bytes)) throw new UploadError("This doesn't look like a PDF file.");
      const { getDocumentProxy, extractText } = await import("unpdf");
      try {
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const { text } = await extractText(pdf, { mergePages: true });
        return finish(title, text, "pdf");
      } catch (error) {
        if (error instanceof UploadError) throw error;
        throw new UploadError("Could not read this PDF. It may be encrypted or scanned without text.");
      }
    }
    case ".docx": {
      if (!isZip(bytes)) throw new UploadError("This doesn't look like a Word (.docx) file.");
      const mammoth = await import("mammoth");
      try {
        const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
        return finish(title, extractDocument(`<html><body><main>${html}</main></body></html>`, "text/html").text, "docx");
      } catch (error) {
        if (error instanceof UploadError) throw error;
        throw new UploadError("Could not read this Word document.");
      }
    }
    case ".html":
    case ".htm": {
      const page = extractDocument(decodeText(bytes), "text/html");
      return finish(page.title?.slice(0, 160) || title, page.text, "html");
    }
    case ".md":
    case ".markdown":
      return finish(title, decodeText(bytes), "markdown");
    case ".csv":
      return finish(title, decodeText(bytes), "csv");
    case ".txt":
      return finish(title, decodeText(bytes), "text");
    default:
      throw new UploadError(`Unsupported file type. Upload ${UPLOAD_EXTENSIONS.join(", ")}.`);
  }
}
