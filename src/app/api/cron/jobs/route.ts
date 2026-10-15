import { type NextRequest, NextResponse } from "next/server";

import { drainJobs } from "@/lib/jobs";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Safety net for the job queue: recovers jobs whose runner died and runs
// anything queued or due for retry. Jobs normally start immediately via after().
export async function GET(req: NextRequest) {
  if (!isAuthorizedInternalRequest(req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainJobs({ maxJobs: 50, deadlineMs: 240_000 });
  return NextResponse.json(result);
}
