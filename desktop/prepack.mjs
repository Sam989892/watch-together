// Prepare a self-contained bundle for electron-builder: build the UI and copy
// it plus the agent (with its deps) into ./resources, which the config ships
// into the packaged app's resourcesPath.

import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const res = join(here, "resources");

console.log("• building client…");
execSync("npm run build", { cwd: join(root, "client"), stdio: "inherit" });

console.log("• staging resources…");
rmSync(res, { recursive: true, force: true });
mkdirSync(res, { recursive: true });

// Built UI.
cpSync(join(root, "client", "dist"), join(res, "client"), { recursive: true });

// Agent + sync server source with their node_modules; skip local-only env.
for (const pkg of ["agent", "server"]) {
  cpSync(join(root, pkg), join(res, pkg), {
    recursive: true,
    filter: (src) => !src.endsWith("/.env"),
  });
}

console.log("✓ resources staged at desktop/resources");
