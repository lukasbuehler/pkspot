import {
  isAllowedMapLinkUrl,
  resolveMapRedirectChain,
} from "../functions/src/mapLinkFunctions";

const redirect = (location: string, status = 302) => ({
  status,
  headers: new Headers({ location }),
});

describe("map link redirect resolver", () => {
  it("follows supported redirect hops and returns the final URL", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(redirect("https://www.google.com/maps/place/Test/@47,8,17z"))
      .mockResolvedValueOnce({ status: 200, headers: new Headers() });

    await expect(
      resolveMapRedirectChain("https://maps.app.goo.gl/abc", request),
    ).resolves.toBe("https://www.google.com/maps/place/Test/@47,8,17z");
    expect(request).toHaveBeenCalledTimes(2);
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
  });
});
