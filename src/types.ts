export interface MakiConfig {
  name: string;
  theme?: string;
  processes: ProcessConfig[];
  shells: ShellConfig[];
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
