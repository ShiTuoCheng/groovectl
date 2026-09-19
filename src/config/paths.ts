import { homedir } from "node:os";
import { join } from "node:path";

export function configFilePath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.NODE_ENV === "test" && env.CRATEFLOW_CONFIG_DIR !== undefined) {
    return join(env.CRATEFLOW_CONFIG_DIR, "config.json");
  }
  const home = homedir();
  if (platform === "win32") {
    return join(
      env.APPDATA ?? join(home, "AppData", "Roaming"),
      "crateflow",
      "config.json",
    );
  }
  if (platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "crateflow",
      "config.json",
    );
  }
  return join(
    env.XDG_CONFIG_HOME ?? join(home, ".config"),
    "crateflow",
    "config.json",
  );
}
