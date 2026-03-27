import { Plus, FolderOpen } from "lucide-react";
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

function hasInvalidEnabledCommands(draft: WizardDraft): boolean {
  return draft.commands.some(
    (command) =>
      command.enabled &&
      (command.name.trim().length === 0 || command.cmd.trim().length === 0)
  );
}

export function ConfigWizardView({
  project,
  restoreError,
  wizardDraft,
  wizardPreview,
  wizardPreviewError,
  wizardPreviewPending,
  wizardPreviewDirty = false,
  wizardSavePending,
  onAddCommand,
  onUpdateCommand,
  onRefreshPreview,
  onSave,
  onOpenFolder,
}: ConfigWizardViewProps) {
  const enabledCommands = wizardDraft.commands.filter((c) => c.enabled).length;
  const hasInvalidCommands = hasInvalidEnabledCommands(wizardDraft);
  const canSave =
    enabledCommands > 0 &&
    !hasInvalidCommands &&
    !wizardPreviewPending &&
    !wizardSavePending &&
    !wizardPreviewDirty &&
    !wizardPreviewError &&
    Boolean(wizardPreview);

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
        <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--shell-muted)",
                letterSpacing: "0.04em",
              }}
            >
              Commands
              {enabledCommands > 0 && (
                <span style={{ fontWeight: 400, marginLeft: "8px" }}>
                  {enabledCommands} enabled
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => { void onAddCommand(); }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                border: "1px solid var(--shell-border)",
                borderRadius: "6px",
                background: "var(--shell-surface-strong)",
                color: "var(--shell-fg)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <Plus size={13} />
              Add command
            </button>
          </div>

          {wizardDraft.commands.length === 0 && (
            <div
              style={{
                padding: "12px",
                fontSize: "13px",
                color: "var(--shell-muted)",
                border: "1px solid var(--shell-border)",
                borderRadius: "8px",
                background: "var(--shell-surface-strong)",
              }}
            >
              No commands yet. Add one to continue.
            </div>
          )}

          {hasInvalidCommands && (
            <div
              style={{
                padding: "8px 12px",
                fontSize: "12px",
                color: "var(--shell-danger)",
              }}
            >
              Fill in name and command for all enabled entries.
            </div>
          )}

          {wizardDraft.commands.map((command) => (
            <div
              key={command.id}
              data-testid={`wizard-command-${command.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                border: "1px solid var(--shell-border)",
                borderRadius: "8px",
                background: "var(--shell-surface-strong)",
                opacity: command.enabled ? 1 : 0.5,
              }}
            >
              {/* Rounded checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <input
                  type="checkbox"
                  aria-label="Enable"
                  checked={command.enabled}
                  onChange={(e) => {
                    onUpdateCommand(command.id, { enabled: e.target.checked });
                  }}
                  style={{ display: "none" }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: command.enabled
                      ? "none"
                      : "2px solid var(--shell-muted)",
                    background: command.enabled
                      ? "var(--shell-accent)"
                      : "transparent",
                    transition: "all 100ms ease",
                    flexShrink: 0,
                  }}
                >
                  {command.enabled && (
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

              {/* Name input */}
              <input
                aria-label="Name"
                value={command.name}
                onChange={(e) => {
                  onUpdateCommand(command.id, { name: e.target.value });
                }}
                placeholder="name"
                style={{
                  width: "100px",
                  padding: "4px 8px",
                  border: "1px solid var(--shell-border)",
                  borderRadius: "4px",
                  background: "var(--shell-surface)",
                  color: "var(--shell-fg)",
                  fontSize: "12px",
                  flexShrink: 0,
                }}
              />

              {/* Command input */}
              <input
                aria-label="Command"
                value={command.cmd}
                onChange={(e) => {
                  onUpdateCommand(command.id, { cmd: e.target.value });
                }}
                placeholder="command"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "4px 8px",
                  border: "1px solid var(--shell-border)",
                  borderRadius: "4px",
                  background: "var(--shell-surface)",
                  color: "var(--shell-fg)",
                  fontSize: "12px",
                }}
              />

              {/* Autostart toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontSize: "11px",
                  color: "var(--shell-muted)",
                }}
                title="Autostart this command on project open"
              >
                <input
                  type="checkbox"
                  aria-label="Autostart"
                  checked={command.autostart}
                  onChange={(e) => {
                    onUpdateCommand(command.id, { autostart: e.target.checked });
                  }}
                  style={{ display: "none" }}
                />
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: command.autostart
                      ? "none"
                      : "1.5px solid var(--shell-muted)",
                    background: command.autostart
                      ? "#a6e3a1"
                      : "transparent",
                    transition: "all 100ms ease",
                  }}
                >
                  {command.autostart && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5L4.5 7.5L8 3"
                        stroke="#11111b"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span>auto</span>
              </label>
            </div>
          ))}
        </section>

        {/* Preview error */}
        {wizardPreviewError && (
          <div className="shell-error-banner" role="alert">
            {wizardPreviewError}
          </div>
        )}

        {wizardPreviewDirty && !wizardPreviewPending && (
          <div style={{ fontSize: "12px", color: "var(--shell-muted)", padding: "0 2px" }}>
            Config changed.{" "}
            <button
              type="button"
              onClick={() => { void onRefreshPreview(); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--shell-accent)",
                cursor: "pointer",
                fontSize: "12px",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Refresh preview
            </button>{" "}
            before saving.
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingTop: "4px",
            borderTop: "1px solid var(--shell-border)",
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
            {wizardSavePending ? "Saving..." : "Save and launch"}
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
