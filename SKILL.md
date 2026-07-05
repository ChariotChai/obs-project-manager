# Project Manager Plugin Skill

## Overview

This skill provides AI agents with the ability to interact with the Project Manager plugin for Obsidian. The plugin manages a hierarchy of entities: Solution → Project → Target → Task, plus a Requirement pool.

## Entity Hierarchy

```
Solution (root)
  └── Project
        └── Target
              └── Task

Solution also contains a Requirement pool
```

## Core Operations

### 1. Solution Management

**Create Solution:**
```typescript
store.openEditor({
  mode: "create",
  kind: "solution",
  entity: null
});
```

**Edit Solution:**
```typescript
store.openEditor({
  mode: "edit",
  kind: "solution",
  entity: solutionEntity
});
```

**Update Solution:**
```typescript
await store.updateSolution({
  name: "Solution Name",
  description: "Description",
  members: ["Member 1", "Member 2"],
  statusConfig: { project: [...], target: [...], task: [...] }
});
```

### 2. Project Management

**Create Project:**
```typescript
await store.createProject({
  name: "Project Name",
  owner: "Owner Name",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  status: "planning" | "active" | "on-hold" | "completed" | "cancelled",
  description: "Project description"
});
```

**Edit Project:**
```typescript
store.openEditor({
  mode: "edit",
  kind: "project",
  entity: projectEntity
});
```

**Update Project:**
```typescript
await store.updateProject(projectId, {
  name: "New Name",
  owner: "New Owner",
  status: "active",
  startDate: "2024-02-01",
  endDate: "2024-11-30",
  description: "Updated description"
});
```

**Delete Project:**
```typescript
await store.deleteProject(projectId);
```

**Select Project:**
```typescript
store.select("project", projectId);
```

### 3. Target Management

**Create Target:**
```typescript
await store.createTarget({
  projectId: "project-id",
  name: "Target Name",
  owner: "Owner Name",
  startDate: "2024-01-15",
  endDate: "2024-06-30",
  status: "planning" | "in-progress" | "blocked" | "done" | "cancelled",
  description: "Target description",
  dependencies: ["target-id-1", "target-id-2"]
});
```

**Edit Target:**
```typescript
store.openEditor({
  mode: "edit",
  kind: "target",
  entity: targetEntity,
  projectId: projectId
});
```

**Update Target:**
```typescript
await store.updateTarget(targetId, {
  name: "New Name",
  owner: "New Owner",
  status: "in-progress",
  dependencies: ["target-id-1"]
});
```

**Delete Target:**
```typescript
await store.deleteTarget(targetId);
```

**Select Target:**
```typescript
store.select("target", targetId);
```

**Add Dependency:**
```typescript
const target = model.targets.find(t => t.id === targetId);
if (target) {
  await store.updateTarget(targetId, {
    dependencies: [...target.dependencies, dependencyId]
  });
}
```

### 4. Task Management

**Create Task:**
```typescript
await store.createTask({
  targetId: "target-id",
  name: "Task Name",
  owner: "Owner Name",
  status: "todo" | "in-progress" | "blocked" | "done" | "cancelled",
  dueDate: "2024-03-15",
  priority: "low" | "medium" | "high" | "urgent",
  description: "Task description"
});
```

**Edit Task:**
```typescript
store.openEditor({
  mode: "edit",
  kind: "task",
  entity: taskEntity,
  projectId: projectId,
  targetId: targetId
});
```

**Update Task:**
```typescript
await store.updateTask(taskId, {
  name: "New Name",
  owner: "New Owner",
  status: "in-progress",
  priority: "high",
  dueDate: "2024-03-20"
});
```

**Delete Task:**
```typescript
await store.deleteTask(taskId);
```

**Select Task:**
```typescript
store.select("task", taskId);
```

**Mark Task Done:**
```typescript
await store.updateTask(taskId, { status: "done" });
```

### 5. Requirement Management

**Create Requirement:**
```typescript
await store.createRequirement({
  title: "Requirement title",
  description: "Requirement description",
  source: "Source name",
  priority: "low" | "medium" | "high" | "urgent"
});
```

**Edit Requirement:**
```typescript
store.openEditor({
  mode: "edit",
  kind: "requirement",
  entity: requirementEntity
});
```

**Update Requirement:**
```typescript
await store.updateRequirement(requirementId, {
  title: "New Title",
  priority: "high",
  status: "triaged",
  assignedProjectId: "project-id"
});
```

**Delete Requirement:**
```typescript
await store.deleteRequirement(requirementId);
```

**Triage Requirement:**
```typescript
await store.triageRequirement(requirementId, projectId, "triaged");
```

**Select Requirement:**
```typescript
store.select("requirement", requirementId);
```

## Query System

The plugin supports a query language for filtering and grouping entities:

### Query Syntax

```
FROM task|target|project|requirement
WHERE field op value (AND field op value ...)
GROUP BY field
SORT field ASC|DESC
VIEW table|list|kanban|pie|donut|bar|metric|progress|timeline
LIMIT n
```

### Operators

