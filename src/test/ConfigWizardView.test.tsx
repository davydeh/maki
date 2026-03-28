import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigWizardView } from "../components/ConfigWizardView";
import { useWorkspaceSession } from "../hooks/useWorkspaceSession";
import type {
  DetectionSignal,
  ProjectInspection,
  ProjectWindowContext,
  RecentProject,
  WorkspaceAppState,
} from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

type CommandResponse = unknown | Error;

function createAppState(overrides: Partial<WorkspaceAppState> = {}): WorkspaceAppState {
  return {
    version: 1,
    last_project_path: "/projects/alpha",
    recent_projects: [createRecentProject()],
    ...overrides,
  };
}

function createRecentProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    name: "alpha",
    path: "/projects/alpha",
    ...overrides,
  };
}

function createDetectionSignals(): DetectionSignal[] {
  return [
    {
      stack: "node",
      package_json: "/projects/alpha/package.json",
      scripts: ["dev"],
    },
    {
      stack: "laravel",
      composer_json: "/projects/alpha/composer.json",
      artisan: true,
    },
    {
      stack: "python",
      pyproject_toml: "/projects/alpha/pyproject.toml",
      requirements_txt: "/projects/alpha/requirements.txt",
      entrypoints: ["main.py"],
    },
  ];
}

function createInspection(overrides: Partial<ProjectInspection> = {}): ProjectInspection {
  return {
    name: "alpha",
    path: "/projects/alpha",
    exists: true,
    has_config: false,
    detected_stacks: createDetectionSignals(),
    script_hints: ["npm run dev"],
    entrypoint_hints: ["php artisan serve", "python main.py"],
    ...overrides,
  };
}

function createCurrentWindow(
  overrides: Partial<ProjectWindowContext> = {}
): ProjectWindowContext {
  return {
    project_path: "/projects/alpha",
    window_label: "project-1",
    ...overrides,
  };
}

