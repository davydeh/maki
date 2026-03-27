import { useState, Fragment } from "react";
import { Plus } from "lucide-react";
import type { Tab } from "../types";
import type { Theme } from "../themes";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onToggleProcess: (id: string) => void;
  onOpenFolder: () => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  theme,
  onTabClick,
  onTabClose,
  onToggleProcess,
  onOpenFolder,
  onNewTab,
}: TabBarProps) {
  const shells = tabs.filter((t) => t.type === "shell");
  const commands = tabs.filter((t) => t.type === "process");

  return (
    <div className="tab-bar" style={{ userSelect: "none" }}>
      {/* Row 1: Shell tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: "42px",
          padding: "0 10px",
          gap: "0",
          background: theme.tabBarBg,
        }}
        data-tauri-drag-region
      >
        {shells.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`shell-tab ${isActive ? "shell-tab--active" : ""}`}
              onClick={() => onTabClick(tab.id)}
            >
              <span
                style={{
                  fontSize: "12px",
                  opacity: isActive ? 0.6 : 0.35,
                  flexShrink: 0,
                  fontFamily: '"SF Mono", Menlo, monospace',
                }}
              >
                &gt;_
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {tab.name}
              </span>
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
                    padding: "0",
                    lineHeight: 1,
                    flexShrink: 0,
                    opacity: 0.6,
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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            marginBottom: "2px",
            background: "none",
            border: "none",
            color: theme.tabFg,
            cursor: "pointer",
            borderRadius: "6px",
            opacity: 0.35,
          }}
          title="New shell (Cmd+T)"
        >
          <Plus size={15} />
        </button>

        <div style={{ flex: 1 }} data-tauri-drag-region />

        <button
          onClick={onOpenFolder}
          style={{
            background: "none",
            border: "none",
            color: theme.tabFg,
            cursor: "pointer",
            fontSize: "11px",
            padding: "4px 8px",
            marginBottom: "4px",
            lineHeight: 1,
            opacity: 0.35,
          }}
          title="Open Folder... (Cmd+O)"
        >
          Open Folder...
        </button>
      </div>

      {/* Row 2: Command bookmarks bar */}
      {commands.length > 0 && (
        <div className="command-bar">
          {commands.map((tab, i) => (
            <Fragment key={tab.id}>
              {i > 0 && <span className="command-bar__divider" />}
              <CommandBookmark
                tab={tab}
                isActive={tab.id === activeTabId}
                theme={theme}
                onTabClick={onTabClick}
                onToggleProcess={onToggleProcess}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* Command bookmark — compact with pipe separators */
function CommandBookmark({
  tab,
  isActive,
  theme,
  onTabClick,
  onToggleProcess,
}: {
  tab: Tab;
  isActive: boolean;
  theme: Theme;
  onTabClick: (id: string) => void;
  onToggleProcess: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isRunning = tab.status === "running";
  const isErrored = tab.status === "errored";

  const dotColor = isRunning
    ? theme.running
    : isErrored
    ? theme.errored
    : theme.stopped;

  return (
    <div
      className="command-bar__item"
      onClick={() => onTabClick(tab.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: isActive ? theme.activeTabFg : theme.tabFg,
        fontWeight: isActive ? 600 : 400,
      }}
    >
      {hovered ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleProcess(tab.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "14px",
            height: "14px",
            padding: 0,
            border: `1px solid ${theme.stopped}`,
            borderRadius: "3px",
            background: "none",
            color: isRunning ? theme.stopped : theme.running,
            cursor: "pointer",
            fontSize: "7px",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title={isRunning ? "Stop" : "Start"}
        >
          {isRunning ? "■" : "▶"}
        </button>
      ) : (
        <span
          style={{
            display: "inline-block",
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      <span>{tab.name}</span>
    </div>
  );
}
