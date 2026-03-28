import { useState, useRef, useEffect, useMemo } from "react";
import { Plus, FolderOpen, Search, Play, Square } from "lucide-react";
import type { Tab } from "../types";
import type { Theme } from "../themes";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  projectName: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onOpenFolder: () => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  theme,
  projectName,
  onTabClick,
  onTabClose,
  onOpenFolder,
  onNewTab,
}: TabBarProps) {
  const shells = tabs.filter((t) => t.type === "shell");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        margin: "0 4px 12px 4px",
        borderRadius: "999px",
        height: "34px",
        padding: "2px",
        gap: "1px",
        background: theme.tabBarBg,
        userSelect: "none",
      }}
      data-tauri-drag-region
    >
      {shells.map((tab, index) => (
        <ShellTab
          key={tab.id}
          tab={tab}
          defaultName={projectName}
          isActive={tab.id === activeTabId}
          tabIndex={index}
          isLastTab={index === shells.length - 1}
          theme={theme}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
        />
      ))}

      <button
        onClick={onNewTab}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          background: "none",
          border: "none",
          color: theme.fg,
          cursor: "pointer",
          borderRadius: "999px",
          opacity: 0.6,
          flexShrink: 0,
        }}
        title="New shell (Cmd+T)"
      >
        <Plus size={15} />
      </button>

      <button
        onClick={onOpenFolder}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          background: "none",
          border: "none",
          color: theme.fg,
          cursor: "pointer",
          borderRadius: "999px",
          opacity: 0.6,
          flexShrink: 0,
        }}
        title="Open Folder... (Cmd+O)"
      >
        <FolderOpen size={14} />
      </button>
    </div>
  );
}

/* ── Command bar (sits at the bottom, above status bar) ── */

interface CommandBarProps {
  commands: Tab[];
  hasOneOffCommands: boolean;
  activeTabId: string;
  theme: Theme;
  onFocusCommand: (id: string) => void;
  onRunCommand: (id: string) => void;
  onStopCommand: (id: string) => void;
  onOpenLauncher: () => void;
}

export function CommandBar({
  commands,
  hasOneOffCommands,
  activeTabId,
  theme,
  onFocusCommand,
  onRunCommand,
  onStopCommand,
  onOpenLauncher,
}: CommandBarProps) {
  if (commands.length === 0 && !hasOneOffCommands) return null;

  return (
    <div className="command-bar">
      <div className="command-bar__group">
        {commands.length === 0 && (
          <span className="command-bar__empty">No auto-run commands</span>
        )}

        {commands.map((tab) => (
          <CommandPill
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            theme={theme}
            onFocusCommand={onFocusCommand}
            onRunCommand={onRunCommand}
            onStopCommand={onStopCommand}
          />
        ))}
      </div>

      {hasOneOffCommands && (
        <button className="command-launcher-trigger" onClick={onOpenLauncher}>
          <Search size={12} />
          <span>Run command</span>
          <span className="command-launcher-trigger__hint">Cmd+P</span>
        </button>
      )}
    </div>
  );
}

/* ── Shell tab with inline rename ── */

