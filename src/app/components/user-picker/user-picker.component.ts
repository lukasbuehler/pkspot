import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from "@angular/material/autocomplete";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { debounceTime, distinctUntilChanged, map } from "rxjs";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { SearchService } from "../../services/search.service";

@Component({
  selector: "app-user-picker",
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: "./user-picker.component.html",
  styleUrl: "./user-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPickerComponent {
  private readonly _search = inject(SearchService);
  private readonly _users = inject(UsersService);
  private _searchVersion = 0;
  private _resolveVersion = 0;

  readonly value = input("");
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly userSelected = output<UserReferenceSchema>();
  readonly control = new FormControl<string | UserReferenceSchema>("", {
    nonNullable: true,
  });
  readonly results = signal<UserReferenceSchema[]>([]);
  readonly query = signal("");
  readonly searching = signal(false);
  readonly resolving = signal(false);
  readonly selectedUser = signal<UserReferenceSchema | null>(null);

  constructor() {
    this.control.valueChanges
      .pipe(
        map((value) => (typeof value === "string" ? value.trim() : "")),
        debounceTime(250),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((query) => void this._searchUsers(query));

    effect(() => {
      const uid = this.value().trim();
      void this._resolveValue(uid);
    });

    effect(() => {
      if (this.disabled()) {
        this.control.disable({ emitEvent: false });
      } else {
        this.control.enable({ emitEvent: false });
      }
    });
  }

  displayUser(user: string | UserReferenceSchema | null): string {
    if (!user) return "";
    return typeof user === "string"
      ? user
      : user.display_name || user.uid;
  }

  selectUser(event: MatAutocompleteSelectedEvent): void {
    const user = event.option.value as UserReferenceSchema;
    this.control.setValue(user, { emitEvent: false });
    this.selectedUser.set(user);
    this.results.set([]);
    this.query.set("");
    this.valueChange.emit(user.uid);
    this.userSelected.emit(user);
  }

  private async _searchUsers(query: string): Promise<void> {
    const version = ++this._searchVersion;
    this.query.set(query);
    if (query.length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    const users = await this._search.searchUsers(query);
    if (version !== this._searchVersion) return;
    this.results.set(
      users.some((user) => user.uid === query)
        ? users
        : [...users, { uid: query }],
    );
    this.searching.set(false);
  }

  private async _resolveValue(uid: string): Promise<void> {
    const version = ++this._resolveVersion;
    if (!uid) {
      this.control.setValue("", { emitEvent: false });
      this.selectedUser.set(null);
      this.resolving.set(false);
      return;
    }
    const current = this.control.value;
    if (typeof current !== "string" && current.uid === uid) return;

    this.resolving.set(true);
    const user = await this._users.getUserRefernceById(uid);
    if (version !== this._resolveVersion) return;
    const reference = user ?? { uid };
    this.control.setValue(reference, { emitEvent: false });
    this.selectedUser.set(reference);
    this.resolving.set(false);
  }
}
