import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { EventRoomClient } from "@/components/EventRoomClient";
import { getCookieName } from "@/lib/auth";
import { loadEventAccess } from "@/lib/event-access";
import { getHydratedRoomData, toPublicEventMeta } from "@/lib/room-data";

export const dynamic = "force-dynamic";

export default async function EventRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearch = await searchParams;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(getCookieName(slug))?.value;

  const access = loadEventAccess(undefined, slug, { cookieToken });

  if (access.status === "not_found") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-[#E4DACB] bg-white p-8 shadow-sm">
          <span className="inline-block rounded-full bg-[#F3EDE2] px-3 py-1 text-xs font-semibold text-[#645C52]">
            404 · Room Not Found
          </span>
          <h1 className="mt-3 text-2xl font-bold text-[#191715]">
            No active event at /e/{slug}
          </h1>
          <p className="mt-2 text-sm text-[#645C52]">
            The link may have expired and already been purged, or there might be a typo.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1E4635] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#153326]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (access.status === "expired") {
    return (
      <EventRoomClient
        justCreated={false}
        initialState={{ mode: "expired", title: access.event.title }}
      />
    );
  }

  if (!access.canReadRoom) {
    return (
      <EventRoomClient
        justCreated={false}
        initialState={{ mode: "locked", event: toPublicEventMeta(access.event) }}
      />
    );
  }

  const room = getHydratedRoomData(access.event, access.attendee);
  return (
    <EventRoomClient
      justCreated={resolvedSearch.created === "1"}
      initialState={{ mode: "open", room }}
    />
  );
}
