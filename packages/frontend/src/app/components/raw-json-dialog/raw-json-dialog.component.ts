import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { LoaderComponent } from '../loader/loader.component';
// import { JsonViewModule } from 'nxt-json-view';
import { TranslateModule } from '@ngx-translate/core';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-raw-json-dialog',
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    // JsonViewModule,
    TranslateModule,
    JsonPipe
  ],
  templateUrl: './raw-json-dialog.component.html',
  styleUrl: './raw-json-dialog.component.scss',
})
export class RawJsonDialogComponent {
  private dialogRef = inject<MatDialogRef<RawJsonDialogComponent>>(MatDialogRef);
  jsonData = inject(MAT_DIALOG_DATA);

  data = {}

  constructor() {
    const jsonData = this.jsonData;

    this.data = jsonData
  }

  closeDialog() {
    this.dialogRef.close()
  }
}
