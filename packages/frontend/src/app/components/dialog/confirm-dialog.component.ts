import { Component, inject, Inject, signal } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { TranslatePipe } from '@ngx-translate/core'

export interface ConfirmDialogData {
  title: string
  titleSuffix?: string // Left untranslated and emphasized
  content?: string
  contentSuffix?: string
  options?: {
    confirm?: string
    cancel?: string
  }
}
export type ConfirmDialogResult = boolean

@Component({
  selector: 'app-confirm-dialog',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogTitle,
    MatDialogContent,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe
  ],
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject<MatDialogRef<ConfirmDialogComponent, ConfirmDialogResult>>(
    MatDialogRef<ConfirmDialogComponent>
  )

  textData: ConfirmDialogData

  // Defaults for the buttons
  defaultTextData = {
    options: {
      confirm: 'dialog.confirm',
      cancel: 'dialog.cancel'
    }
  }

  inputResponse = signal('')

  constructor(@Inject(MAT_DIALOG_DATA) protected data: ConfirmDialogData) {
    this.textData = Object.assign(this.defaultTextData, data)
  }

  onInput(event: InputEvent): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.inputResponse.set(event.target.value)
    }
  }

  onCancel(): void {
    this.dialogRef.close(false)
  }
  onConfirm(): void {
    this.dialogRef.close(true)
  }
}
