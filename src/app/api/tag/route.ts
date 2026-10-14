import { createTagHandler } from "@/lib/server/tag-handler";

// No `export const runtime = 'nodejs'`: with cacheComponents on, Next 16.4 rejects any
// `runtime` segment config ("not compatible with nextConfig.cacheComponents"), and Node
// is the default anyway. The logic lives in lib/server so tests can inject fakes; a route
// file may only export handlers and segment config.
export const maxDuration = 30; // two Gemini attempts of up to 10 s each, plus checks

export const POST = createTagHandler();
