/**
 * Reporting module -- tracks event counts, errors, and timing.
 * Outputs markdown-ready summaries.
 */

import { log } from "./utils.js";

export interface EventStats {
  type: string;
  attempted: number;
  succeeded: number;
  failed: number;
}

export class Report {
  private stats: Map<string, EventStats> = new Map();
  private errors: Map<string, string[]> = new Map();
  private startTime: number = Date.now();
  private endTime: number | null = null;

  /** Record a successful event. */
  success(type: string): void {
    const s = this.getOrCreate(type);
    s.attempted++;
    s.succeeded++;
  }

  /** Record a failed event with an error message. */
  failure(type: string, errorMessage: string): void {
    const s = this.getOrCreate(type);
    s.attempted++;
    s.failed++;
    const errList = this.errors.get(type) ?? [];
    // Keep at most 20 error samples per type
    if (errList.length < 20) {
      errList.push(errorMessage);
    }
    this.errors.set(type, errList);
  }

  /** Increment attempted/succeeded by a bulk count. */
  bulkSuccess(type: string, count: number): void {
    const s = this.getOrCreate(type);
    s.attempted += count;
    s.succeeded += count;
  }

  /** Mark the simulation as finished. */
  finish(): void {
    this.endTime = Date.now();
  }

  /** Get stats for a single event type. */
  getStats(type: string): EventStats | undefined {
    return this.stats.get(type);
  }

  /** Get all stats. */
  getAllStats(): EventStats[] {
    return Array.from(this.stats.values());
  }

  /** Duration in milliseconds. */
  get durationMs(): number {
    const end = this.endTime ?? Date.now();
    return end - this.startTime;
  }

  /** Format the report as markdown-ready text. */
  format(): string {
    const lines: string[] = [];
    lines.push("# Simulation Report");
    lines.push("");
    const dur = this.durationMs;
    const secs = (dur / 1000).toFixed(1);
    lines.push(`**Duration:** ${secs}s`);
    lines.push("");
    lines.push("## Events Summary");
    lines.push("");
    lines.push("| Type | Attempted | Succeeded | Failed |");
    lines.push("|------|-----------|-----------|--------|");

    let totalAttempted = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    for (const s of this.stats.values()) {
      lines.push(`| ${s.type} | ${s.attempted} | ${s.succeeded} | ${s.failed} |`);
      totalAttempted += s.attempted;
      totalSucceeded += s.succeeded;
      totalFailed += s.failed;
    }
    lines.push(`| **Total** | **${totalAttempted}** | **${totalSucceeded}** | **${totalFailed}** |`);
    lines.push("");

    if (this.errors.size > 0) {
      lines.push("## Errors");
      lines.push("");
      for (const [type, msgs] of this.errors) {
        lines.push(`### ${type}`);
        const unique = [...new Set(msgs)];
        for (const msg of unique) {
          lines.push(`- ${msg}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /** Print the report to stdout. */
  print(): void {
    console.log(this.format());
  }

  /** Print a short progress line to stderr. */
  progress(message: string): void {
    log(message);
  }

  private getOrCreate(type: string): EventStats {
    let s = this.stats.get(type);
    if (!s) {
      s = { type, attempted: 0, succeeded: 0, failed: 0 };
      this.stats.set(type, s);
    }
    return s;
  }
}
