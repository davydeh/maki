import type { CSSProperties } from "react";
import type { DetectionSignal, ProjectInspection, WizardDraft, WizardCommandUpdate } from "../types";

interface ConfigWizardViewProps {
  project: ProjectInspection;
  restoreError: string | null;
  wizardDraft: WizardDraft;
  wizardPreview: string | null;
  wizardPreviewError: string | null;
  wizardPreviewPending: boolean;
  wizardPreviewDirty?: boolean;
  wizardSavePending: boolean;
  onUpdateCommand: (commandId: string, updates: WizardCommandUpdate) => void;
  onRefreshPreview: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
}

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  border: "1px solid rgba(137, 180, 250, 0.22)",
  borderRadius: 999,
  background: "rgba(137, 180, 250, 0.08)",
  color: "var(--shell-fg)",
  fontSize: 13,
  fontWeight: 600,
};

const sourceBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(108, 112, 134, 0.18)",
  color: "var(--shell-muted)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const commandCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 18,
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  background:
    "linear-gradient(180deg, rgba(137, 180, 250, 0.04), rgba(137, 180, 250, 0)), rgba(49, 50, 68, 0.44)",
};

const toggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  color: "var(--shell-fg)",
};

const inputLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 13,
  color: "var(--shell-muted)",
};

const previewPanelStyle: CSSProperties = {
  minHeight: 220,
  padding: 18,
  border: "1px solid var(--shell-border)",
  borderRadius: 18,
  background: "rgba(24, 24, 37, 0.88)",
  overflow: "auto",
  fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

function formatStackLabel(stack: DetectionSignal["stack"]): string {
  switch (stack) {
    case "node":
      return "Node.js";
    case "laravel":
      return "Laravel";
    case "python":
      return "Python";
  }
}

function formatSourceLabel(source: string): string {
  return source === "script_hint" ? "Script Hint" : "Entrypoint Hint";
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
  onUpdateCommand,
  onRefreshPreview,
  onSave,
  onOpenFolder,
}: ConfigWizardViewProps) {
  const enabledCommands = wizardDraft.commands.filter((command) => command.enabled).length;

  return (
    <div className="shell-screen">
      <div
        className="shell-panel"
        style={{
          width: "min(980px, 100%)",
          maxHeight: "min(860px, calc(100vh - 64px))",
          overflow: "auto",
        }}
      >
        <div className="shell-copy">
          <span className="shell-kicker">maki</span>
          <h1 className="shell-title">Set Up {project.name}</h1>
          <p className="shell-subtitle">
            Review the detected stack, tune the suggested processes, confirm the YAML,
            then save `maki.yaml` and launch the workspace.
          </p>
        </div>

        {restoreError && (
          <div className="shell-error-banner" role="alert">
            {restoreError}
          </div>
        )}

        <section className="shell-section" aria-labelledby="wizard-detection-title">
          <div className="shell-section-header">
            <h2 className="shell-section-title" id="wizard-detection-title">
              1. Detection Summary
            </h2>
          </div>
          <div className="shell-field">{project.path}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {project.detected_stacks.length === 0 ? (
              <div className="shell-field">No framework signals detected. Add the commands you need.</div>
            ) : (
              project.detected_stacks.map((signal) => (
                <div key={signal.stack} style={chipStyle}>
                  <span>{formatStackLabel(signal.stack)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="shell-section" aria-labelledby="wizard-commands-title">
          <div className="shell-section-header">
            <h2 className="shell-section-title" id="wizard-commands-title">
              2. Suggested Commands
            </h2>
            <span className="shell-subtitle" style={{ fontSize: 13 }}>
              {enabledCommands} enabled
            </span>
          </div>

          {wizardDraft.commands.map((command) => (
            <article
              key={command.id}
              data-testid={`wizard-command-${command.id}`}
              style={commandCardStyle}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <label style={toggleLabelStyle}>
                  <input
                    aria-label="Enable"
                    type="checkbox"
                    checked={command.enabled}
                    onChange={(event) => {
                      onUpdateCommand(command.id, { enabled: event.target.checked });
                    }}
                  />
                  <span>Enable</span>
                </label>
                <span style={sourceBadgeStyle}>{formatSourceLabel(command.source)}</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14,
                }}
              >
                <label style={inputLabelStyle}>
                  <span>Name</span>
                  <input
                    aria-label="Name"
                    className="shell-field"
                    value={command.name}
                    onChange={(event) => {
                      onUpdateCommand(command.id, { name: event.target.value });
                    }}
                  />
                </label>

                <label style={{ ...inputLabelStyle, gridColumn: "1 / -1" }}>
                  <span>Command</span>
                  <input
                    aria-label="Command"
                    className="shell-field"
                    value={command.cmd}
                    onChange={(event) => {
                      onUpdateCommand(command.id, { cmd: event.target.value });
                    }}
                  />
                </label>
              </div>

              <label style={toggleLabelStyle}>
                <input
                  aria-label="Autostart"
                  type="checkbox"
                  checked={command.autostart}
                  onChange={(event) => {
                    onUpdateCommand(command.id, { autostart: event.target.checked });
                  }}
                />
                <span>Autostart</span>
              </label>
            </article>
          ))}
        </section>

        <section className="shell-section" aria-labelledby="wizard-autostart-title">
          <div className="shell-section-header">
            <h2 className="shell-section-title" id="wizard-autostart-title">
              3. Autostart Plan
            </h2>
          </div>
          <div className="shell-field">
            {enabledCommands === 0
              ? "Enable at least one command before saving the config."
              : `${wizardDraft.commands.filter((command) => command.enabled && command.autostart).length} of ${enabledCommands} enabled commands will launch automatically.`}
          </div>
        </section>

        <section className="shell-section" aria-labelledby="wizard-preview-title">
          <div className="shell-section-header">
            <h2 className="shell-section-title" id="wizard-preview-title">
              4. YAML Preview
            </h2>
            <button
              type="button"
              className="shell-button"
              style={{ minHeight: 38, padding: "0 14px" }}
              onClick={() => {
                void onRefreshPreview();
              }}
            >
              Refresh Preview
            </button>
          </div>

          {wizardPreviewError && (
            <div className="shell-error-banner" role="alert">
              {wizardPreviewError}
            </div>
          )}

          {wizardPreviewDirty && !wizardPreviewPending && (
            <div className="shell-field">Preview is out of date. Refresh it before saving.</div>
          )}

          <pre data-testid="config-preview" style={previewPanelStyle}>
            {wizardPreviewPending
              ? "Generating preview..."
              : wizardPreview || "# Preview will appear here once maki can generate it."}
          </pre>
        </section>

        <section className="shell-section" aria-labelledby="wizard-save-title">
          <div className="shell-section-header">
            <h2 className="shell-section-title" id="wizard-save-title">
              5. Save And Launch
            </h2>
          </div>
          <div className="shell-actions">
            <button
              type="button"
              className="shell-button"
              disabled={enabledCommands === 0 || wizardSavePending}
              onClick={() => {
                void onSave();
              }}
            >
              {wizardSavePending ? "Saving..." : "Save Config"}
            </button>
            <button
              type="button"
              className="shell-button"
              style={{
                background: "rgba(49, 50, 68, 0.7)",
                color: "var(--shell-fg)",
                borderColor: "var(--shell-border)",
                boxShadow: "none",
              }}
              onClick={() => {
                void onOpenFolder();
              }}
            >
              Choose Another Folder
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
