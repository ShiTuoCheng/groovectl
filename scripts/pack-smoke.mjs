import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

const packDirectory = mkdtempSync(join(tmpdir(), "groovectl-pack-"));
const installDirectory = mkdtempSync(join(tmpdir(), "groovectl-install-"));
const metadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

// Windows package managers and bin shims are .cmd files, not native executables.
// Explicit cmd.exe invocation also handles installation directories with spaces.
function run(command, args, options) {
  if (process.platform !== "win32") return execFileSync(command, args, options);
  // Bare quoted .cmd names can give wrappers the working directory as %~dp0.
  // Resolve PATH first so pnpm/npm wrappers locate their own JS entry points.
  const executable = isAbsolute(command)
    ? command
    : (process.env.PATH ?? "")
        .split(delimiter)
        .flatMap((directory) =>
          (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
            .split(";")
            .map((extension) =>
              join(directory.replace(/^"|"$/gu, ""), `${command}${extension}`),
            ),
        )
        .find((candidate) => existsSync(candidate));
  if (executable === undefined)
    throw new Error(`Executable not found on PATH: ${command}`);
  const parts = [executable, ...args].map((value) => {
    if (/["%\r\n]/u.test(value))
      throw new Error("Unsupported Windows command argument");
    return `"${value}"`;
  });
  return execFileSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/v:off", "/s", "/c", `"${parts.join(" ")}"`],
    {
      ...options,
      windowsVerbatimArguments: true,
    },
  );
}

try {
  run("pnpm", ["pack", "--pack-destination", packDirectory], {
    stdio: "inherit",
  });
  const tarball = readdirSync(packDirectory).find((name) =>
    name.endsWith(".tgz"),
  );
  if (tarball === undefined)
    throw new Error("pnpm pack did not create a tarball");
  writeFileSync(join(installDirectory, "package.json"), '{"private":true}\n');
  run(
    "npm",
    ["install", "--ignore-scripts=false", join(packDirectory, tarball)],
    {
      cwd: installDirectory,
      stdio: "inherit",
    },
  );
  const executable =
    process.platform === "win32" ? "groovectl.cmd" : "groovectl";
  const output = run(
    join(installDirectory, "node_modules", ".bin", executable),
    ["version", "--json"],
    { encoding: "utf8" },
  );
  const version = JSON.parse(output);
  if (version.version !== metadata.version)
    throw new Error("installed CLI returned an unexpected version");
  const help = run(
    join(installDirectory, "node_modules", ".bin", executable),
    ["--help"],
    { encoding: "utf8" },
  );
  if (!help.includes("Usage: groovectl ") || !help.includes("marketplace"))
    throw new Error(
      "installed CLI did not expose the expected command name and commands",
    );
  process.stdout.write("Pack/install smoke test passed.\n");
} finally {
  rmSync(packDirectory, { recursive: true, force: true });
  rmSync(installDirectory, { recursive: true, force: true });
}
