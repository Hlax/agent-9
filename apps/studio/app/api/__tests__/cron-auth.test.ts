import { describe, it, expect, beforeEach, afterEach } from "vitest";

const CRON_SECRET_HEADER = "x-cron-secret";

describe("cron session auth", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret-123";
  });
  afterEach(() => {
    if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;
    else delete process.env.CRON_SECRET;
  });

  it("GET /api/cron/session returns 401 without x-cron-secret header", async () => {
    const { GET } = await import("../cron/session/route");
    const req = new Request("http://localhost/api/cron/session", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/cron/session returns 401 with wrong secret", async () => {
    const { GET } = await import("../cron/session/route");
    const req = new Request("http://localhost/api/cron/session", {
      method: "GET",
      headers: { [CRON_SECRET_HEADER]: "wrong-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/cron/session returns 200 with correct secret", async () => {
    const { GET } = await import("../cron/session/route");
    const req = new Request("http://localhost/api/cron/session", {
      method: "GET",
      headers: { [CRON_SECRET_HEADER]: "test-secret-123" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped !== undefined || body.triggered !== undefined).toBe(true);
  });
});
