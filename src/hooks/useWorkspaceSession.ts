import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppScreen,
  DetectedCommand,
  ProjectInspection,
  ProjectWindowContext,
  ProjectWindowOpenResult,
  RecentProject,
  WizardDraft,
  WorkspaceAppState,
} from "../types";

const DEFAULT_APP_STATE: WorkspaceAppState = {
  version: 1,
  last_project_path: null,
  recent_projects: [],
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAppState(state: WorkspaceAppState | null | undefined): WorkspaceAppState {
  if (!state) {
    return DEFAULT_APP_STATE;
  }

  return {
    version: state.version ?? DEFAULT_APP_STATE.version,
    last_project_path: state.last_project_path ?? null,
    recent_projects: state.recent_projects ?? [],
  };
}

function buildRecentProjects(
  currentRecents: RecentProject[],
  project: Pick<ProjectInspection, "name" | "path">
): RecentProject[] {
  const nextRecent: RecentProject = {
    name: project.name,
    path: project.path,
  };

  return [
    nextRecent,
    ...currentRecents.filter((recent) => recent.path !== project.path),
  ];
}

function createAppStateUpdate(
  currentState: WorkspaceAppState,
  project: Pick<ProjectInspection, "name" | "path">
): WorkspaceAppState {
  return {
    ...currentState,
    last_project_path: project.path,
    recent_projects: buildRecentProjects(currentState.recent_projects, project),
  };
}

function buildWizardDraft(inspection: ProjectInspection): WizardDraft {
  const commands = [...inspection.script_hints, ...inspection.entrypoint_hints].map(
    (command, index): DetectedCommand => ({
      id: `detected-${index}`,
      name: command,
      cmd: command,
      enabled: true,
      autostart: true,
      source: "detected",
    })
  );

  return {
    project_name: inspection.name,
    commands,
  };
}

function toSaveConfigRequest(projectPath: string, draft: WizardDraft) {
  return {
    request: {
      project_path: projectPath,
      draft: {
        project_name: draft.project_name,
        theme: draft.theme,
        commands: draft.commands.map((command) => ({
          name: command.name,
          cmd: command.cmd,
          enabled: command.enabled,
          autostart: command.autostart,
        })),
      },
    },
  };
}

export interface WorkspaceSessionState {
  screen: AppScreen;
  appState: WorkspaceAppState;
  project: ProjectInspection | null;
  restoreError: string | null;
  wizardDraft: WizardDraft | null;
  openFolder: () => Promise<void>;
  openRecentProject: (project: RecentProject) => Promise<void>;
  saveWizardConfig: (draft?: WizardDraft) => Promise<void>;
}

export function useWorkspaceSession(): WorkspaceSessionState {
  const [screen, setScreen] = useState<AppScreen>("booting");
  const [appState, setAppState] = useState<WorkspaceAppState>(DEFAULT_APP_STATE);
  const [project, setProject] = useState<ProjectInspection | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft | null>(null);

  const persistAppState = useCallback(
    async (baseState: WorkspaceAppState, inspection: ProjectInspection) => {
      const nextState = createAppStateUpdate(baseState, inspection);
      const savedState = normalizeAppState(
        await invoke<WorkspaceAppState>("save_app_state", {
          state: nextState,
        })
      );

      setAppState(savedState);
      return savedState;
    },
    []
  );

  const routeToProjectWindow = useCallback(async (projectPath: string) => {
    return invoke<ProjectWindowOpenResult>("open_project_window", {
      projectPath,
    });
  }, []);

  const bindCurrentProjectWindow = useCallback(async (projectPath: string) => {
    return invoke<ProjectWindowContext>("bind_current_project_window", {
      projectPath,
    });
  }, []);

  const inspectProject = useCallback(async (path: string) => {
    return invoke<ProjectInspection>("inspect_project_folder", { path });
  }, []);

  const enterWorkspaceLocally = useCallback(
    async (baseState: WorkspaceAppState, inspection: ProjectInspection) => {
      setProject(inspection);
      setWizardDraft(null);
      setRestoreError(null);
      await bindCurrentProjectWindow(inspection.path);
      await persistAppState(baseState, inspection);
      setScreen("workspace");
    },
    [bindCurrentProjectWindow, persistAppState]
  );

  const openProject = useCallback(
    async (path: string) => {
      try {
        const inspection = await inspectProject(path);

        if (!inspection.exists) {
          setProject(null);
          setWizardDraft(null);
          setRestoreError(`Project folder ${inspection.path} does not exist`);
          setScreen("invalid");
          return;
        }

        if (!project || project.path !== inspection.path) {
          await routeToProjectWindow(inspection.path);
          await persistAppState(appState, inspection);
          setRestoreError(null);
          return;
        }

        setRestoreError(null);

        if (inspection.has_config) {
          await enterWorkspaceLocally(appState, inspection);
          return;
        }

        setProject(inspection);
        setWizardDraft(buildWizardDraft(inspection));
        setScreen("wizard");
      } catch (error) {
        setRestoreError(toErrorMessage(error));
      }
    },
    [appState, enterWorkspaceLocally, inspectProject, persistAppState, project, routeToProjectWindow]
  );

  const openFolder = useCallback(async () => {
    const selectedPath = await invoke<string | null>("open_folder_dialog");
    if (!selectedPath) {
      return;
    }

    await openProject(selectedPath);
  }, [openProject]);

  const openRecentProject = useCallback(
    async (recentProject: RecentProject) => {
      await openProject(recentProject.path);
    },
    [openProject]
  );

  const saveWizardConfig = useCallback(
    async (draftOverride?: WizardDraft) => {
      if (!project) {
        return;
      }

      const draftToSave = draftOverride ?? wizardDraft;
      if (!draftToSave) {
        return;
      }

      await invoke<string>("save_config", toSaveConfigRequest(project.path, draftToSave));

      const refreshedInspection = await inspectProject(project.path);
      setProject(refreshedInspection);

      if (!refreshedInspection.has_config) {
        setWizardDraft(draftToSave);
        setScreen("wizard");
        return;
      }

      await enterWorkspaceLocally(appState, refreshedInspection);
    },
    [appState, enterWorkspaceLocally, inspectProject, project, wizardDraft]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let loadedState = DEFAULT_APP_STATE;

      try {
        loadedState = normalizeAppState(await invoke<WorkspaceAppState>("load_app_state"));

        if (cancelled) {
          return;
        }

        setAppState(loadedState);

        if (!loadedState.last_project_path) {
          setScreen("picker");
          return;
        }

        const inspection = await inspectProject(loadedState.last_project_path);

        if (cancelled) {
          return;
        }

        if (!inspection.exists) {
          setRestoreError(`Project folder ${inspection.path} does not exist`);
          setScreen("invalid");
          return;
        }

        if (!inspection.has_config) {
          setProject(inspection);
          setWizardDraft(buildWizardDraft(inspection));
          setRestoreError(null);
          setScreen("wizard");
          return;
        }

        let currentWindow: ProjectWindowContext | null = null;

        try {
          currentWindow = await invoke<ProjectWindowContext>("get_current_project_window");
        } catch {
          currentWindow = null;
        }

        if (cancelled) {
          return;
        }

        if (currentWindow && currentWindow.project_path !== inspection.path) {
          await routeToProjectWindow(inspection.path);
          return;
        }

        await enterWorkspaceLocally(loadedState, inspection);

        if (cancelled) {
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setProject(null);
        setWizardDraft(null);
        setRestoreError(toErrorMessage(error));
        setAppState(loadedState);
        setScreen("invalid");
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [enterWorkspaceLocally, inspectProject, routeToProjectWindow]);

  return {
    screen,
    appState,
    project,
    restoreError,
    wizardDraft,
    openFolder,
    openRecentProject,
    saveWizardConfig,
  };
}
