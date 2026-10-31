import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listUsers } from "@/server/dashboard";
import { requireRole } from "@/server/require-role";
import { RoleForm } from "./role-form";

export default async function UsersPage() {
  const admin = await requireRole("admin");
  const people = await listUsers();
  const staff = people.filter((person) => person.role !== "user").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users & roles</h1>
        <p className="max-w-prose text-muted-foreground">
          <strong>user</strong>: can submit assessments (in the app). <strong>reviewer</strong>: can also use this
          dashboard and review submissions. <strong>admin</strong>: can also manage places and roles.
        </p>
        <p className="mt-2 text-sm">
          {people.length} account{people.length === 1 ? "" : "s"}, of which {staff} reviewer{staff === 1 ? "" : "s"} or
          admin{staff === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="font-medium">{person.name}</TableCell>
                <TableCell>{person.email}</TableCell>
                <TableCell>{formatDate(person.createdAt)}</TableCell>
                <TableCell>
                  {person.id === admin.id ? (
                    <span>{person.role} (you)</span>
                  ) : (
                    <RoleForm userId={person.id} userName={person.name} role={person.role} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
