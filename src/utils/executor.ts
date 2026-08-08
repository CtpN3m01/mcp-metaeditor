import { execFile } from "child_process";
import { IS_WINDOWS, MT5_WINEPREFIX, MT5_PATH } from "../config.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runExecutable(
  exe: string,
  args: string[],
  timeoutMs: number = 30000
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      IS_WINDOWS ? exe : "wine",
      IS_WINDOWS ? args : [exe, ...args],
      {
        cwd: MT5_PATH,
        env: IS_WINDOWS
          ? process.env
          : {
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
