import { RESPONSE_INIT } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";
import { NotFoundPageComponent } from "./not-found-page.component";

describe("NotFoundPageComponent", () => {
  it("marks server-rendered responses as not found", async () => {
    const responseInit: ResponseInit = { status: 200 };

    await TestBed.configureTestingModule({
      imports: [NotFoundPageComponent],
      providers: [
        provideRouter([]),
        { provide: RESPONSE_INIT, useValue: responseInit },
      ],
    }).compileComponents();

    TestBed.createComponent(NotFoundPageComponent);

    expect(responseInit.status).toBe(404);
  });
});
