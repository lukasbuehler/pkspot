import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import type { PrivateUserDataSchema } from "../../db/schemas/PrivateUserDataSchema";
import { AccountPreferencesService } from "./account-preferences.service";
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
        { provide: AuthenticationService, useValue: auth },
        { provide: UsersService, useValue: users },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it("uses local units until a signed-in account preference loads", () => {
    const service = TestBed.inject(AccountPreferencesService);

    expect(service.temperatureUnitPreference()).toBe("local");
    expect(service.temperatureUnit("CH")).toBe("celsius");
    expect(service.temperatureUnit("US")).toBe("fahrenheit");

    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    privateData.next({ settings: { temperature_unit: "fahrenheit" } });

    expect(users.getPrivateData).toHaveBeenCalledWith("user-1");
    expect(service.temperatureUnitPreference()).toBe("fahrenheit");
    expect(service.temperatureUnit("CH")).toBe("fahrenheit");
  });

  it("loads an explicitly stored local preference", () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);

    privateData.next({ settings: { temperature_unit: "local" } });

    expect(service.temperatureUnitPreference()).toBe("local");
    expect(service.temperatureUnit("US")).toBe("fahrenheit");
  });

  it("writes the preference to private account settings", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);

    await service.setTemperatureUnit("fahrenheit");

    expect(service.temperatureUnitPreference()).toBe("fahrenheit");
    expect(users.updatePrivateData).toHaveBeenCalledWith("user-1", {
      settings: { temperature_unit: "fahrenheit" },
    });
  });

  it("writes the local preference to private account settings", async () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);

    await service.setTemperatureUnit("local");

    expect(users.updatePrivateData).toHaveBeenCalledWith("user-1", {
      settings: { temperature_unit: "local" },
    });
  });

  it("returns to the local default after sign-out", () => {
    auth.user = { uid: "user-1" };
    authState.next(auth.user);
    const service = TestBed.inject(AccountPreferencesService);
    privateData.next({ settings: { temperature_unit: "fahrenheit" } });

    auth.user = {};
    authState.next(null);

    expect(service.temperatureUnitPreference()).toBe("local");
    expect(service.temperatureUnit("US")).toBe("fahrenheit");
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

    expect(service.temperatureUnitPreference()).toBe("celsius");
  });
});
