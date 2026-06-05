const systems = [
  { name: "Identity", url: "http://localhost:3001" },
  { name: "Health", url: "http://localhost:3003" },
];

async function check() {
  const down = [];
  for (const svc of systems) {
    try {
      await fetch(svc.url, { signal: AbortSignal.timeout(2000) });
    } catch {
      down.push(svc.name);
    }
  }
  if (down.length > 0) {
    console.error(`\nError: Systems are not running (${down.join(", ")} unreachable).\n`);
    console.error("Start them first in another terminal:\n");
    console.error("  npm run dev:systems\n");
    console.error("Then re-run this command.\n");
    process.exit(1);
  }
}

check();
