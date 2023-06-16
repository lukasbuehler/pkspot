import { CdkDragDrop } from "@angular/cdk/drag-drop/index.js";
import { Component, Input, ViewChild } from "@angular/core";

enum BottomSheetOpenState {
  Closed = 1,
  HalfOpen = 2,
  FullyOpen = 3,
}

@Component({
  selector: "app-bottom-sheet",
  templateUrl: "./bottom-sheet.component.html",
  styleUrls: ["./bottom-sheet.component.scss"],
})
export class BottomSheetComponent {
  _bottomSheetSate: BottomSheetOpenState = BottomSheetOpenState.Closed;

  @Input() title: string = "";

  @Input() hasMiddleState: boolean = true;

  @ViewChild("bottomSheet", { static: true }) bottomSheet: any;

  onDrop(event: CdkDragDrop<string[]>) {
    console.log(event);
    switch (event.currentIndex) {
      case 0:
        this._bottomSheetSate = BottomSheetOpenState.FullyOpen;
        break;
      case 1:
        this._bottomSheetSate = BottomSheetOpenState.HalfOpen;
        break;
      default:
        this._bottomSheetSate = BottomSheetOpenState.Closed;
        break;
    }
  }

  get isFullyOpen(): boolean {
    return this._bottomSheetSate === BottomSheetOpenState.FullyOpen;
  }
  get isHalfOpen(): boolean {
    return this._bottomSheetSate === BottomSheetOpenState.HalfOpen;
  }
  get isClosed(): boolean {
    return this._bottomSheetSate === BottomSheetOpenState.Closed;
  }
}
