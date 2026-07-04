<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./components/Modal.svelte";
  import type PmStore from "../store";
  import type {
    Project,
    Target,
    Task,
    Requirement,
    ProjectStatus,
    TargetStatus,
    TaskStatus,
    Priority,
    RequirementStatus,
    JiraRef,
  } from "../types";
  import {
    PROJECT_STATUSES,
    TARGET_STATUSES,
    TASK_STATUSES,
    PRIORITIES,
    REQUIREMENT_STATUSES,
    statusLabel,
    priorityLabel,
  } from "../constants";

  const dispatch = createEventDispatcher();

  export let store: PmStore;
  export let mode: "create" | "edit";
  export let kind: "project" | "target" | "task" | "requirement";
  export let entity: Project | Target | Task | Requirement | null;
  /** For create: parent context. */
  export let projectId: string | undefined;
  export let targetId: string | undefined;

  // Form state
  let name = "";
  let owner = "";
  let status: ProjectStatus | TargetStatus | TaskStatus | RequirementStatus = "planning";
  let priority: Priority = "medium";
  let startDate = "";
  let endDate = "";
  let dueDate = "";
  let description = "";
  let source = "";
  let members = "";
  let jiraKeys = "";
  let deps: string[] = [];
  let reqStatus: RequirementStatus = "pool";

  const model = store.model;

  $: projectTargets = $model.targets.filter((t) => t.projectId === projectId);

  // initialize from entity when editing
  $: if (entity && mode === "edit") initFromEntity(entity);

  function initFromEntity(e: any) {
    name = e.name ?? e.title ?? "";
    owner = e.owner ?? "";
    status = e.status ?? "planning";
    priority = e.priority ?? "medium";
    startDate = e.startDate ?? "";
    endDate = e.endDate ?? "";
    dueDate = e.dueDate ?? "";
    description = e.description ?? "";
    source = e.source ?? "";
    members = (e.members ?? []).join(", ");
    jiraKeys = (e.jiraEpics ?? e.jiraStories ?? []).map((j: JiraRef) => j.key).join(", ");
    deps = e.dependencies ? [...e.dependencies] : [];
    reqStatus = e.status === "pool" || e.status === "triaged" || e.status === "held" ? e.status : "pool";
  }

  function parseJira(s: string): JiraRef[] {
    return s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((k) => ({ key: k }));
  }

  let saving = false;
  async function save() {
    if (!name.trim()) return;
    saving = true;
    try {
      if (kind === "project") {
        const payload: any = {
          name: name.trim(),
          owner: owner.trim() || undefined,
          status,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          description: description.trim() || undefined,
        };
        if (mode === "create") await store.createProject(payload);
        else await store.updateProject((entity as Project).id, { ...payload, members: members.split(",").map((m) => m.trim()).filter(Boolean), jiraEpics: parseJira(jiraKeys) });
      } else if (kind === "target") {
        const payload: any = {
          name: name.trim(),
          owner: owner.trim() || undefined,
          status: status as TargetStatus,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          description: description.trim() || undefined,
          dependencies: deps,
        };
        if (mode === "create" && projectId) await store.createTarget({ projectId, ...payload });
        else await store.updateTarget((entity as Target).id, payload);
      } else if (kind === "task") {
        const payload: any = {
          name: name.trim(),
          owner: owner.trim() || undefined,
          status: status as TaskStatus,
          dueDate: dueDate || undefined,
          priority,
          description: description.trim() || undefined,
        };
        if (mode === "create" && targetId) await store.createTask({ targetId, ...payload });
        else await store.updateTask((entity as Task).id, { ...payload, jiraStories: parseJira(jiraKeys) });
      } else if (kind === "requirement") {
        const payload: any = {
          title: name.trim(),
          source: source.trim() || undefined,
          priority,
          status: reqStatus,
          description: description.trim() || undefined,
        };
        if (mode === "create") await store.createRequirement(payload);
        else await store.updateRequirement((entity as Requirement).id, payload);
      }
      dispatch("close");
    } finally {
      saving = false;
    }
  }

  $: titleText = `${mode === "create" ? "New" : "Edit"} ${kind[0].toUpperCase() + kind.slice(1)}`;
  $: statuses =
    kind === "project" ? PROJECT_STATUSES : kind === "target" ? TARGET_STATUSES : kind === "task" ? TASK_STATUSES : [];
