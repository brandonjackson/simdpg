/**
 * Route-coverage check (Milestone 3).
 *
 * Boots each system's Express app in-process (SIMDPG_NO_LISTEN keeps it from
 * binding a port), enumerates the routes it actually registers, and compares
 * them against the paths documented in that system's openapi.yaml — both
 * directions. Fails if the code and the spec have drifted apart.
 *
 * Run with: npm run check:routes
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import listEndpoints from "express-list-endpoints";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SYSTEMS = [
  { name: "identity", entry: "systems/identity/src/index.ts", spec: "systems/identity/openapi.yaml" },
  { name: "civil-registry", entry: "systems/civil-registry/src/index.ts", spec: "systems/civil-registry/openapi.yaml" },
  { name: "health", entry: "systems/health/src/index.ts", spec: "systems/health/openapi.yaml" },
  { name: "benefits", entry: "systems/benefits/src/index.ts", spec: "systems/benefits/openapi.yaml" },
  { name: "notifications", entry: "systems/notifications/src/index.ts", spec: "systems/notifications/openapi.yaml" },
  { name: "payments", entry: "systems/payments/src/index.ts", spec: "systems/payments/openapi.yaml" },
  { name: "social-registry", entry: "systems/social-registry/src/index.ts", spec: "systems/social-registry/openapi.yaml" },
];

// Documentation/meta endpoints that intentionally live outside the spec.
const IGNORE = new Set(["GET /docs", "GET /openapi.yaml"]);

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Normalise an Express or OpenAPI path to a single comparable form. */
function normalisePath(path) {
  // Express ":id" -> OpenAPI "{id}"
  let p = path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  // Drop a trailing slash (except for the root path)
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function routesFromApp(app) {
  const routes = new Set();
  for (const ep of listEndpoints(app)) {
    const path = normalisePath(ep.path);
    for (const method of ep.methods) {
      if (!HTTP_METHODS.has(method)) continue; // ignore HEAD/OPTIONS
      routes.add(`${method} ${path}`);
    }
  }
  return routes;
}

function routesFromSpec(spec) {
  const routes = new Set();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item)) {
      const m = method.toUpperCase();
      if (!HTTP_METHODS.has(m)) continue; // skip "parameters", "summary", etc.
      routes.add(`${m} ${normalisePath(path)}`);
    }
  }
  return routes;
}

let failed = false;

for (const sys of SYSTEMS) {
  const mod = await import(pathToFileURL(resolve(ROOT, sys.entry)).href);
  const app = mod.default;
  if (!app || typeof app.use !== "function") {
    console.error(`✖ ${sys.name}: ${sys.entry} does not default-export an Express app`);
    failed = true;
    continue;
  }

  const codeRoutes = routesFromApp(app);
  const spec = parseYaml(readFileSync(resolve(ROOT, sys.spec), "utf8"));
  const specRoutes = routesFromSpec(spec);

  const missingFromSpec = [...codeRoutes]
    .filter((r) => !specRoutes.has(r) && !IGNORE.has(r))
    .sort();
  const staleInSpec = [...specRoutes].filter((r) => !codeRoutes.has(r)).sort();

  if (missingFromSpec.length === 0 && staleInSpec.length === 0) {
    console.log(`✓ ${sys.name}: ${codeRoutes.size} routes match openapi.yaml`);
    continue;
  }

  failed = true;
  console.error(`✖ ${sys.name}: route/spec mismatch`);
  for (const r of missingFromSpec) {
    console.error(`    in code, missing from spec:  ${r}`);
  }
  for (const r of staleInSpec) {
    console.error(`    in spec, missing from code:  ${r}`);
  }
}

if (failed) {
  console.error("\nRoute-coverage check failed. Update the openapi.yaml (or the routes) so they agree.");
  process.exit(1);
}
console.log("\nAll systems' routes match their OpenAPI specs.");
