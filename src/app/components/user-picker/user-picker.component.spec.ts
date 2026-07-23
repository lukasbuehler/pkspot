import { ComponentFixture, TestBed } from "@angular/core/testing";
import { vi } from "vitest";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { SearchService } from "../../services/search.service";
import { UserPickerComponent } from "./user-picker.component";

describe("UserPickerComponent", () => {
  let fixture: ComponentFixture<UserPickerComponent>;
  const searchUsers = vi.fn();
  const getUserRefernceById = vi.fn();

  beforeEach(async () => {
    searchUsers.mockReset();
    searchUsers.mockResolvedValue([]);
    getUserRefernceById.mockReset();
    getUserRefernceById.mockResolvedValue(null);

    await TestBed.configureTestingModule({
      imports: [UserPickerComponent],
      providers: [
        { provide: SearchService, useValue: { searchUsers } },
        { provide: UsersService, useValue: { getUserRefernceById } },
      ],
    })
      .overrideComponent(UserPickerComponent, { set: { template: "" } })
      .compileComponents();

    fixture = TestBed.createComponent(UserPickerComponent);
    await fixture.whenStable();
  });

  it("resolves a stored user ID for display", async () => {
    getUserRefernceById.mockResolvedValue({
      uid: "owner-1",
      display_name: "Owner",
    });

    fixture.componentRef.setInput("value", "owner-1");
    await fixture.whenStable();

    expect(fixture.componentInstance.control.value).toEqual({
      uid: "owner-1",
      display_name: "Owner",
    });
  });

  it("keeps an exact pasted user ID available when it is not searchable", async () => {
    const component = fixture.componentInstance;
    const picker = component as unknown as {
      _searchUsers(query: string): Promise<void>;
    };

    await picker._searchUsers("private-user-id");

    expect(component.results()).toEqual([{ uid: "private-user-id" }]);
  });
});
