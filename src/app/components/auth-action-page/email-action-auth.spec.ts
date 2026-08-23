import { getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Mock, vi } from "vitest";
import { resolveEmailActionAuth } from "./email-action-auth";

vi.mock("firebase/app", () => ({
  getApps: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock("firebase/auth", () => ({ getAuth: vi.fn() }));

describe("resolveEmailActionAuth", () => {
  const primaryAuth = {
    app: {
      options: {
        apiKey: "app-key",
        projectId: "parkour-base-project",
        authDomain: "parkour-base-project.firebaseapp.com",
      },
    },
  } as Auth;

  beforeEach(() => {
    vi.clearAllMocks();
    (getApps as Mock).mockReturnValue([]);
  });

  it("uses the primary Auth instance when the link has no different key", () => {
    expect(resolveEmailActionAuth(primaryAuth, "app-key")).toEqual({
      auth: primaryAuth,
      apiKeySource: "app",
    });
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it("initializes Auth with the API key carried by the email action link", () => {
    const actionApp = { options: { apiKey: "link-key" } };
    const actionAuth = { app: actionApp };
    (initializeApp as Mock).mockReturnValue(actionApp);
    (getAuth as Mock).mockReturnValue(actionAuth);

    expect(resolveEmailActionAuth(primaryAuth, "link-key")).toEqual({
      auth: actionAuth,
      apiKeySource: "link",
    });
    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "link-key",
        projectId: "parkour-base-project",
      }),
      "pkspot-email-action-0",
    );
  });
});
