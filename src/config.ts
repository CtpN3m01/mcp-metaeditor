import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

config();

function requiredEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const MT5_WINEPREFIX = requiredEnv(
  "MT5_WINEPREFIX",
  resolve(process.env.HOME || "", ".mt5")
);

export const MT5_PATH = requiredEnv(
  "MT5_PATH",
  resolve(MT5_WINEPREFIX, "drive_c/Program Files/MetaTrader 5")
);

export const MQL5_PATH = resolve(MT5_PATH, "MQL5");
export const METAEDITOR_EXE = resolve(MT5_PATH, "MetaEditor64.exe");
export const TERMINAL_EXE = resolve(MT5_PATH, "terminal64.exe");

export function validateConfig(): void {
  if (!existsSync(MT5_PATH)) {
    throw new Error(`MT5_PATH does not exist: ${MT5_PATH}`);
  }
  if (!existsSync(METAEDITOR_EXE)) {
    throw new Error(`MetaEditor64.exe not found at: ${METAEDITOR_EXE}`);
  }
  if (!existsSync(MQL5_PATH)) {
    throw new Error(`MQL5 directory not found at: ${MQL5_PATH}`);
  }
}
