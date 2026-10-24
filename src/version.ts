import { readFileSync } from "node:fs";

interface PackageMetadata {
  version?: unknown;
}

const metadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageMetadata;

export const packageVersion =
  typeof metadata.version === "string" ? metadata.version : "0.0.0-unknown";

export interface BuildInfo {
  version: string;
  commit: string | null;
  buildDate: string | null;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

export function buildInfo(): BuildInfo {
  return {
    version: packageVersion,
    commit:
      process.env.GROOVECTL_COMMIT ?? process.env.CRATEFLOW_COMMIT ?? null,
    buildDate:
      process.env.GROOVECTL_BUILD_DATE ??
      process.env.CRATEFLOW_BUILD_DATE ??
      null,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}
