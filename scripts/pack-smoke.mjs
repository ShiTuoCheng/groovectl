import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packDirectory = mkdtempSync(join(tmpdir(), "crateflow-pack-"));
const installDirectory = mkdtempSync(join(tmpdir(), "crateflow-install-"));

try {
  execFileSync("pnpm", ["pack", "--pack-destination", packDirectory], {
    stdio: "inherit",
  });
  const tarball = readdirSync(packDirectory).find((name) =>
    name.endsWith(".tgz"),
  );
  if (tarball === undefined)
    throw new Error("pnpm pack did not create a tarball");
  writeFileSync(join(installDirectory, "package.json"), '{"private":true}\n');
  execFileSync(
    "npm",
    ["install", "--ignore-scripts=false", join(packDirectory, tarball)],
    {
      cwd: installDirectory,
      stdio: "inherit",
    },
  );
  const executable =
    process.platform === "win32" ? "crateflow.cmd" : "crateflow";
  const output = execFileSync(
    join(installDirectory, "node_modules", ".bin", executable),
    ["version", "--json"],
    { encoding: "utf8" },
  );
  const version = JSON.parse(output);
  if (version.version !== "0.0.0-development")
    throw new Error("installed CLI returned an unexpected version");
  process.stdout.write("Pack/install smoke test passed.\n");
} finally {
  rmSync(packDirectory, { recursive: true, force: true });
  rmSync(installDirectory, { recursive: true, force: true });
}
