import { App, PluginSettingTab, Setting } from "obsidian";
import type PmProjectManager from "./main";

export class PmSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PmProjectManager) {
    super(app, plugin);
  }

  display(): void {
    const contentEl = this.containerEl;
    contentEl.empty();

    new Setting(contentEl)
      .setName("Solutions folder")
      .setDesc("Folder in the vault that contains one sub-folder per solution.")
      .addText((text) =>
        text
          .setPlaceholder("Solutions")
          .setValue(this.plugin.settings.solutionsFolder)
          .onChange(async (value) => {
            this.plugin.settings.solutionsFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(contentEl)
      .setName("Jira base URL")
      .setDesc("Optional. Used to make Jira issue keys clickable (e.g. https://yourorg.atlassian.net).")
      .addText((text) =>
        text
          .setPlaceholder("https://yourorg.atlassian.net")
          .setValue(this.plugin.settings.jiraBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.jiraBaseUrl = value.replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(contentEl)
      .setName("Initialize demo solution")
      .setDesc("Create a default solution with sample projects/targets/tasks to explore the UI.")
      .addButton((btn) =>
        btn.setButtonText("Create demo").onClick(async () => {
          await this.plugin.store.ensureDefaultSolution();
          await this.plugin.store.refreshSolutions();
        })
      );
  }
}
