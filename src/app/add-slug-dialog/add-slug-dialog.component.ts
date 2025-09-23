import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface AddSlugDialogData {
  spotName: string;
  newSlug: string;
}

@Component({
  selector: 'app-add-slug-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  templateUrl: './add-slug-dialog.component.html',
  styleUrls: ['./add-slug-dialog.component.scss']
})
export class AddSlugDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<AddSlugDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AddSlugDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onAdd(): void {
    if (this.data.newSlug && this.isValidSlug(this.data.newSlug)) {
      this.dialogRef.close(this.data.newSlug);
    }
  }

  isValidSlug(slug: string): boolean {
    return /^[a-z0-9-]+$/.test(slug);
  }

  getSlugValidationError(): string {
    if (!this.data.newSlug) {
      return '';
    }
    if (!this.isValidSlug(this.data.newSlug)) {
      return 'Slug must only contain lowercase letters, numbers, and hyphens';
    }
    return '';
  }
}