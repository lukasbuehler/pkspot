import {
  isAllowedMapLinkUrl,
  resolveMapRedirectChain,
} from "../functions/src/mapLinkFunctions";

const responseBody = () => ({ cancel: vi.fn().mockResolvedValue(undefined) });
const redirect = (location: string, status = 302) => ({
  status,
  headers: new Headers({ location }),
  body: responseBody(),
});

describe("map link redirect resolver", () => {
  it("follows supported redirect hops and returns the final URL", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(redirect("https://www.google.com/maps/place/Test/@47,8,17z"))
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
        body: responseBody(),
      });

    await expect(
      resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
    ).resolves.toBe("https://www.google.com/maps/place/Test/@47,8,17z");
    expect(request).toHaveBeenCalledOnce();
  });

  it("blocks off-domain redirects", async () => {
    const request = vi.fn().mockResolvedValue(redirect("https://evil.test/maps"));
    await expect(
      resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows only exact supported map hosts", () => {
    expect(isAllowedMapLinkUrl(new URL("https://maps.apple.com/?q=Zurich"))).toBe(true);
    expect(isAllowedMapLinkUrl(new URL("https://www.google.ch/maps"))).toBe(true);
    expect(isAllowedMapLinkUrl(new URL("https://google.ch.evil.test/maps"))).toBe(false);
    expect(isAllowedMapLinkUrl(new URL("https://www.google.com/search?q=secret"))).toBe(false);
    expect(isAllowedMapLinkUrl(new URL("https://goo.gl/not-a-map"))).toBe(false);
  });

  it("rejects malformed redirect locations as a controlled error", async () => {
    const request = vi.fn().mockResolvedValue(redirect("https://%"));

    await expect(
      resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("uses one deadline for the complete redirect chain", async () => {
    let now = 0;
    let hop = 0;
    const request = vi.fn().mockImplementation(async () => {
      now += 4_100;
      hop += 1;
      return redirect(`https://maps.app.goo.gl/next-${hop}`);
    });

    await expect(
      resolveMapRedirectChain(
        "https://maps.app.goo.gl/abc",
        request,
        () => now,
      ),
    ).rejects.toMatchObject({ code: "deadline-exceeded" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each(["AbortError", "TimeoutError"])(
    "reports a fetch %s as a controlled deadline error",
    async (name) => {
      const request = vi.fn().mockRejectedValue(
        Object.assign(new Error("request timed out"), { name }),
      );

      await expect(
        resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
      ).rejects.toMatchObject({ code: "deadline-exceeded" });
    },
  );

  it("preserves non-timeout fetch failures", async () => {
    const failure = new Error("network unavailable");
    const request = vi.fn().mockRejectedValue(failure);

    await expect(
      resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
    ).rejects.toBe(failure);
  });

  it("cancels the short-link response without fetching the Google Maps page", async () => {
    const firstBody = responseBody();
    const request = vi.fn().mockResolvedValueOnce({
      ...redirect("https://www.google.com/maps/place/Test"),
      body: firstBody,
    });

    await resolveMapRedirectChain("https://maps.app.goo.gl/abc", request);

    expect(request).toHaveBeenCalledOnce();
    expect(firstBody.cancel).toHaveBeenCalledOnce();
  });

  it("allows five redirects and rejects a sixth", async () => {
    let allowedHop = 0;
    const allowedRequest = vi.fn().mockImplementation(async () => {
      allowedHop += 1;
      return allowedHop <= 5
        ? redirect(`https://maps.app.goo.gl/allowed-${allowedHop}`)
        : {
            status: 200,
            headers: new Headers(),
            body: responseBody(),
          };
    });
    await expect(
      resolveMapRedirectChain(
        "https://maps.app.goo.gl/allowed",
        allowedRequest,
      ),
    ).resolves.toBe("https://maps.app.goo.gl/allowed-5");
    expect(allowedRequest).toHaveBeenCalledTimes(6);

    let excessiveHop = 0;
    const excessiveRequest = vi.fn().mockImplementation(async () => {
      excessiveHop += 1;
      return redirect(`https://maps.app.goo.gl/excessive-${excessiveHop}`);
    });
    await expect(
      resolveMapRedirectChain(
        "https://maps.app.goo.gl/excessive",
        excessiveRequest,
      ),
    ).rejects.toMatchObject({code: "resource-exhausted"});
    expect(excessiveRequest).toHaveBeenCalledTimes(6);
  });
});
