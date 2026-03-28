import { useState, useEffect } from "react";
import { TerminalSquare, Trash2, Plus, X, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Theme } from "../themes";
import { themes, importedThemeToTheme } from "../themes";
import type { MakiConfig, ProcessConfig } from "../types";

type SettingsSection = "commands" | "theme";

interface SettingsCommand {
  id: string;
  name: string;
  cmd: string;
  autostart: boolean;
}

interface SettingsViewProps {
  config: MakiConfig;
  currentTheme: string;
  theme: Theme;
  onSave: (updates: { processes: ProcessConfig[]; theme?: string }) => void;
  onClose: () => void;
}

let nextCommandId = 0;

function configToCommands(config: MakiConfig): SettingsCommand[] {
  return config.processes.map((p) => ({
    id: `settings-cmd-${nextCommandId++}`,
    name: p.name,
    cmd: p.cmd,
    autostart: p.autostart,
  }));
}

export function SettingsView({
  config,
  currentTheme,
  theme,
  onSave,
  onClose,
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("commands");
  const [commands, setCommands] = useState<SettingsCommand[]>(() =>
    configToCommands(config)
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [customThemes, setCustomThemes] = useState<Record<string, Theme>>({});

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleAddCommand = () => {
    const id = `settings-cmd-${nextCommandId++}`;
    setCommands((prev) => [...prev, { id, name: "", cmd: "", autostart: true }]);
    setExpandedId(id);
  };

  const handleUpdateCommand = (id: string, updates: Partial<SettingsCommand>) => {
    setCommands((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const handleDeleteCommand = (id: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleSave = () => {
    const processes: ProcessConfig[] = commands
      .filter((c) => c.name.trim() && c.cmd.trim())
      .map((c) => ({
        name: c.name.trim(),
        cmd: c.cmd.trim(),
        autostart: c.autostart,
      }));
    onSave({ processes, theme: selectedTheme });
  };

  const handleImportTheme = (imported: Theme, name: string) => {
    setCustomThemes((prev) => ({ ...prev, [name]: imported }));
    setSelectedTheme(name);
  };

  const themeList: [string, Theme][] = [
    ...Object.entries(themes),
    ...Object.entries(customThemes),
  ];

  return (
    <div className="settings">
      {/* Header */}
      <div className="settings__header" data-tauri-drag-region>
        <span className="settings__title">Settings</span>
        <button className="settings__close" onClick={onClose} title="Close (Escape)">
          <X size={16} />
        </button>
      </div>

      <div className="settings__body">
        {/* Sidebar */}
        <nav className="settings__sidebar">
          <button
            className={`settings__nav-item ${section === "commands" ? "is-active" : ""}`}
            onClick={() => setSection("commands")}
          >
            Commands
          </button>
          <button
            className={`settings__nav-item ${section === "theme" ? "is-active" : ""}`}
            onClick={() => setSection("theme")}
          >
            Theme
          </button>
        </nav>

        {/* Content */}
        <div className="settings__content">
          <div className="settings__content-inner">
            {section === "commands" && (
              <CommandsSection
                commands={commands}
                expandedId={expandedId}
                theme={theme}
                onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                onUpdate={handleUpdateCommand}
                onDelete={handleDeleteCommand}
                onAdd={handleAddCommand}
              />
            )}

            {section === "theme" && (
              <ThemeSection
                themeList={themeList}
                selectedTheme={selectedTheme}
                theme={theme}
                onSelectTheme={setSelectedTheme}
                onImportTheme={handleImportTheme}
              />
            )}

            <div className="settings__actions">
              <button className="settings__save" onClick={handleSave}>
                Save &amp; restart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Commands Section ── */

function CommandsSection({
  commands,
  expandedId,
  theme,
  onToggle,
  onUpdate,
  onDelete,
  onAdd,
}: {
  commands: SettingsCommand[];
  expandedId: string | null;
  theme: Theme;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<SettingsCommand>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="settings__section-header">
        <h2 className="settings__section-title">Commands</h2>
        <button className="settings__add-btn" onClick={onAdd}>
          <Plus size={14} /> Add command
        </button>
      </div>

      <div className="settings__list">
        {commands.map((cmd) => (
          <div key={cmd.id} className="settings__row">
            {expandedId === cmd.id ? (
              /* Expanded / edit mode */
              <div className="settings__row-expanded">
                <div className="settings__row-inputs">
                  <input
                    className="settings__input settings__input--name"
                    value={cmd.name}
                    onChange={(e) => onUpdate(cmd.id, { name: e.target.value })}
                    placeholder="Name"
                    autoFocus
                  />
                  <input
                    className="settings__input settings__input--cmd"
                    value={cmd.cmd}
                    onChange={(e) => onUpdate(cmd.id, { cmd: e.target.value })}
                    placeholder="Command (e.g. npm run dev)"
                  />
                </div>
                <div className="settings__row-meta">
                  <button
                    className="settings__autostart-toggle"
                    onClick={() => onUpdate(cmd.id, { autostart: !cmd.autostart })}
                    style={{ color: cmd.autostart ? theme.running : theme.stopped }}
                  >
                    <Check size={14} />
                    <span>Start automatically</span>
                  </button>
                  <button
                    className="settings__delete-btn"
                    onClick={() => onDelete(cmd.id)}
                    title="Delete command"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : (
              /* Collapsed / list mode */
              <div className="settings__row-collapsed" onClick={() => onToggle(cmd.id)}>
                <TerminalSquare size={16} className="settings__row-icon" />
                <div className="settings__row-info">
                  <span className="settings__row-name">
                    {cmd.name || <em style={{ color: theme.stopped }}>Untitled</em>}
                  </span>
                  <span className="settings__row-cmd">{cmd.cmd}</span>
                  {cmd.autostart && (
                    <span className="settings__row-badge" style={{ color: theme.running }}>
                      <span className="settings__row-badge-dot" style={{ background: theme.running }} />
                      starts automatically
                    </span>
                  )}
                </div>
                <button
                  className="settings__delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(cmd.id);
                  }}
                  title="Delete command"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}

        {commands.length === 0 && (
          <div className="settings__empty">
            No commands yet. Click "+ Add command" to create one.
          </div>
        )}
      </div>
    </>
  );
}

/* ── Theme Section ── */

interface ImportedThemeData {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  bright_black: string;
  bright_red: string;
  bright_green: string;
  bright_yellow: string;
  bright_blue: string;
  bright_magenta: string;
  bright_cyan: string;
  bright_white: string;
}

function ThemeSection({
  themeList,
  selectedTheme,
  theme,
  onSelectTheme,
  onImportTheme,
}: {
  themeList: [string, Theme][];
  selectedTheme: string;
  theme: Theme;
  onSelectTheme: (name: string) => void;
  onImportTheme: (imported: Theme, name: string) => void;
}) {
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async (format: "iterm2" | "ghostty") => {
    setImportError(null);
    const filters = format === "iterm2"
      ? [{ name: "iTerm2 Color Scheme", extensions: ["itermcolors"] }]
      : [{ name: "Ghostty Theme", extensions: ["conf", "txt", "*"] }];

    const filePath = await open({ filters, multiple: false });
    if (!filePath) return;

    try {
      const command = format === "iterm2" ? "import_iterm2_theme" : "import_ghostty_theme";
      const imported = await invoke<ImportedThemeData>(command, { path: filePath });
      const newTheme = importedThemeToTheme(imported);
      onImportTheme(newTheme, imported.name);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="settings__section-header">
        <h2 className="settings__section-title">Theme</h2>
      </div>

      <div className="settings__list">
        {themeList.map(([name, t]) => (
          <div
            key={name}
            className={`settings__row settings__theme-row ${name === selectedTheme ? "is-active" : ""}`}
            onClick={() => onSelectTheme(name)}
          >
            <span
              className="settings__theme-swatch"
              style={{
                background: t.bg,
                borderColor: name === selectedTheme ? theme.accent : theme.border,
              }}
            />
            <span className="settings__theme-name">{name}</span>
            {name === selectedTheme && (
              <span className="settings__theme-active" style={{ color: theme.accent }}>
                Active
              </span>
            )}
          </div>
        ))}
      </div>

      {importError && (
        <div style={{ color: theme.errored, fontSize: "12px", marginTop: "8px" }}>
          {importError}
        </div>
      )}

      <div className="settings__import-buttons">
        <button className="settings__import-btn" onClick={() => handleImport("iterm2")}>
          Import from iTerm2...
        </button>
        <button className="settings__import-btn" onClick={() => handleImport("ghostty")}>
          Import from Ghostty...
        </button>
      </div>
    </>
  );
}
