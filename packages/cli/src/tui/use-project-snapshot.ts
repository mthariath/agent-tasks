import { access } from "node:fs/promises";
import path from "node:path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import chokidar from "chokidar";
import { TASKS_DIR, indexProject, initProject } from "@agenttasks/core";
import type { ProjectIndex } from "@agenttasks/core";

export interface ProjectSnapshot {
  mode: "loading" | "missing" | "ready" | "error";
  index?: ProjectIndex;
  error?: string;
  lastReloadReason?: string;
  watcherState: "idle" | "reloading" | "live" | "error";
}

interface UseProjectSnapshotResult {
  snapshot: ProjectSnapshot;
  reload: (reason?: string) => Promise<void>;
  initialize: () => Promise<void>;
}

async function hasProject(rootDir: string): Promise<boolean> {
  try {
    await access(path.join(rootDir, TASKS_DIR));
    return true;
  } catch {
    return false;
  }
}

export function useProjectSnapshot(rootDir: string): UseProjectSnapshotResult {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>({ mode: "loading", watcherState: "idle" });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  const load = useCallback(async (reason?: string) => {
    try {
      const exists = await hasProject(rootDir);
      if (!exists) {
        if (mounted.current) {
          setSnapshot({
            mode: "missing",
            lastReloadReason: reason,
            watcherState: "idle"
          });
        }
        return;
      }

      if (mounted.current) {
        setSnapshot((current) => current.mode === "ready"
          ? {
              ...current,
              watcherState: "reloading"
            }
          : current);
      }

      const index = await indexProject(rootDir);
      if (mounted.current) {
        setSnapshot({
          mode: "ready",
          index,
          lastReloadReason: reason,
          watcherState: "live"
        });
      }
    } catch (error) {
      if (mounted.current) {
        setSnapshot({
          mode: "error",
          error: (error as Error).message,
          lastReloadReason: reason,
          watcherState: "error"
        });
      }
    }
  }, [rootDir]);

  useEffect(() => {
    mounted.current = true;
    void load();

    const watcher = chokidar.watch(path.join(rootDir, TASKS_DIR), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 25
      }
    });

    const queueReload = () => {
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }

      reloadTimer.current = setTimeout(() => {
        void load("Reloaded after filesystem change");
      }, 150);
    };

    watcher.on("add", queueReload);
    watcher.on("change", queueReload);
    watcher.on("unlink", queueReload);
    watcher.on("addDir", queueReload);
    watcher.on("unlinkDir", queueReload);

    return () => {
      mounted.current = false;
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
      void watcher.close();
    };
  }, [load, rootDir]);

  const initialize = useCallback(async () => {
    await initProject(rootDir);
    await load("Initialized .agent-tasks");
  }, [load, rootDir]);

  return useMemo(() => ({
    snapshot,
    reload: load,
    initialize
  }), [initialize, load, snapshot]);
}
