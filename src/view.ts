import { ItemView, WorkspaceLeaf } from "obsidian";
import type PmProjectManager from "./main";
import { PmView } from "./ui/mount";

export const PM_VIEW_TYPE = "project-manager-view";

export class ProjectManagerView extends ItemView {
  private pmView?: PmView;

  constructor(leaf: WorkspaceLeaf, private plugin: PmProjectManager) {
    super(leaf);
  }

  getViewType() {
    return PM_VIEW_TYPE;
  }

  getDisplayText() {
    return "Project Manager";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("pm-root");
    this.pmView = new PmView(this.contentEl, this.plugin.store);
    this.pmView.mount();
    await this.plugin.store.refreshSolutions();
  }

  async onClose() {
    this.pmView?.destroy();
  }
}
