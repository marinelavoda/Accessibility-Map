import Link from "next/link";
import { listCategories } from "@/server/places-admin";
import { requireRole } from "@/server/require-role";
import { PlaceForm } from "../place-form";

// Add a missing place (admins only). Most places come from OpenStreetMap; this is for
// the ones OpenStreetMap doesn't have.
export default async function NewPlacePage() {
  await requireRole("admin");
  const categories = await listCategories();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/dashboard/places" className="underline">
          Places
        </Link>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold">Add a missing place</h1>
        <p className="text-muted-foreground">
          Only for places that aren&apos;t on the list yet. It appears in the app right away as &ldquo;Not yet
          rated&rdquo;, so people can assess it.
        </p>
      </div>
      <PlaceForm
        categories={categories.map((c) => ({ id: c.id, name: c.name.en }))}
        initial={{ name: "", otherNames: "", categoryId: "", lat: "", lng: "", address: "" }}
      />
    </div>
  );
}
