import { describe, expect, it } from "vitest";
import { activateTab, createTabsFromConfig } from "../workspaceTabs";
import type { MakiConfig, Tab } from "../types";

function createConfig(overrides: Partial<MakiConfig> = {}): MakiConfig {
  return {
    name: "alpha",
    theme: "dark",
    processes: [
      {
        name: "web",
        cmd: "npm run dev",
        autostart: true,
      },
    ],
    shells: [
      {
        name: "shell",
      },
    ],
    ...overrides,
  };
}

describe("createTabsFromConfig", () => {
  it("starts only the first shell eagerly while preserving autostart processes", () => {
    const tabs = createTabsFromConfig(
      createConfig({
        shells: [
          { name: "shell" },
          { name: "shell 2" },
        ],
      }),
      "/projects/alpha"
    );

    expect(tabs[0]).toMatchObject({
      type: "shell",
      name: "shell",
      autostart: true,
    });
    expect(tabs[1]).toMatchObject({
      type: "shell",
      name: "shell 2",
      autostart: false,
    });
    expect(tabs[2]).toMatchObject({
      type: "process",
      name: "web",
      autostart: true,
    });
  });
});

describe("activateTab", () => {
  it("starts a lazy shell the first time it is focused", () => {
    const tabs = createTabsFromConfig(
      createConfig({
        shells: [
          { name: "shell" },
          { name: "shell 2" },
        ],
      }),
      "/projects/alpha"
    );

    const activated = activateTab(tabs, tabs[1].id);

    expect(activated[1]).toMatchObject({
      id: tabs[1].id,
      type: "shell",
      autostart: true,
    });
  });

  it("does not change process tabs when focused", () => {
    const tabs = createTabsFromConfig(createConfig(), "/projects/alpha");
    const processTab = tabs.find((tab) => tab.type === "process") as Tab;

    const activated = activateTab(tabs, processTab.id);

    expect(activated).toEqual(tabs);
  });
});