- `=` - equals
- `!=` - not equals
- `>` - greater than
- `<` - less than
- `>=` - greater than or equal
- `<=` - less than or equal
- `contains` - contains substring
- `starts` - starts with

### Examples

```
FROM task
WHERE status = done

FROM task
WHERE priority = high AND status != done
GROUP BY status

FROM project
SORT startDate ASC

FROM requirement
WHERE status = pool
LIMIT 10
```

## Dashboard Widgets

### Add Widget
```typescript
store.addWidget(boardId, {
  title: "Widget Title",
  queryText: "FROM task WHERE status = done",
  view: "metric" | "table" | "list" | "kanban" | "pie" | "donut" | "bar" | "progress" | "timeline",
  size: "small" | "medium" | "large" | "full",
  groupBy: "status"
});
```

### Update Widget
```typescript
store.updateWidget(boardId, widgetId, {
  title: "New Title",
  queryText: "FROM task WHERE status = in-progress"
});
```

### Remove Widget
```typescript
store.removeWidget(boardId, widgetId);
```

## Store Methods Reference

### Model Management
- `store.refreshSolutions()` - Refresh solution list
- `store.setActiveSolution(slug)` - Switch active solution
- `store.reload()` - Reload current solution data
- `store.scheduleReload()` - Debounced reload

### Selection
- `store.select(kind, id)` - Select an entity
- `store.setTab(tab)` - Set active tab ("query" or "requirements")

### Boards
- `store.openBoard(id)` - Open a dashboard board
- `store.addBoard(name)` - Create new board
- `store.removeBoard(id)` - Delete board
- `store.updateBoard(id, patch)` - Update board properties

### Navigation
- `store.openEntity(kind, id)` - Open entity file in Obsidian
- `store.openEditor(state)` - Open entity editor modal
- `store.closeEditor()` - Close editor modal

## Data Structure Reference

### Solution
```typescript
{
  id: string;
  kind: "solution";
  name: string;
  path: string;
  members: string[];
  statusConfig?: StatusConfig;
  createdAt: number;
  updatedAt: number;
  description?: string;
}
```

### Project
```typescript
{
  id: string;
  kind: "project";
  name: string;
  solutionId: string;
  owner?: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  color?: string;
  members: string[];
  jiraEpics: JiraRef[];
}
```

### Target
```typescript
{
  id: string;
  kind: "target";
  name: string;
  projectId: string;
  solutionId: string;
  owner?: string;
  startDate?: string;
  endDate?: string;
  status: TargetStatus;
  dependencies: string[];
  color?: string;
}
```

### Task
```typescript
{
  id: string;
  kind: "task";
  name: string;
  targetId: string;
  projectId: string;
  solutionId: string;
  owner?: string;
  status: TaskStatus;
  dueDate?: string;
  priority: Priority;
  estimate?: number;
  jiraStories: JiraRef[];
}
```

### Requirement
```typescript
{
  id: string;
  kind: "requirement";
  title: string;
  solutionId: string;
  source?: string;
  status: RequirementStatus;
  assignedProjectId?: string;
  priority: Priority;
  tags: string[];
}
```

## Usage Examples

### Example 1: Create a project with targets and tasks
```typescript
const project = await store.createProject({
  name: "Website Redesign",
  owner: "John",
  startDate: "2024-01-01",
  endDate: "2024-06-30",
  status: "active"
});

if (project) {
  const target = await store.createTarget({
    projectId: project.id,
    name: "Design Phase",
    startDate: "2024-01-01",
    endDate: "2024-02-28",
    status: "in-progress"
  });

  if (target) {
    await store.createTask({
      targetId: target.id,
      name: "Create wireframes",
      owner: "Jane",
      priority: "high",
      dueDate: "2024-01-15"
    });
  }
}
```

### Example 2: Triage requirements to a project
```typescript
const req = await store.createRequirement({
  title: "Mobile responsive design",
  source: "Client feedback",
  priority: "high"
});

if (req) {
  await store.triageRequirement(req.id, projectId, "triaged");
}
```

### Example 3: Add dependencies between targets
```typescript
const targetA = await store.createTarget({
  projectId: projectId,
  name: "Backend API",
  status: "in-progress"
});

const targetB = await store.createTarget({
  projectId: projectId,
  name: "Frontend Integration",
  status: "planning",
  dependencies: [targetA.id]
});
```

## Best Practices

1. **Always check for null/undefined** when working with store methods that may return null
2. **Use the editor modal** for user-facing create/edit operations instead of direct API calls
3. **Select entities** after creating them to show details to the user
4. **Handle errors** gracefully - store operations can throw exceptions
5. **Use debounced reload** (`scheduleReload`) when making multiple rapid changes

## Error Handling

Most store methods return `null` if the operation fails (e.g., invalid projectId). For update/delete operations, wrap calls in try-catch blocks:

```typescript
try {
  await store.updateTask(taskId, { status: "done" });
} catch (error) {
  console.error("Failed to update task:", error);
}
```

## Notes

- All dates are in ISO format: `YYYY-MM-DD`
- Entity IDs are auto-generated when creating entities
- The plugin persists data as Markdown files with YAML frontmatter
- Changes made directly in Obsidian will be reflected in the plugin after a reload