import { purgeExpiredEvents } from "@/lib/expiry";
import { closeDb } from "@/db";

function main() {
  const result = purgeExpiredEvents(Date.now());
  console.log(
    JSON.stringify(
      {
        status: "ok",
        checkedAt: new Date().toISOString(),
        purgedEventCount: result.purgedEventCount,
        purgedSlugs: result.purgedSlugs,
        removedPhotoFiles: result.removedPhotoFiles,
        freedBytes: result.freedBytes,
      },
      null,
      2,
    ),
  );
  closeDb();
}

main();
