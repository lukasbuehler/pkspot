import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import type { PrivateUserDataSchema } from "../../db/schemas/PrivateUserDataSchema";
import {
  AccountPreferencesService,
  BROWSER_PREFERRED_LOCALES,
} from "./account-preferences.service";
import { AuthenticationService } from "./firebase/authentication.service";
import { UsersService } from "./firebase/firestore/users.service";

describe("AccountPreferencesService", () => {
  const authState = new BehaviorSubject<{ uid?: string } | null>(null);
  const privateData = new BehaviorSubject<PrivateUserDataSchema | null>(null);
  const auth = {
    authState$: authState,
    user: {} as { uid?: string },
  };
  const users = {
    getPrivateData: vi.fn(() => privateData),
    updatePrivateData: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    authState.next(null);
    privateData.next(null);
    auth.user = {};
    users.getPrivateData.mockClear();
    users.updatePrivateData.mockReset();
    users.updatePrivateData.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: "de" },
        { provide: BROWSER_PREFERRED_LOCALES, useValue: ["de-CH"] },
        { provide: AuthenticationService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("uses the locale default until a signed-in account preference loads", () => {
    const service = TestBed.inject(AccountPreferencesService);

    expect(service.temperatureUnit()).toBe("celsius");

    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    privateData.next({ settings: { temperature_unit: "fahrenheit" } });

    expect(users.getPrivateData).toHaveBeenCalledWith("user-1");
    expect(service.temperatureUnit()).toBe("fahrenheit");
  });

  it("uses an explicit browser temperature setting before locale inference", () => {
    TestBed.overrideProvider(BROWSER_PREFERRED_LOCALES, {
      useValue: ["de-CH-u-mu-fahrenhe"],
    });

    const service = TestBed.inject(AccountPreferencesService);

    expect(service.temperatureUnit()).toBe("fahrenheit");
  });

  it("uses the account setting before an explicit browser setting", () => {
    TestBed.overrideProvider(BROWSER_PREFERRED_LOCALES, {
      useValue: ["de-CH-u-mu-fahrenhe"],
    });
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);

    privateData.next({ settings: { temperature_unit: "celsius" } });

    expect(service.temperatureUnit()).toBe("celsius");
  });

  it("infers from the browser locale when it has no explicit unit setting", () => {
    TestBed.overrideProvider(BROWSER_PREFERRED_LOCALES, {
      useValue: ["en-US"],
    });

    const service = TestBed.inject(AccountPreferencesService);

    expect(service.temperatureUnit()).toBe("fahrenheit");
  });

  it("writes the preference to private account settings", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);

    await service.setTemperatureUnit("fahrenheit");

    expect(service.temperatureUnit()).toBe("fahrenheit");
    expect(users.updatePrivateData).toHaveBeenCalledWith("user-1", {
      settings: { temperature_unit: "fahrenheit" },
    });
  });

  it("returns to the locale default after sign-out", () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);
    privateData.next({ settings: { temperature_unit: "fahrenheit" } });

    auth.user = {};
    authState.next(null);

    expect(service.temperatureUnit()).toBe("celsius");
  });

  it("rolls back an optimistic change when saving fails", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);
    privateData.next({ settings: { temperature_unit: "celsius" } });
    users.updatePrivateData.mockRejectedValueOnce(new Error("denied"));

    await expect(
      service.setTemperatureUnit("fahrenheit"),
    ).rejects.toThrow("denied");

    expect(service.temperatureUnit()).toBe("celsius");
  });
});
