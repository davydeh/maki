import type { ITheme } from "@xterm/xterm";

export interface Theme {
  name: string;
  bg: string;
  fg: string;
  tabBarBg: string;
  activeTabBg: string;
  activeTabFg: string;
  tabFg: string;
  statusBarBg: string;
  statusBarFg: string;
  running: string;
  errored: string;
  stopped: string;
  shell: string;
  accent: string;
  border: string;
  terminal: ITheme;
}

export const themes: Record<string, Theme> = {
  dark: {
    name: "dark",
    bg: "#1e1e2e",
    fg: "#cdd6f4",
    tabBarBg: "#181825",
    activeTabBg: "#313244",
    activeTabFg: "#cdd6f4",
    tabFg: "#6c7086",
    statusBarBg: "#181825",
    statusBarFg: "#6c7086",
    running: "#a6e3a1",
    errored: "#f38ba8",
    stopped: "#6c7086",
    shell: "#89b4fa",
    accent: "#89b4fa",
    border: "#313244",
    terminal: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "#45475a",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#cba6f7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#cba6f7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8",
    },
  },
  light: {
    name: "light",
    bg: "#eff1f5",
    fg: "#4c4f69",
    tabBarBg: "#e6e9ef",
    activeTabBg: "#ccd0da",
    activeTabFg: "#4c4f69",
    tabFg: "#7c7f93",
    statusBarBg: "#e6e9ef",
    statusBarFg: "#7c7f93",
    running: "#40a02b",
    errored: "#d20f39",
    stopped: "#7c7f93",
    shell: "#1e66f5",
    accent: "#1e66f5",
    border: "#ccd0da",
    terminal: {
      background: "#eff1f5",
      foreground: "#4c4f69",
      cursor: "#dc8a78",
      selectionBackground: "#acb0be",
      black: "#5c5f77",
      red: "#d20f39",
      green: "#40a02b",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      magenta: "#8839ef",
      cyan: "#179299",
      white: "#acb0be",
      brightBlack: "#6c6f85",
      brightRed: "#d20f39",
      brightGreen: "#40a02b",
      brightYellow: "#df8e1d",
      brightBlue: "#1e66f5",
      brightMagenta: "#8839ef",
      brightCyan: "#179299",
      brightWhite: "#bcc0cc",
    },
  },
  nord: {
    name: "nord",
    bg: "#2e3440",
    fg: "#d8dee9",
    tabBarBg: "#3b4252",
    activeTabBg: "#434c5e",
    activeTabFg: "#eceff4",
    tabFg: "#7b88a1",
    statusBarBg: "#3b4252",
    statusBarFg: "#7b88a1",
    running: "#a3be8c",
    errored: "#bf616a",
    stopped: "#7b88a1",
    shell: "#81a1c1",
    accent: "#81a1c1",
    border: "#434c5e",
    terminal: {
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      selectionBackground: "#434c5e",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
};

export function getTheme(name?: string): Theme {
  return themes[name || "dark"] || themes.dark;
}
