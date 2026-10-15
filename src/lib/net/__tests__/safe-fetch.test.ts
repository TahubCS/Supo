import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>();
  return {
    ...actual,
    lookup: (
      hostname: string,
      _options: unknown,
      callback: (error: Error | null, addresses: { address: string; family: number }[]) => void,
    ) => {
      const table: Record<string, { address: string; family: number }[]> = {
        "rebind.test": [{ address: "127.0.0.1", family: 4 }],
        "mixed.test": [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 },
        ],
        "public.test": [{ address: "93.184.216.34", family: 4 }],
      };
      callback(null, table[hostname] ?? []);
    },
  };
});

const { assertPublicUrl, guardedLookup, isPrivateAddress } = await import("@/lib/net/safe-fetch");

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http schemes, credentials and internal hosts", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow();
    await expect(assertPublicUrl("http://user:pw@example.com")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
  });

  it("accepts public IP literals without DNS", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("guardedLookup (connection-time check)", () => {
  function resolve(hostname: string, all: boolean) {
    return new Promise<{ error: Error | null; address: unknown }>((done) => {
      guardedLookup(hostname, { all } as never, (error, address) => done({ error, address }));
    });
  }

  it("refuses to connect when a hostname resolves to an internal address", async () => {
    expect((await resolve("rebind.test", false)).error?.message).toMatch(/not reachable/);
    expect((await resolve("mixed.test", true)).error?.message).toMatch(/not reachable/);
  });

  it("returns public addresses in the shape the caller asked for", async () => {
    expect(await resolve("public.test", false)).toEqual({ error: null, address: "93.184.216.34" });
    expect(await resolve("public.test", true)).toEqual({
      error: null,
      address: [{ address: "93.184.216.34", family: 4 }],
    });
  });
});
