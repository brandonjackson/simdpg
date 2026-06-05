/**
 * Simulation runner / orchestrator.
 *
 * runYear()  - Run one simulated year of life events.
 * runScale() - Run at configurable scale with concurrency control.
 */

import { IdentityClient, SERVICE_URLS } from "@simdpg/api-clients";
import type { Citizen } from "@simdpg/api-clients";
import { log, logError, sleep } from "./utils.js";
import { Report } from "./report.js";

import { runBirths } from "./events/birth.js";
import { runDeaths } from "./events/death.js";
import { runMarriages } from "./events/marriage.js";
import { runClinicVisits } from "./events/clinic-visit.js";
import { runVaccinations } from "./events/vaccination.js";
import { runBenefitClaims } from "./events/benefit-claim.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface YearConfig {
  identityUrl: string;
  civilRegistryUrl: string;
  healthUrl: string;
  benefitsUrl: string;
  simulationDate?: Date;
}

export interface ScaleConfig extends YearConfig {
  populationSize: number;
  concurrency: number;
  years: number;
}

export function yearConfigFromEnv(): YearConfig {
  return {
    identityUrl: process.env.IDENTITY_URL ?? SERVICE_URLS.identity,
    civilRegistryUrl: process.env.CIVIL_REGISTRY_URL ?? SERVICE_URLS.civilRegistry,
    healthUrl: process.env.HEALTH_URL ?? SERVICE_URLS.health,
    benefitsUrl: process.env.BENEFITS_URL ?? SERVICE_URLS.benefits,
  };
}

export function scaleConfigFromEnv(): ScaleConfig {
  return {
    ...yearConfigFromEnv(),
    populationSize: parseInt(process.env.POPULATION_SIZE ?? "100", 10),
    concurrency: parseInt(process.env.CONCURRENCY ?? "5", 10),
    years: parseInt(process.env.YEARS ?? "1", 10),
  };
}

// ---------------------------------------------------------------------------
// Semaphore for concurrency control
// ---------------------------------------------------------------------------

class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// Fetch current population from identity service
// ---------------------------------------------------------------------------

async function fetchPopulation(identityUrl: string): Promise<Citizen[]> {
  const identity = new IdentityClient(identityUrl);

  // Fetch all citizens via search with a broad query
  // The identity service should return all citizens when no filter is applied
  try {
    const citizens = await identity.searchCitizens({});
    log(`Fetched ${citizens.length} citizens from identity service`);
    return citizens;
  } catch (err) {
    logError("Failed to fetch population", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// runYear
// ---------------------------------------------------------------------------

export async function runYear(config: YearConfig): Promise<Report> {
  const report = new Report();
  const simDate = config.simulationDate ?? new Date();

  log("=== Simulating one year of events ===");
  log(`Simulation date: ${simDate.toISOString().slice(0, 10)}`);
  log(`Identity:       ${config.identityUrl}`);
  log(`Civil Registry: ${config.civilRegistryUrl}`);
  log(`Health:         ${config.healthUrl}`);
  log(`Benefits:       ${config.benefitsUrl}`);

  // Fetch current population
  const citizens = await fetchPopulation(config.identityUrl);

  if (citizens.length === 0) {
    log("No citizens found. Run 'sim:generate' first to create a population.");
    report.finish();
    return report;
  }

  log(`Population: ${citizens.length} citizens`);

  // Run events in sequence to maintain data consistency
  // (births before deaths, deaths before benefits, etc.)

  log("");
  log("--- Births ---");
  await runBirths(
    {
      identityUrl: config.identityUrl,
      civilRegistryUrl: config.civilRegistryUrl,
      healthUrl: config.healthUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  log("");
  log("--- Deaths ---");
  await runDeaths(
    {
      identityUrl: config.identityUrl,
      civilRegistryUrl: config.civilRegistryUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  log("");
  log("--- Marriages ---");
  await runMarriages(
    {
      civilRegistryUrl: config.civilRegistryUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  log("");
  log("--- Clinic Visits ---");
  await runClinicVisits(
    {
      healthUrl: config.healthUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  log("");
  log("--- Vaccinations ---");
  await runVaccinations(
    {
      healthUrl: config.healthUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  log("");
  log("--- Benefit Claims ---");
  await runBenefitClaims(
    {
      benefitsUrl: config.benefitsUrl,
      civilRegistryUrl: config.civilRegistryUrl,
      citizens,
      simulationDate: simDate,
    },
    report,
  );

  report.finish();

  log("");
  log("=== Year Simulation Complete ===");
  report.print();

  return report;
}

// ---------------------------------------------------------------------------
// runScale
// ---------------------------------------------------------------------------

export async function runScale(config: ScaleConfig): Promise<Report> {
  const report = new Report();
  const semaphore = new Semaphore(config.concurrency);

  log("=== Running scale simulation ===");
  log(`Years: ${config.years}`);
  log(`Concurrency: ${config.concurrency}`);

  // Run each year sequentially -- events within a year run with concurrency control
  const startDate = new Date();

  for (let year = 0; year < config.years; year++) {
    const simDate = new Date(startDate);
    simDate.setFullYear(simDate.getFullYear() + year);

    log("");
    log(`========== Year ${year + 1} of ${config.years} (${simDate.getFullYear()}) ==========`);

    // Fetch population snapshot for this year
    const citizens = await fetchPopulation(config.identityUrl);

    if (citizens.length === 0) {
      log("No citizens found. Run 'sim:generate' first.");
      break;
    }

    // Run event batches with concurrency control
    const eventRunners = [
      async () => {
        await semaphore.acquire();
        try {
          await runBirths(
            {
              identityUrl: config.identityUrl,
              civilRegistryUrl: config.civilRegistryUrl,
              healthUrl: config.healthUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
      async () => {
        await semaphore.acquire();
        try {
          await runDeaths(
            {
              identityUrl: config.identityUrl,
              civilRegistryUrl: config.civilRegistryUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
      async () => {
        await semaphore.acquire();
        try {
          await runMarriages(
            {
              civilRegistryUrl: config.civilRegistryUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
      async () => {
        await semaphore.acquire();
        try {
          await runClinicVisits(
            {
              healthUrl: config.healthUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
      async () => {
        await semaphore.acquire();
        try {
          await runVaccinations(
            {
              healthUrl: config.healthUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
      async () => {
        await semaphore.acquire();
        try {
          await runBenefitClaims(
            {
              benefitsUrl: config.benefitsUrl,
              civilRegistryUrl: config.civilRegistryUrl,
              citizens,
              simulationDate: simDate,
            },
            report,
          );
        } finally {
          semaphore.release();
        }
      },
    ];

    // Run events concurrently within each year
    await Promise.all(eventRunners.map((fn) => fn()));
  }

  report.finish();

  log("");
  log("=== Scale Simulation Complete ===");
  report.print();

  return report;
}
