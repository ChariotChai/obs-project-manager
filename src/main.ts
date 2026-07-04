import { Plugin, WorkspaceLeaf } from "obsidian";
import { PM_VIEW_TYPE, ProjectManagerView } from "./view";
import { PmStore } from "./store";
import type { PmSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { PmSettingTab } from "./settings";

export default class PmProjectManager extends Plugin {
  settings!: PmSettings;
  store!: PmStore;

  async onload() {
    await this.loadSettings();

    this.store = new PmStore(this.app, this.settings);

    this.registerView(PM_VIEW_TYPE, (leaf) => new ProjectManagerView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Open Project Manager", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-project-manager",
      name: "Open Project Manager",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new PmSettingTab(this.app, this));

    // React to vault changes that may affect the model.
    const refresh = () => {
      this.store.refreshSolutions();
    };
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.store.scheduleReload()));

    this.app.workspace.onLayoutReady(() => {
      this.activateView();
    });
  }

  async onunload() {}

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(PM_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: PM_VIEW_TYPE, active: true });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.store.setSettings(this.settings);
    await this.store.refreshSolutions();
  }
}
