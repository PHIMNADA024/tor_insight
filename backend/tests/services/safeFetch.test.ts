import { NonRetryableError } from "../../src/services/http.js";
import { BlockedUrlError, isAllowedSourceUrl, readLimited, safeFetch } from "../../src/services/safeFetch.js";

/**
 * Requests to URLs from data (SSRF): only HTTPS to the government sites we
 * collect from, redirects checked again, and bodies read up to a limit.
 */

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

describe("isAllowedSourceUrl", () => {
  it.each([
    "https://egp2.bangkok.go.th/api/file/1/tor.pdf",
    "https://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml",
    "https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=1",
    "https://EGP2.Bangkok.go.th/api/file/1/tor.pdf",
  ])("allows %s", (url) => {
    expect(isAllowedSourceUrl(url)).toBe(true);
  });

  it.each([
    ["plain http", "http://egp2.bangkok.go.th/api/file/1/tor.pdf"],
    ["another site", "https://evil.example/tor.pdf"],
    ["a look-alike host", "https://egp2.bangkok.go.th.evil.example/tor.pdf"],
    ["a host that only ends the same", "https://notgprocurement.go.th/x"],
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["the server itself", "https://localhost/api/admin/users"],
    ["a user and password", "https://user:pass@egp2.bangkok.go.th/tor.pdf"],
    ["a non-standard port", "https://egp2.bangkok.go.th:8443/tor.pdf"],
    ["another protocol", "file:///etc/passwd"],
    ["not a URL", "not a url"],
    ["an empty string", ""],
  ])("blocks %s", (_case, url) => {
    expect(isAllowedSourceUrl(url)).toBe(false);
  });
});

describe("safeFetch", () => {
  it("fetches an allowed URL without following redirects by itself", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF"));

    const res = await safeFetch("https://egp2.bangkok.go.th/api/file/1/tor.pdf", { headers: { Accept: "*/*" } });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://egp2.bangkok.go.th/api/file/1/tor.pdf", {
      headers: { Accept: "*/*" },
      redirect: "manual",
    });
  });

  it("refuses a blocked URL before any request, without retrying", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(safeFetch("http://169.254.169.254/")).rejects.toBeInstanceOf(NonRetryableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a redirect that stays on a government site", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("/api/file/2/tor.pdf"))
      .mockResolvedValueOnce(new Response("%PDF"));

    const res = await safeFetch("https://egp2.bangkok.go.th/api/file/1/tor.pdf");

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://egp2.bangkok.go.th/api/file/1/tor.pdf",
      "https://egp2.bangkok.go.th/api/file/2/tor.pdf",
    ]);
  });

  it("refuses a redirect to another site, without requesting it", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/meta-data"));

    await expect(safeFetch("https://egp2.bangkok.go.th/api/file/1/tor.pdf")).rejects.toBeInstanceOf(BlockedUrlError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 redirects", async () => {
    fetchMock.mockImplementation(async () => redirectTo("https://egp2.bangkok.go.th/again"));

    await expect(safeFetch("https://egp2.bangkok.go.th/start")).rejects.toThrow("Too many redirects");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns error responses as they are, for the caller to handle", async () => {
    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));

    const res = await safeFetch("https://egp2.bangkok.go.th/api/file/1/tor.pdf");

    expect(res.status).toBe(404);
  });
});

describe("readLimited", () => {
  it("returns the body when it fits", async () => {
    const body = await readLimited(new Response("%PDF-1.7 small"), 100);

    expect(body?.toString()).toBe("%PDF-1.7 small");
  });

  it("returns undefined when the declared size is over the limit, without reading", async () => {
    const res = new Response("x", { headers: { "Content-Length": "999" } });

    expect(await readLimited(res, 100)).toBeUndefined();
  });

  it("stops reading once the body passes the limit", async () => {
    let chunksSent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksSent++;
        controller.enqueue(new Uint8Array(60));
        if (chunksSent === 100) controller.close();
      },
    });

    expect(await readLimited(new Response(stream), 100)).toBeUndefined();
    expect(chunksSent).toBeLessThan(10);
  });
});