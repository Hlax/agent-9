import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: Request) {
  return await updateSession(request as import("next/server").NextRequest);
}

export const config = {
  matcher: [
    // Protect all routes except:
    // - static assets
    // - favicon
    // - public APIs used by habitat / cron
    "/((?!_next/static|_next/image|favicon.ico|api/public/|api/cron/session).*)",
  ],
};
