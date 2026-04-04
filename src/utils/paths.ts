import { resolve, normalize, relative } from "path";
import { MQL5_PATH } from "../config.js";

const TYPE_DIRS: Record<string, string> = {
  experts: "Experts",
  indicators: "Indicators",
  scripts: "Scripts",
  include: "Include",
};

export function resolveTypeDirs(type: string): string[] {
  if (type === "all") {
    return Object.values(TYPE_DIRS).map((d) => resolve(MQL5_PATH, d));
  }
  const dir = TYPE_DIRS[type];
  if (!dir) {
    throw new Error(
      `Invalid type: ${type}. Must be one of: ${Object.keys(TYPE_DIRS).join(", ")}, all`
    );
  }
  return [resolve(MQL5_PATH, dir)];
}

export function resolveAndValidateMql5Path(relativePath: string): string {
  const abs = resolve(MQL5_PATH, relativePath);
  const rel = relative(MQL5_PATH, abs);
  if (rel.startsWith("..") || resolve(MQL5_PATH, rel) !== abs) {
    throw new Error(`Path traversal rejected: ${relativePath}`);
  }
  return abs;
}

export function toWindowsRelPath(relativePath: string): string {
  return "MQL5\\" + relativePath.replace(/\//g, "\\");
}

export function toMql5Relative(absolutePath: string): string {
  return relative(MQL5_PATH, absolutePath).replace(/\\/g, "/");
}
