export interface MakiConfig {
  name: string;
  theme?: string;
  processes: ProcessConfig[];
  shells: ShellConfig[];
}

export interface RecentProject {
  name: string;
  path: string;
}

export interface WorkspaceAppState {
  version: number;
  last_project_path: string | null;
  recent_projects: RecentProject[];
}

export type DetectionSignal =
  | {
      stack: "node";
      package_json?: string | null;
      scripts: string[];
    }
  | {
      stack: "laravel";
      composer_json?: string | null;
      artisan: boolean;
    }
  | {
      stack: "python";
      pyproject_toml?: string | null;
      requirements_txt?: string | null;
      entrypoints: string[];
    };

export interface ProjectInspection {
  name: string;
  path: string;
  exists: boolean;
  has_config: boolean;
  detected_stacks: DetectionSignal[];
  script_hints: string[];
  entrypoint_hints: string[];
}

export interface DetectedCommand {
  id: string;
  name: string;
  cmd: string;
  enabled: boolean;
  autostart: boolean;
  source: "detected" | "manual";
}

export interface WizardDraft {
  project_name: string;
  theme?: string;
  commands: DetectedCommand[];
}

export type AppScreen = "booting" | "picker" | "wizard" | "workspace" | "invalid";

export interface ProjectWindowContext {
  project_path: string;
  window_label: string;
}

export interface ProjectWindowOpenResult {
  project_path: string;
  window_label: string;
  created: boolean;
}

export interface ProcessConfig {
  name: string;
  cmd: string;
  autostart: boolean;
  cwd?: string;
  env?: Record<string, string>;
  restart?: string;
  max_restarts?: number;
  restart_delay?: number;
}

export interface ShellConfig {
  name: string;
  cmd?: string;
}

export type TabType = "process" | "shell";
export type TabStatus = "running" | "stopped" | "errored";

export interface Tab {
  id: string;
  name: string;
  type: TabType;
  cmd: string;
  args: string[];
  status: TabStatus;
  exitCode?: number;
  autostart: boolean;
  sessionId?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface GitStatus {
  branch: string;
  dirty: boolean;
  is_repo: boolean;
}
