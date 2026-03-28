import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import type { Tab, GitStatus } from "../types";
import type { Theme } from "../themes";

interface StatusBarProps {
  tabs: Tab[];
  gitStatus: GitStatus | null;
  projectPath: string;
  theme: Theme;
  availableUpdate: Update | null;
}

function shortenHome(path: string): string {
  const home = `/Users/${path.split("/")[2] || ""}`;
  return path.startsWith(home) ? "~" + path.slice(home.length) : path;
}

export function StatusBar({ tabs, gitStatus, projectPath, theme, availableUpdate }: StatusBarProps) {
  const [updating, setUpdating] = useState(false);
  const running = tabs.filter((t) => t.status === "running").length;
  const errored = tabs.filter((t) => t.status === "errored").length;
  const stopped = tabs.filter((t) => t.status === "stopped").length;
  const displayPath = shortenHome(projectPath);

  const handleUpdate = async () => {
    if (!availableUpdate || updating) return;
    setUpdating(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      setUpdating(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: theme.statusBarBg,
        color: theme.statusBarFg,
        height: "24px",
        padding: "0 12px",
        fontSize: "11px",
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: "flex", gap: "12px", minWidth: 0 }}>
        {projectPath && (
          <span
            style={{
              maxWidth: "280px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={projectPath}
          >
            {displayPath}
          </span>
        )}
        {gitStatus?.is_repo && (
          <span>
            ⎇ {gitStatus.branch} {gitStatus.dirty ? "●" : "○"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
        {availableUpdate && (
          <span
            onClick={handleUpdate}
            style={{
              color: theme.accent,
              cursor: updating ? "wait" : "pointer",
            }}
            title={updating ? "Installing update..." : "Click to update and restart"}
          >
            {updating ? "Installing..." : `Update available: v${availableUpdate.version}`}
          </span>
        )}
        {running > 0 && (
          <span style={{ color: theme.running }}>{running} running</span>
        )}
        {errored > 0 && (
          <span style={{ color: theme.errored }}>{errored} errored</span>
        )}
        {stopped > 0 && <span>{stopped} stopped</span>}
      </div>
    </div>
  );
}
