// Turns a change_log row's old_row / new_row into readable lines, e.g.
//   { role: "user" } -> { role: "admin" }   becomes   role: user → admin
// No imports, so the tests can load it directly.

export type FieldChange = { field: string; from: string | null; to: string | null };

export function describeChange(oldRow: unknown, newRow: unknown): FieldChange[] {
  const before = asObject(oldRow);
  const after = asObject(newRow);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .map((field) => ({ field, from: show(before[field]), to: show(after[field]) }))
    // Skip fields that didn't change, and fields that went from "not there" to empty
    // (e.g. rejection_reason on an approval), which tell an admin nothing.
    .filter((change) => change.from !== change.to && !(change.from === null && change.to === "empty"));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function show(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return "empty";
  return typeof value === "string" ? value : JSON.stringify(value);
}
