// A small Dataview-inspired query engine for the Insight section.
//
// Query language (line-based, keywords are case-insensitive):
//
//   FROM task
//   WHERE status != done AND priority = high
//   GROUP BY status
//   SORT priority DESC
//   VIEW kanban
//   LIMIT 50
//
// Clauses are all optional except `FROM`. `VIEW` defaults to `table`.
// Operators in WHERE: =, !=, >, <, >=, <=, contains, starts.
// Multiple conditions are combined with AND (OR is not supported to keep the
// grammar small and predictable).

import type { AnyEntity, VaultModel, EntityKind } from "./types";

export type QueryEntity = "task" | "target" | "project" | "requirement";
export type QueryView = "table" | "kanban" | "list" | "pie" | "donut" | "bar" | "metric" | "progress" | "timeline";

export interface QueryFilter {
  field: string;
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "starts";
  value: string;
}

export interface QuerySpec {
  from: QueryEntity;
  filters: QueryFilter[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  view: QueryView;
  limit?: number;
}

export interface QueryError {
  line: number;
  message: string;
}

export interface ParseResult {
  spec: QuerySpec | null;
  error: QueryError | null;
}

const DEFAULT_SPEC: QuerySpec = {
  from: "task",
  filters: [],
  view: "table",
  sortDir: "asc",
};

const OPS = ["!=", ">=", "<=", "contains", "starts", "=", ">", "<"] as const;

/** Parse a query string into a QuerySpec, or return an error. */
export function parseQuery(input: string): ParseResult {
  const lines = input.split(/\r?\n/);
  const spec: QuerySpec = { ...DEFAULT_SPEC, filters: [] };
  let hasFrom = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) continue;
    const upper = raw.toUpperCase();

    if (upper.startsWith("FROM ")) {
      const val = raw.slice(5).trim().toLowerCase();
      if (val !== "task" && val !== "target" && val !== "project" && val !== "requirement") {
        return { spec: null, error: { line: i + 1, message: `Unknown entity "${val}". Use task, target, project or requirement.` } };
      }
      spec.from = val as QueryEntity;
      hasFrom = true;
    } else if (upper.startsWith("WHERE ")) {
      const rest = raw.slice(6).trim();
      const parsed = parseConditions(rest, i + 1);
      if (parsed.error) return { spec: null, error: parsed.error };
      spec.filters = parsed.filters;
    } else if (upper.startsWith("GROUP BY ")) {
      spec.groupBy = raw.slice(9).trim();
    } else if (upper.startsWith("SORT ")) {
      const rest = raw.slice(5).trim();
      const m = rest.match(/^(.+?)\s+(ASC|DESC)$/i);
      if (m) {
        spec.sortBy = m[1].trim();
        spec.sortDir = m[2].toUpperCase() === "DESC" ? "desc" : "asc";
      } else {
        spec.sortBy = rest;
        spec.sortDir = "asc";
      }
    } else if (upper.startsWith("VIEW ")) {
      const v = raw.slice(5).trim().toLowerCase();
      const validViews = ["table", "kanban", "list", "pie", "donut", "bar", "metric", "progress", "timeline"];
      if (!validViews.includes(v)) {
        return { spec: null, error: { line: i + 1, message: `Unknown view "${v}". Use one of: ${validViews.join(", ")}.` } };
      }
      spec.view = v as QueryView;
    } else if (upper.startsWith("LIMIT ")) {
      const n = parseInt(raw.slice(6).trim(), 10);
      if (Number.isFinite(n) && n > 0) spec.limit = n;
    } else {
      return { spec: null, error: { line: i + 1, message: `Unrecognised clause. Expected FROM, WHERE, GROUP BY, SORT, VIEW or LIMIT.` } };
    }
  }

  if (!hasFrom) {
    return { spec: null, error: { line: 0, message: "Query must start with FROM <entity>." } };
  }
  return { spec, error: null };
}

