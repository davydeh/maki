import type { Tab, GitStatus } from "../types";
import type { Theme } from "../themes";

interface StatusBarProps {
  tabs: Tab[];
  gitStatus: GitStatus | null;
  theme: Theme;
}

export function StatusBar({ tabs, gitStatus, theme }: StatusBarProps) {
  const running = tabs.filter((t) => t.status === "running").length;
  const errored = tabs.filter((t) => t.status === "errored").length;
  const stopped = tabs.filter((t) => t.status === "stopped").length;

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
      <div style={{ display: "flex", gap: "12px" }}>
        {gitStatus?.is_repo && (
          <span>
            ⎇ {gitStatus.branch} {gitStatus.dirty ? "●" : "○"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
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
