/** Gemini on Vertex AI, shared by the TOR summaries and the e-GP PDF readers. */
import { GoogleGenAI } from "@google/genai";
import { NonRetryableError, withRetry } from "./http.js";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Thrown when VERTEX_API_KEY isn't configured. */
export class GenAIUnavailableError extends Error {}

let client: GoogleGenAI | undefined;

// Created on first use so the server still starts for anyone without a key.
export function getGenAI(): GoogleGenAI {
  const apiKey = process.env.VERTEX_API_KEY;
  if (!apiKey) {
    throw new GenAIUnavailableError("VERTEX_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ vertexai: true, apiKey });
  return client;
}

/** Inline PDF limit for one request; callers skip bigger files. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Agencies sometimes upload a scanned image where a PDF is expected (seen:
 * a winner announcement as .jpg). Sent as a PDF, Gemini rejects it with
 * "The document has no pages", so the type comes from the file's own bytes.
 */
function fileMimeType(file: Buffer) {
  if (file[0] === 0xff && file[1] === 0xd8) return "image/jpeg";
  if (file.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  return "application/pdf";
}

/**
 * Sends a PDF plus an instruction to Gemini and returns the text reply.
 * Large scanned PDFs can hit Vertex's per-minute quota (429); that's
 * temporary, so it waits and retries. Other client errors (e.g. "document
 * has no pages") won't improve with retries.
 */
export async function askAboutPdf(pdf: Buffer, prompt: string, json: boolean): Promise<string> {
  const response = await withRetry(
    async () => {
      try {
        return await getGenAI().models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: fileMimeType(pdf), data: pdf.toString("base64") } },
                { text: prompt },
              ],
            },
          ],
          config: { temperature: 0, ...(json ? { responseMimeType: "application/json" } : {}) },
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw new NonRetryableError(error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    },
    4,
    15_000,
  );
  return response.text ?? "";
}
