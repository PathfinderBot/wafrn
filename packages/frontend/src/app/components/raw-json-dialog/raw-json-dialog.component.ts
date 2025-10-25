import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { LoaderComponent } from '../loader/loader.component';
import { JsonViewModule } from 'nxt-json-view';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-raw-json-dialog',
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    JsonViewModule,
    TranslateModule
  ],
  templateUrl: './raw-json-dialog.component.html',
  styleUrl: './raw-json-dialog.component.scss',
})
export class RawJsonDialogComponent {
  data = {}

  constructor(
    private dialogRef: MatDialogRef<RawJsonDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public jsonData: object
  ) {
    this.data = jsonData
  }

  closeDialog() {
    this.dialogRef.close()
  }
}
