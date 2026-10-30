"use client";

// One row's "change role" form. A plain <select> + button: it works with the keyboard
// and screen readers out of the box. useActionState shows the server's reply.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Role } from "@/server/roles";
import { setUserRole, type RoleFormState } from "./actions";

export function RoleForm({ userId, userName, role }: { userId: string; userName: string; role: Role }) {
  const [state, action, pending] = useActionState<RoleFormState, FormData>(setUserRole, null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* React resets a form after its action runs. key={role} rebuilds the form whenever
          the saved role changes, so the select shows the role that is really saved. */}
      <form key={role} action={action} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select
          name="role"
          defaultValue={role}
          aria-label={`Role for ${userName}`}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="user">user</option>
          <option value="reviewer">reviewer</option>
          <option value="admin">admin</option>
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Save
        </Button>
      </form>
      <span role="status" className={state?.ok === false ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {state?.message}
      </span>
    </div>
  );
}
