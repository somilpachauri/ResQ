// src/services/gemini.ts
import { ProcessResult } from "../types";

export interface ImagePayload {
  data: string;      // base64, no data: prefix
  mimeType: string;  // e.g. "image/jpeg"
}

export async function processBrainDump(
  text: string,
  onStep?: (step: string) => void,
  image?: ImagePayload | null
): Promise<ProcessResult> {
  const response = await fetch("/api/process-brain-dump", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, image: image || undefined }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to process: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.steps && Array.isArray(data.steps) && onStep) {
    data.steps.forEach((step: string) => onStep(step));
  }

  return {
    tasks: data.tasks || [],
    artifacts: data.artifacts || [],
    blockers: data.blockers || [],
    rawText: data.rawText || "",
  };
}

// Helper: File → base64 payload for Gemini
export function fileToImagePayload(file: File): Promise<ImagePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1]; // strip "data:image/...;base64,"
      resolve({ data: base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
