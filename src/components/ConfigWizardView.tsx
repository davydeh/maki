import { useState, useRef, useEffect } from "react";
import { Plus, FolderOpen, TerminalSquare, Check, RefreshCw } from "lucide-react";
import type { ProjectInspection, WizardDraft, WizardCommandUpdate } from "../types";

interface ConfigWizardViewProps {
  project: ProjectInspection;
  restoreError: string | null;
  wizardDraft: WizardDraft;
  wizardPreview: string | null;
  wizardPreviewError: string | null;
  wizardPreviewPending: boolean;
  wizardPreviewDirty?: boolean;
  wizardSavePending: boolean;
  onAddCommand: () => void | Promise<void>;
  onUpdateCommand: (commandId: string, updates: WizardCommandUpdate) => void;
  onRefreshPreview: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
}

export function ConfigWizardView({
  project,
  restoreError,
  wizardDraft,
  wizardPreviewError,
  wizardSavePending,
  onAddCommand,
  onUpdateCommand,
  onSave,
  onOpenFolder,
}: ConfigWizardViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prevCountRef = useRef(wizardDraft.commands.length);
  const canSave = !wizardSavePending;

  // Auto-expand newly added commands
  useEffect(() => {
    const count = wizardDraft.commands.length;
    if (count > prevCountRef.current && count > 0) {
      setExpandedId(wizardDraft.commands[count - 1].id);
    }
    prevCountRef.current = count;
  }, [wizardDraft.commands]);

  return (
    <div className="shell-screen">
      <div
        className="shell-panel"
        style={{
          width: "min(620px, 100%)",
          maxHeight: "min(700px, calc(100vh - 64px))",
          overflow: "auto",
          gap: "16px",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700 }}>
            Set up {project.name}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--shell-muted)" }}>
            Configure the commands to run when opening this project.
          </p>
        </div>

        {restoreError && (
          <div className="shell-error-banner" role="alert">
            {restoreError}
          </div>
        )}

        {/* Commands section */}
        <section>
          <div className="settings__section-header">
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--shell-muted)",
                letterSpacing: "0.04em",
              }}
            >
              Commands
            </span>
            <button
              type="button"
              className="settings__add-btn"
              onClick={() => { void onAddCommand(); }}
            >
              <Plus size={13} /> Add command
            </button>
          </div>

          <div className="settings__list">
            {wizardDraft.commands.map((command) => (
              <div
                key={command.id}
                data-testid={`wizard-command-${command.id}`}
                className="settings__row"
                style={{ opacity: command.enabled ? 1 : 0.4 }}
              >
                {expandedId === command.id ? (
                  /* Expanded / edit mode */
                  <div className="settings__row-expanded">
                    <div className="settings__row-inputs">
                      {/* Enable checkbox */}
                      <EnableCheckbox
                        checked={command.enabled}
                        onChange={(enabled) =>
                          onUpdateCommand(command.id, { enabled })
                        }
                      />
                      <input
                        className="settings__input settings__input--name"
                        aria-label="Name"
                        value={command.name}
                        onChange={(e) =>
                          onUpdateCommand(command.id, { name: e.target.value })
                        }
                        placeholder="Name"
                        autoFocus
                      />
                      <input
                        className="settings__input settings__input--cmd"
                        aria-label="Command"
                        value={command.cmd}
                        onChange={(e) =>
                          onUpdateCommand(command.id, { cmd: e.target.value })
                        }
                        placeholder="Command (e.g. npm run dev)"
                      />
                    </div>
                    <div className="settings__row-meta">
                      <button
                        className="settings__autostart-toggle"
                        style={{ paddingLeft: "40px" }}
                        onClick={() =>
                          onUpdateCommand(command.id, {
                            autostart: !command.autostart,
                          })
                        }
                      >
                        <span
                          className={`settings__checkbox ${command.autostart ? "is-checked" : ""}`}
                          style={{
                            borderColor: command.autostart
                              ? "var(--shell-accent)"
                              : "var(--shell-muted)",
                            background: command.autostart
                              ? "var(--shell-accent)"
                              : "transparent",
                          }}
                        >
                          {command.autostart && (
                            <Check size={10} style={{ color: "var(--shell-bg)" }} />
                          )}
                        </span>
                        <span
                          style={{
                            color: command.autostart
                              ? "var(--shell-accent)"
                              : "var(--shell-muted)",
                            fontSize: "13px",
                          }}
                        >
                          Start automatically
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Collapsed / list mode */
                  <div
                    className="settings__row-collapsed"
                    onClick={() =>
                      setExpandedId(expandedId === command.id ? null : command.id)
                    }
                  >
                    <EnableCheckbox
                      checked={command.enabled}
                      onChange={(enabled) => {
                        onUpdateCommand(command.id, { enabled });
                      }}
                    />
                    <TerminalSquare size={16} className="settings__row-icon" />
                    <div className="settings__row-info">
                      <div className="settings__row-top">
                        <span className="settings__row-name">
                          {command.name || (
                            <em style={{ color: "var(--shell-muted)" }}>Untitled</em>
                          )}
                        </span>
                        {command.cmd && (
                          <>
                            <span style={{ color: "var(--shell-muted)" }}>·</span>
                            <span className="settings__row-cmd">{command.cmd}</span>
                          </>
                        )}
                      </div>
                      {command.autostart && (
                        <span
                          title="This command starts automatically"
                          style={{ display: "flex", marginTop: "2px" }}
                        >
                          <RefreshCw
                            strokeWidth={2}
                            size={12}
                            style={{ color: "var(--shell-accent)" }}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {wizardDraft.commands.length === 0 && (
              <div className="settings__empty">
                No commands yet. Click "+ Add command" to create one.
              </div>
            )}
          </div>
        </section>

        {/* Preview error */}
        {wizardPreviewError && (
          <div className="shell-error-banner" role="alert">
            {wizardPreviewError}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingTop: "4px",
          }}
        >
          <button
            type="button"
            disabled={!canSave}
            onClick={() => { void onSave(); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 14px",
              border: "1px solid transparent",
              borderRadius: "6px",
              background: canSave ? "var(--shell-accent)" : "var(--shell-surface-strong)",
              color: canSave ? "#11111b" : "var(--shell-muted)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: canSave ? "pointer" : "default",
              opacity: canSave ? 1 : 0.6,
            }}
          >
            {wizardSavePending ? "Saving..." : "Continue"}
          </button>
          <button
            type="button"
            onClick={() => { void onOpenFolder(); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 14px",
              border: "1px solid var(--shell-border)",
              borderRadius: "6px",
              background: "var(--shell-surface-strong)",
              color: "var(--shell-fg)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <FolderOpen size={13} />
            Choose another folder
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Enable checkbox (round, with check SVG) ── */

function EnableCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        aria-label="Enable"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: "none" }}
      />
      <span
        className={`settings__checkbox ${checked ? "is-checked" : ""}`}
        style={{
          borderColor: checked ? "var(--shell-accent)" : "var(--shell-muted)",
          background: checked ? "var(--shell-accent)" : "transparent",
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4.5 7.5L8 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </label>
  );
}
