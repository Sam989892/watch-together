// Runs the two things each viewer needs locally — the agent and the client UI —
// as one command. The sync server is deployed once, separately (see README).
import { spawn } from "node:child_process";

const procs = [
  ["agent",  "npm", ["--prefix", "agent", "start"]],
  ["client", "npm", ["--prefix", "client", "run", "dev"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
  p.on("exit", (code) => { console.log(`[${name}] exited (${code})`); shutdown(); });
  return p;
});

let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const p of procs) p.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
