import { createInstallHandler } from "@/lib/server/install-handler";

// Node runtime by default (see api/tag/route.ts for why `runtime` is not exported).
export const maxDuration = 20;

export const POST = createInstallHandler();