function parseConditions(text: string, lineNo: number): { filters: QueryFilter[]; error: QueryError | null } {
  // Split on " AND " (case-insensitive). We don't support OR.
  const parts = text.split(/\s+AND\s+/i);
  const filters: QueryFilter[] = [];
  for (const part of parts) {
    const f = parseCondition(part.trim(), lineNo);
    if (!f) return { filters: [], error: { line: lineNo, message: `Could not parse condition "${part}". Use: field op value` } };
    filters.push(f);
  }
  return { filters, error: null };
}

function parseCondition(text: string, lineNo: number): QueryFilter | null {
  for (const op of OPS) {
    const idx = text.indexOf(op);
    if (idx > 0) {
      const field = text.slice(0, idx).trim();
      let value = text.slice(idx + op.length).trim();
      value = unquote(value);
      if (!field) return null;
      return { field, op: op as QueryFilter["op"], value };
    }
  }
  return null;
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Resolve a field value on an entity, including virtual/joined fields. */
export function fieldValue(entity: AnyEntity, field: string, model: VaultModel): string {
  const f = field.toLowerCase();
  const e = entity as Record<string, any>;
  if (f === "name" || f === "title") return (entity as any).name ?? (entity as any).title ?? "";
  if (f === "kind") return entity.kind;
  if (f in e) {
    const v = e[f];
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }
  // Virtual / joined fields.
  if (f === "projectname") {
    if ("projectId" in entity) {
      const p = model.projects.find((p) => p.id === (entity as any).projectId);
      return p?.name ?? "";
    }
  }
  if (f === "targetname") {
    if ("targetId" in entity) {
      const t = model.targets.find((t) => t.id === (entity as any).targetId);
      return t?.name ?? "";
    }
  }
  if (f === "deps") {
    if ("dependencies" in entity) return (entity as any).dependencies.join(", ");
  }
  return "";
}

function compare(actual: string, op: QueryFilter["op"], expected: string): boolean {
  const a = actual.toLowerCase();
  const b = expected.toLowerCase();
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "contains":
      return a.includes(b);
    case "starts":
      return a.startsWith(b);
  }
}

function collection(model: VaultModel, from: QueryEntity): AnyEntity[] {
  if (from === "task") return model.tasks;
  if (from === "target") return model.targets;
  if (from === "project") return model.projects;
  return model.requirements;
}

/** Run a parsed query against the vault model, returning matched rows. */
export function runQuery(spec: QuerySpec, model: VaultModel): AnyEntity[] {
  let rows = collection(model, spec.from).slice();
  if (spec.filters.length) {
    rows = rows.filter((r) => spec.filters.every((f) => compare(fieldValue(r, f.field, model), f.op, f.value)));
  }
  if (spec.sortBy) {
    const sb = spec.sortBy;
    const dir = spec.sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      const va = fieldValue(a, sb, model);
      const vb = fieldValue(b, sb, model);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }
  if (spec.limit && spec.limit > 0) rows = rows.slice(0, spec.limit);
  return rows;
}

export interface QueryGroup {
  key: string;
  rows: AnyEntity[];
}

/** Group rows by a field for kanban/table-grouped rendering. */
export function groupRows(rows: AnyEntity[], field: string | undefined, model: VaultModel): QueryGroup[] {
  if (!field) return [{ key: "All", rows }];
  const map = new Map<string, AnyEntity[]>();
  for (const r of rows) {
    const v = fieldValue(r, field, model) || "—";
    if (!map.has(v)) map.set(v, []);
    map.get(v)!.push(r);
  }
  return [...map.entries()].map(([key, rows]) => ({ key, rows }));
}

/** A starter query the user can build on. */
export const SAMPLE_QUERY = `FROM task
WHERE status != done
GROUP BY status
SORT priority DESC
VIEW kanban`;

/** Common, human-readable field labels per entity. */
export const FIELD_HINTS: Record<QueryEntity, string[]> = {
  task: ["name", "status", "priority", "owner", "dueDate", "projectName", "targetName"],
  target: ["name", "status", "owner", "startDate", "endDate", "deps", "projectName"],
  project: ["name", "status", "owner", "startDate", "endDate"],
  requirement: ["title", "status", "priority", "source"],
};

/** The entity kind matching a QueryEntity (for selection clicks). */
export function entityKindOf(from: QueryEntity): EntityKind {
  return from;
}