</script>

<Modal {titleText} width={560} on:close={() => dispatch("close")}>
  <div class="grid">
    <label class="field full">
      <span>{kind === "requirement" ? "Title" : "Name"}</span>
      <input bind:value={name} placeholder={kind === "requirement" ? "Requirement title" : "Name"} />
    </label>

    {#if kind !== "requirement"}
      <label class="field">
        <span>Owner</span>
        <input bind:value={owner} placeholder="Owner name" />
      </label>
      <label class="field">
        <span>Status</span>
        <select bind:value={status}>
          {#each statuses as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if kind === "project" || kind === "target"}
      <label class="field">
        <span>Start date</span>
        <input type="date" bind:value={startDate} />
      </label>
      <label class="field">
        <span>End date</span>
        <input type="date" bind:value={endDate} />
      </label>
    {/if}

    {#if kind === "task"}
      <label class="field">
        <span>Due date</span>
        <input type="date" bind:value={dueDate} />
      </label>
      <label class="field">
        <span>Priority</span>
        <select bind:value={priority}>
          {#each PRIORITIES as p}
            <option value={p}>{priorityLabel(p)}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if kind === "requirement"}
      <label class="field">
        <span>Source</span>
        <input bind:value={source} placeholder="Who raised it" />
      </label>
      <label class="field">
        <span>Priority</span>
        <select bind:value={priority}>
          {#each PRIORITIES as p}
            <option value={p}>{priorityLabel(p)}</option>
          {/each}
        </select>
      </label>
      <label class="field full">
        <span>Status</span>
        <select bind:value={reqStatus}>
          {#each REQUIREMENT_STATUSES as s}
            <option value={s}>{statusLabel(s)}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if kind === "target"}
      <div class="field full">
        <span>Dependencies</span>
        <div class="deps">
          {#if projectTargets.length === 0}
            <p class="muted">No other targets in this project yet.</p>
          {/if}
          {#each projectTargets as t (t.id)}
            {#if entity?.id !== t.id}
              <label class="check">
                <input type="checkbox" value={t.id} bind:group={deps} />
                <span>{t.name}</span>
              </label>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if kind === "project" && mode === "edit"}
      <label class="field full">
        <span>Members (comma separated)</span>
        <input bind:value={members} placeholder="Alice, Bob" />
      </label>
      <label class="field full">
        <span>Jira epics (keys, comma separated)</span>
        <input bind:value={jiraKeys} placeholder="ENG-100, ENG-101" />
      </label>
    {/if}

    {#if kind === "task" && mode === "edit"}
      <label class="field full">
        <span>Jira stories (keys, comma separated)</span>
        <input bind:value={jiraKeys} placeholder="ENG-200, ENG-201" />
      </label>
    {/if}

    <label class="field full">
      <span>Description</span>
      <textarea bind:value={description} rows="3" placeholder="Notes…"></textarea>
    </label>
  </div>

  <svelte:fragment slot="footer">
    <button class="btn ghost" on:click={() => dispatch("close")}>Cancel</button>
    <button class="btn primary" on:click={save} disabled={saving || !name.trim()}>
      {saving ? "Saving…" : "Save"}
    </button>
  </svelte:fragment>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--pm-muted, #8e8e93);
    font-weight: 500;
  }
  .full {
    grid-column: 1 / -1;
  }
  .field :global(input),
  .field :global(textarea),
  .field :global(select) {
    font: inherit;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
    padding: 8px 10px;
    border: 1px solid var(--pm-border, rgba(0, 0, 0, 0.1));
    border-radius: 9px;
    background: var(--pm-input, #fff);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field :global(input:focus),
  .field :global(textarea:focus),
  .field :global(select:focus) {
    border-color: #007aff;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
  }
  .deps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--pm-text, #1d1d1f);
    font-weight: 400;
    cursor: pointer;
  }
  .muted {
    color: var(--pm-muted, #8e8e93);
    font-size: 12px;
    margin: 0;
  }
</style>
