import { readFile } from "fs/promises";
import iconv from "iconv-lite";

export interface CompileMessage {
  file: string;
  line: number;
  column: number;
  type: "error" | "warning" | "information";
  code: number;
  message: string;
}

export interface CompileResult {
  success: boolean;
  errors: number;
  warnings: number;
  elapsed: string;
  messages: CompileMessage[];
}

export async function parseCompileLog(logPath: string): Promise<CompileResult> {
  const raw = await readFile(logPath);
  const text = iconv.decode(raw, "utf-16le");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const messages: CompileMessage[] = [];
  let errors = 0;
  let warnings = 0;
  let elapsed = "";

  const msgPattern =
    /^(.+?)\((\d+),(\d+)\)\s*:\s*(error|warning)\s+(\d+):\s*(.+)$/;
  const resultPattern =
    /^Result:\s*(\d+)\s*errors?,\s*(\d+)\s*warnings?(?:,\s*(\d+\s*msec)\s*elapsed)?/;

  for (const line of lines) {
    const msgMatch = line.match(msgPattern);
    if (msgMatch) {
      messages.push({
        file: msgMatch[1].trim(),
        line: parseInt(msgMatch[2], 10),
        column: parseInt(msgMatch[3], 10),
        type: msgMatch[4] as "error" | "warning",
        code: parseInt(msgMatch[5], 10),
        message: msgMatch[6].trim(),
      });
      continue;
    }

    const resMatch = line.match(resultPattern);
    if (resMatch) {
      errors = parseInt(resMatch[1], 10);
      warnings = parseInt(resMatch[2], 10);
      elapsed = resMatch[3] || "";
    }
  }

  return {
    success: errors === 0,
    errors,
    warnings,
    elapsed,
    messages,
  };
}
