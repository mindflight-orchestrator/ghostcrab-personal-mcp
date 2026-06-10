import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseDownArgs,
  runDownAll,
  runDownCurrentDb
} from "../../bin/commands/brain-down.mjs";

describe("gcp brain down", () => {
  let root = "";
  let prevSqlitePath: string | undefined;

  beforeEach(() => {
    // resolveGhostcrabSqlite honors GHOSTCRAB_SQLITE_PATH first; clear it so the
    // explicit --db path drives the resolved pid-file directory in these tests.
    prevSqlitePath = process.env.GHOSTCRAB_SQLITE_PATH;
    delete process.env.GHOSTCRAB_SQLITE_PATH;
    root = mkdtempSync(join(tmpdir(), "gcp-down-"));
  });

  afterEach(() => {
    if (prevSqlitePath === undefined) delete process.env.GHOSTCRAB_SQLITE_PATH;
    else process.env.GHOSTCRAB_SQLITE_PATH = prevSqlitePath;
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("parses flags and rejects conflicting targets", () => {
    expect(parseDownArgs(["--all", "--dry-run", "--json"])).toMatchObject({
      all: true,
      dryRun: true,
      json: true
    });
    expect(parseDownArgs(["--db", "/tmp/x.sqlite"])).toMatchObject({
      sqlitePathFromCli: "/tmp/x.sqlite"
    });
    expect(parseDownArgs(["--all", "--db", "x"])).toMatchObject({
      error: expect.stringContaining("--all")
    });
    expect(parseDownArgs(["--db", "x", "--default"])).toMatchObject({
      error: expect.stringContaining("either")
    });
    expect(parseDownArgs(["--bogus"])).toMatchObject({
      error: expect.stringContaining("unknown")
    });
    expect(parseDownArgs(["--help"])).toBe("help");
  });

  it("--all dry-run lists processes without terminating", () => {
    const terminated: unknown[] = [];
    const report = runDownAll(
      { dryRun: true },
      {
        listProcesses: () => [{ pid: 100 }, { pid: 200 }],
        terminate: (procs: { pid: number }[]) => {
          terminated.push(...procs);
          return procs.map((p) => ({ pid: p.pid, status: "terminated" }));
        }
      }
    );

    expect(report.mode).toBe("all");
    expect(report.processes.map((p: { pid: number }) => p.pid)).toEqual([
      100, 200
    ]);
    expect(report.killed).toEqual([
      { pid: 100, status: "dry-run" },
      { pid: 200, status: "dry-run" }
    ]);
    expect(terminated).toEqual([]);
  });

  it("--all terminates every discovered GhostCrab process", () => {
    const report = runDownAll(
      { dryRun: false },
      {
        listProcesses: () => [{ pid: 100 }],
        terminate: (procs: { pid: number }[]) =>
          procs.map((p) => ({ pid: p.pid, status: "terminated" }))
      }
    );
    expect(report.killed).toEqual([{ pid: 100, status: "terminated" }]);
  });

  it("current-db: reports not-found when no pid file exists", () => {
    const db = join(root, "ghostcrab.sqlite");
    const report = runDownCurrentDb({
      dryRun: false,
      sqlitePathFromCli: db,
      defaultFromCli: false
    });
    expect(report.mode).toBe("current-db");
    expect(report.backend.status).toBe("not-found");
  });

  it("current-db: SIGTERMs a live backend and removes its pid file", () => {
    const db = join(root, "ghostcrab.sqlite");
    const pidFile = join(root, "ghostcrab-backend.pid");
    writeFileSync(pidFile, "4242:8091:0.5.1\n", "utf8");

    const signals: [number, string | number][] = [];
    const report = runDownCurrentDb(
      { dryRun: false, sqlitePathFromCli: db, defaultFromCli: false },
      {
        kill: (pid: number, sig?: string | number) => {
          signals.push([pid, sig ?? 0]);
        }
      }
    );

    expect(report.backend.pid).toBe(4242);
    expect(report.backend.status).toBe("terminated");
    expect(signals).toContainEqual([4242, 0]);
    expect(signals).toContainEqual([4242, "SIGTERM"]);
    expect(existsSync(pidFile)).toBe(false);
  });

  it("current-db: dry-run probes liveness but never sends SIGTERM", () => {
    const db = join(root, "ghostcrab.sqlite");
    const pidFile = join(root, "ghostcrab-backend.pid");
    writeFileSync(pidFile, "4242:8091:0.5.1\n", "utf8");

    const signals: [number, string | number][] = [];
    const report = runDownCurrentDb(
      { dryRun: true, sqlitePathFromCli: db, defaultFromCli: false },
      {
        kill: (pid: number, sig?: string | number) => {
          signals.push([pid, sig ?? 0]);
        }
      }
    );

    expect(report.backend.status).toBe("dry-run");
    expect(signals).toEqual([[4242, 0]]);
    expect(existsSync(pidFile)).toBe(true);
  });

  it("current-db: cleans up a stale pid file when the process is gone", () => {
    const db = join(root, "ghostcrab.sqlite");
    const pidFile = join(root, "ghostcrab-backend.pid");
    writeFileSync(pidFile, "4242:8091:0.5.1\n", "utf8");

    const report = runDownCurrentDb(
      { dryRun: false, sqlitePathFromCli: db, defaultFromCli: false },
      {
        kill: () => {
          throw new Error("ESRCH");
        }
      }
    );

    expect(report.backend.status).toBe("stale");
    expect(existsSync(pidFile)).toBe(false);
  });
});
