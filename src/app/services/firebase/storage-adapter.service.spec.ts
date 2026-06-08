import { TestBed } from "@angular/core/testing";
import { Storage } from "@angular/fire/storage";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FirebaseStorage } from "@capacitor-firebase/storage";
import { PlatformService } from "../platform.service";
import { FirebaseAppCheckService } from "./app-check.service";
import { StorageAdapterService } from "./storage-adapter.service";

vi.mock("@angular/fire/storage", () => ({
  Storage: class {},
  ref: vi.fn((_storage, path: string) => ({ path })),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn().mockResolvedValue("https://example.com/file.jpg"),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@capacitor-firebase/storage", () => ({
  FirebaseStorage: {
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getDownloadUrl: vi
      .fn()
      .mockResolvedValue({ downloadUrl: "https://example.com/native.jpg" }),
    uploadFile: vi.fn(),
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: "file:///tmp/upload.jpg" }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
  Directory: {
    Cache: "CACHE",
  },
}));

const createPlatformService = (isNative: boolean) => ({
  isNative: vi.fn().mockReturnValue(isNative),
  getPlatform: vi.fn().mockReturnValue(isNative ? "ios" : "web"),
});

const createAppCheckService = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
});

const storage = {
  app: {
    options: {
      storageBucket: "bucket.appspot.com",
    },
  },
};

describe("StorageAdapterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for App Check initialization before using the web SDK", async () => {
    const { getDownloadURL } = await import("@angular/fire/storage");
    const appCheck = createAppCheckService();
    let resolveAppCheck!: () => void;
    appCheck.initialize.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAppCheck = resolve;
      })
    );

    TestBed.configureTestingModule({
      providers: [
        StorageAdapterService,
        { provide: Storage, useValue: storage },
        { provide: PlatformService, useValue: createPlatformService(false) },
        { provide: FirebaseAppCheckService, useValue: appCheck },
      ],
    });

    const resultPromise = TestBed.inject(StorageAdapterService).getDownloadUrl(
      "spot-pictures/file.jpg"
    );
    await Promise.resolve();

    expect(getDownloadURL).not.toHaveBeenCalled();

    resolveAppCheck();
    await expect(resultPromise).resolves.toBe("https://example.com/file.jpg");

    expect(appCheck.initialize).toHaveBeenCalledTimes(1);
    expect(getDownloadURL).toHaveBeenCalled();
  });

  it("waits for App Check initialization before using the native plugin", async () => {
    const appCheck = createAppCheckService();
    let resolveAppCheck!: () => void;
    appCheck.initialize.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAppCheck = resolve;
      })
    );

    TestBed.configureTestingModule({
      providers: [
        StorageAdapterService,
        { provide: Storage, useValue: storage },
        { provide: PlatformService, useValue: createPlatformService(true) },
        { provide: FirebaseAppCheckService, useValue: appCheck },
      ],
    });

    const resultPromise = TestBed.inject(StorageAdapterService).getDownloadUrl(
      "spot-pictures/file.jpg"
    );
    await Promise.resolve();

    expect(FirebaseStorage.getDownloadUrl).not.toHaveBeenCalled();

    resolveAppCheck();
    await expect(resultPromise).resolves.toBe("https://example.com/native.jpg");

    expect(appCheck.initialize).toHaveBeenCalledTimes(1);
    expect(FirebaseStorage.getDownloadUrl).toHaveBeenCalledWith({
      path: "spot-pictures/file.jpg",
    });
  });
});