function mockInvoke(
  responses: Partial<Record<string, CommandResponse | CommandResponse[]>>
) {
  const queues = new Map(
    Object.entries(responses).map(([command, response]) => [
      command,
      Array.isArray(response) ? [...response] : [response],
    ])
  );

  invokeMock.mockImplementation(async (command) => {
    const queue = queues.get(command);
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected invoke(${command})`);
    }

    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }

    return next;
  });
}

function SessionWizardHarness() {
  const session = useWorkspaceSession();

  if (session.screen === "wizard" && session.project && session.wizardDraft) {
    return (
      <ConfigWizardView
        project={session.project}
        restoreError={session.restoreError}
        wizardDraft={session.wizardDraft}
        wizardPreview={session.wizardPreview}
        wizardPreviewError={session.wizardPreviewError}
        wizardPreviewPending={session.wizardPreviewPending}
        wizardPreviewDirty={session.wizardPreviewDirty}
        wizardSavePending={session.wizardSavePending}
        onAddCommand={session.addWizardCommand}
        onUpdateCommand={session.updateWizardCommand}
        onRefreshPreview={session.refreshWizardPreview}
        onSave={session.saveWizardConfig}
        onOpenFolder={session.openFolder}
      />
    );
  }

  return <div data-testid="session-screen">{session.screen}</div>;
}

describe("ConfigWizardView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("renders detected command suggestions with editable fields", async () => {
    mockInvoke({
      load_app_state: createAppState(),
      inspect_project_folder: createInspection(),
      save_app_state: createAppState(),
      generate_config_preview: "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n",
    });

    render(<SessionWizardHarness />);

    const firstCommand = await screen.findByTestId("wizard-command-detected-0");

    // Click the collapsed row content to expand
    fireEvent.click(within(firstCommand).getByText("dev"));

    expect(within(firstCommand).getByLabelText("Name")).toHaveValue("dev");
    expect(within(firstCommand).getByLabelText("Command")).toHaveValue("npm run dev");
  });

  it("disables save when no commands are enabled", async () => {
    mockInvoke({
      load_app_state: createAppState(),
      inspect_project_folder: createInspection(),
      save_app_state: createAppState(),
      generate_config_preview: "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n",
    });

    render(<SessionWizardHarness />);

    const rows = [
      await screen.findByTestId("wizard-command-detected-0"),
      screen.getByTestId("wizard-command-detected-1"),
      screen.getByTestId("wizard-command-detected-2"),
    ];

    for (const row of rows) {
      fireEvent.click(within(row).getByLabelText("Enable"));
    }

    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("allows manually adding a command when detection finds nothing", async () => {
    const emptyInspection = createInspection({
      detected_stacks: [],
      script_hints: [],
      entrypoint_hints: [],
    });

    mockInvoke({
      load_app_state: createAppState(),
      inspect_project_folder: emptyInspection,
      save_app_state: createAppState(),
      generate_config_preview: [
        new Error("Config must include at least one enabled command"),
        "name: alpha\nprocesses:\n  - name: worker\n    cmd: npm run worker\n    autostart: true\n",
      ],
    });

    render(<SessionWizardHarness />);

    expect(await screen.findByRole("button", { name: /add command/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add command/i }));

    const manualRow = await screen.findByTestId("wizard-command-manual-0");
    fireEvent.change(within(manualRow).getByLabelText("Name"), {
      target: { value: "worker" },
    });
    fireEvent.change(within(manualRow).getByLabelText("Command"), {
      target: { value: "npm run worker" },
    });

    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("submits save and calls launch transition on success", async () => {
    const missingConfigInspection = createInspection();
    const savedInspection = createInspection({ has_config: true });

    mockInvoke({
      load_app_state: createAppState(),
      inspect_project_folder: [missingConfigInspection, savedInspection],
      save_app_state: [createAppState(), createAppState()],
      generate_config_preview: [
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
        "name: alpha\nprocesses:\n  - name: web\n    cmd: npm run dev\n    autostart: true\n",
      ],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: createCurrentWindow(),
    });

    render(<SessionWizardHarness />);

    const firstCommand = await screen.findByTestId("wizard-command-detected-0");
    // Click to expand, then edit
    fireEvent.click(within(firstCommand).getByText("dev"));
    fireEvent.change(within(firstCommand).getByLabelText("Name"), {
      target: { value: "web" },
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("session-screen")).toHaveTextContent("workspace");
    });

    expect(invokeMock).toHaveBeenCalledWith("save_config", {
      request: expect.objectContaining({
        project_path: "/projects/alpha",
        draft: expect.objectContaining({
          commands: expect.arrayContaining([
            expect.objectContaining({
              name: "web",
              cmd: "npm run dev",
            }),
          ]),
        }),
      }),
    });
  });

  it("calls the native save command before transitioning into workspace state", async () => {
    const missingConfigInspection = createInspection();
    const savedInspection = createInspection({ has_config: true });

    mockInvoke({
      load_app_state: createAppState(),
      inspect_project_folder: [missingConfigInspection, savedInspection],
      save_app_state: [createAppState(), createAppState()],
      generate_config_preview: [
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
      ],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: createCurrentWindow(),
    });

    render(<SessionWizardHarness />);

    // Wait for auto-preview, then save
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByTestId("session-screen")).toHaveTextContent("workspace");
    });

    const commandSequence = invokeMock.mock.calls.map(([command]) => command);
    const saveConfigIndex = commandSequence.indexOf("save_config");
    const bindIndex = commandSequence.indexOf("bind_current_project_window");
    const transitionSaveIndex = commandSequence.lastIndexOf("save_app_state");

    expect(saveConfigIndex).toBeGreaterThan(-1);
    expect(bindIndex).toBeGreaterThan(-1);
    expect(transitionSaveIndex).toBeGreaterThan(-1);
    expect(saveConfigIndex).toBeLessThan(bindIndex);
    expect(saveConfigIndex).toBeLessThan(transitionSaveIndex);
  });
});
