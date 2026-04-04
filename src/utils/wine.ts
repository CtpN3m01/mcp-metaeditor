import { execFile } from "child_process";
import { MT5_WINEPREFIX, MT5_PATH } from "../config.js";

export interface WineResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runWine(
  exe: string,
  args: string[],
  timeoutMs: number = 30000
): Promise<WineResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "wine",
      [exe, ...args],
      {
        cwd: MT5_PATH,
        env: {
          ...process.env,
          WINEPREFIX: MT5_WINEPREFIX,
          WINEDEBUG: "-all",
        },
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      }
    );
  });
}
