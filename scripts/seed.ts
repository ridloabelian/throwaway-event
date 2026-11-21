import { seedDemoEvent } from "@/lib/seed";
import { closeDb } from "@/db";

function main() {
  const seeded = seedDemoEvent(Date.now());
  console.log(
    `Seeded demo event "${seeded.slug}" (id=${seeded.eventId}, hostPasskey=${seeded.hostPasskey})`,
  );
  closeDb();
}

main();