function ShellTab({
  tab,
  defaultName,
  isActive,
  theme,
  tabIndex,
  isLastTab,
  onTabClick,
  onTabClose,
}: {
  tab: Tab;
  defaultName: string;
  isActive: boolean;
  theme: Theme;
  tabIndex: number;
  isLastTab: boolean;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [customName, setCustomName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = customName || defaultName;
  const isFirstTab = tabIndex === 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    setCustomName(trimmed || null);
    setEditing(false);
  };

  return (
    <div
      onClick={() => onTabClick(tab.id)}
      onDoubleClick={() => {
        setEditValue(displayName);
        setEditing(true);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        flex: 1,
        minWidth: 0,
        height: "100%",
        padding: "0 4px",
        borderTopLeftRadius: isFirstTab ? "999px" : "0",
        borderTopRightRadius: isLastTab ? "999px" : "0",
        borderBottomLeftRadius: isFirstTab ? "999px" : "0",
        borderBottomRightRadius: isLastTab ? "999px" : "0",
        backgroundColor: isActive ? theme.activeTabBg : theme.inactiveTabBg,
        color: isActive ? theme.fg : theme.tabFg,
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: isActive ? 500 : 400,
        transition: "background-color 100ms ease",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            fontSize: "inherit",
            fontWeight: "inherit",
            textAlign: "center",
            width: "100%",
            outline: "none",
            padding: 0,
          }}
        />
      ) : (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {displayName}
        </span>
      )}

      {isActive && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.id);
          }}
          style={{
            position: "absolute",
            left: "12px",
            background: "none",
            border: "none",
            color: theme.fg,
            cursor: "pointer",
            fontSize: "14px",
            padding: "0 0 3px 0",
            flexShrink: 0,
            opacity: 0.5,
          }}
          title="Close (Cmd+W)"
        >
          ×
        </button>
      )}

      {!editing && tabIndex < 10 && (
        <span
          style={{
            position: "absolute",
            right: "12px",
            background: "none",
            color: theme.fg,
            fontSize: "12px",
            lineHeight: 1,
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          &#8984;{tabIndex + 1}
        </span>
      )}
    </div>
  );
}

function CommandPill({
  tab,
  isActive,
  theme,
  onFocusCommand,
  onRunCommand,
  onStopCommand,
}: {
  tab: Tab;
  isActive: boolean;
  theme: Theme;
  onFocusCommand: (id: string) => void;
  onRunCommand: (id: string) => void;
  onStopCommand: (id: string) => void;
}) {
  const isRunning = tab.status === "running";
  const isStopped = tab.status === "stopped" || tab.status === "errored";

  const dotColor = isRunning
    ? theme.running
    : tab.status === "errored"
      ? theme.errored
      : theme.stopped;

  return (
    <button
      className="command-pill"
      onClick={() => onFocusCommand(tab.id)}
    >
      <span className="command-pill__indicator">
        {isRunning && (
          <span
            className="command-pill__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStopCommand(tab.id);
            }}
            title="Stop"
          >
            <Square size={8} fill="currentColor" style={{ opacity: "0.5" }} />
          </span>
        )}
        {isStopped && (
          <span
            className="command-pill__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRunCommand(tab.id);
            }}
            title="Restart"
            style={{ color: theme.running }}
          >
            <Play size={8} fill="currentColor" style={{ opacity: "0.5" }} />
          </span>
        )}
      </span>
      <span className="command-pill__name">{tab.name}</span>
    </button>
  );
}

interface CommandLauncherProps {
  open: boolean;
  commands: Tab[];
  theme: Theme;
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export function CommandLauncher({
  open,
  commands,
  theme,
  onClose,
  onRunCommand,
}: CommandLauncherProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = `${command.name} ${command.args.join(" ")}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const maxIndex = Math.max(0, filtered.length - 1);
    if (activeIndex > maxIndex) {
      setActiveIndex(maxIndex);
    }
  }, [activeIndex, filtered.length, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        if (filtered.length === 0) {
          return;
        }

        event.preventDefault();
        onRunCommand(filtered[activeIndex].id);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, filtered, onClose, onRunCommand, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="command-launcher" onClick={onClose}>
      <div
        className="command-launcher__panel"
        style={{
          background: theme.activeTabBg,
          color: theme.fg,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="command-launcher__input-wrap">
          <Search size={14} />
          <input
            ref={inputRef}
            className="command-launcher__input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search commands..."
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <span className="command-launcher__hint">Esc</span>
        </div>

        <div className="command-launcher__list">
          {filtered.length === 0 && (
            <div className="command-launcher__empty">No matching command</div>
          )}

          {filtered.map((command, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={command.id}
                className={`command-launcher__item ${isActive ? "is-active" : ""}`}
                style={{
                  background: isActive ? theme.accent : "transparent",
                  color: isActive ? "#fff" : theme.fg,
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onRunCommand(command.id);
                  onClose();
                }}
              >
                <span
                  className="command-launcher__dot"
                  style={{
                    backgroundColor:
                      command.status === "running"
                        ? theme.running
                        : command.status === "errored"
                          ? theme.errored
                          : theme.stopped,
                  }}
                />
                <span className="command-launcher__name">{command.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
