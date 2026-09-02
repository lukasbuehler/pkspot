import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrainContextDialogComponent } from "./train-context-dialog.component";

describe("TrainContextDialogComponent", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("returns a selected community to the Train page", () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { area: null, weather: null } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const component = TestBed.runInInjectionContext(
      () => new TrainContextDialogComponent(),
    );

    component.selectArea({
      type: "community",
      id: "country-ch",
      community: {
        id: "country-ch",
        communityKey: "country:ch",
        slug: "switzerland",
        displayName: "Switzerland",
        totalSpots: 240,
      },
    });

    expect(close).toHaveBeenCalledWith({
      kind: "choose-area",
      area: expect.objectContaining({ communityKey: "country:ch" }),
    });
  });
});
