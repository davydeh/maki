import type { Tab } from "../types";
import type { Theme } from "../themes";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onToggleProcess: (id: string) => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  theme,
  onTabClick,
  onTabClose,
  onToggleProcess,
  onNewTab,
}: TabBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: theme.tabBarBg,
        height: "36px",
        padding: "0 8px",
        gap: "2px",
        userSelect: "none",
      }}
      data-tauri-drag-region
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const icon = tab.type === "shell" ? "$" : statusIcon(tab.status);
        const iconColor =
          tab.type === "shell"
            ? theme.shell
            : tab.status === "running"
            ? theme.running
            : tab.status === "errored"
            ? theme.errored
            : theme.stopped;

        return (
          <div
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "6px",
              backgroundColor: isActive ? theme.activeTabBg : "transparent",
              color: isActive ? theme.activeTabFg : theme.tabFg,
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: isActive ? 600 : 400,
              transition: "background-color 0.1s",
            }}
          >
            <span style={{ color: iconColor, fontSize: "11px" }}>{icon}</span>
            <span>{tab.name}</span>
            {tab.type === "process" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleProcess(tab.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color:
                    tab.status === "running" ? theme.errored : theme.running,
                  cursor: "pointer",
                  fontSize: "10px",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
                title={tab.status === "running" ? "Stop" : "Start"}
              >
                {tab.status === "running" ? "■" : "▶"}
              </button>
            )}
            {isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: theme.stopped,
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
                title="Close (Cmd+W)"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={onNewTab}
        style={{
          background: "none",
          border: "none",
          color: theme.tabFg,
          cursor: "pointer",
          fontSize: "16px",
          padding: "4px 8px",
          lineHeight: 1,
        }}
        title="New tab (Cmd+T)"
      >
        +
      </button>
    </div>
  );
}

function statusIcon(status: string): string {
  switch (status) {
    case "running":
      return "▶";
    case "errored":
      return "✕";
    case "stopped":
      return "◻";
    default:
      return "?";
  }
}
