import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaceDetails, listCategories } from "@/server/places-admin";
import { requireRole } from "@/server/require-role";
import { PlaceForm } from "../../place-form";

// Edit a place's details (admins only). The accessibility level isn't here on purpose:
// it only changes through an approved assessment (hard rule 3).
export default async function EditPlacePage({ params }: PageProps<"/dashboard/places/[id]/edit">) {
  await requireRole("admin");
  const { id } = await params;
  const [details, categories] = await Promise.all([getPlaceDetails(id), listCategories()]);
  if (!details) notFound();
  const { place } = details;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/dashboard/places" className="underline">
          Places
        </Link>
        {" / "}
        <Link href={`/dashboard/places/${place.id}`} className="underline">
          {place.name}
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Edit place</h1>
      <PlaceForm
        categories={categories.map((c) => ({ id: c.id, name: c.name.en }))}
        initial={{
          name: place.name,
          otherNames: (place.otherNames ?? []).join("\n"),
          categoryId: place.categoryId,
          lat: String(place.lat),
          lng: String(place.lng),
          address: place.address ?? "",
        }}
        edit={{ placeId: place.id, version: place.updatedAt.getTime(), fromOsm: place.source === "osm" }}
      />
    </div>
  );
}
