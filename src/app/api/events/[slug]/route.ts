import { NextResponse } from "next/server";
import { expiredEventResponse, notFoundEventResponse } from "@/lib/api-helpers";
import { loadEventAccess } from "@/lib/event-access";
import { getHydratedRoomData, toPublicEventMeta } from "@/lib/room-data";

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const access = loadEventAccess(req, slug);

  if (access.status === "not_found") {
    return notFoundEventResponse();
  }
  if (access.status === "expired") {
    return expiredEventResponse();
  }

  if (!access.canReadRoom) {
    return NextResponse.json(
      {
        locked: true,
        event: toPublicEventMeta(access.event),
      },
      { status: 401 },
    );
  }

  const room = getHydratedRoomData(access.event, access.attendee);
  return NextResponse.json(room);
}
