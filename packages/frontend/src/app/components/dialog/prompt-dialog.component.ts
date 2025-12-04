import { Component, inject, signal } from '@angular/core'
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

export interface PromptDialogData {
  title: string
  titleSuffix?: string // Left untranslated and emphasized
  content?: string
  label?: string
  optional?: true
  options?: {
    confirm?: string
    cancel?: string
  }
}
export type PromptDialogResult =
  | {
      confirmed: true
      value: string
    }
  | {
      confirmed: false
    }

@Component({
  selector: 'app-prompt-dialog',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogTitle,
    MatDialogContent,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe
  ],
  templateUrl: './prompt-dialog.component.html'
})
export class PromptDialogComponent {
  protected data = inject<PromptDialogData>(MAT_DIALOG_DATA);

  readonly dialogRef = inject<MatDialogRef<PromptDialogComponent, PromptDialogResult>>(
    MatDialogRef<PromptDialogComponent>
  )

  textData: PromptDialogData

  // Defaults for the buttons
  defaultTextData = {
    options: {
      confirm: 'dialog.confirm',
      cancel: 'dialog.cancel'
    }
  }

  inputResponse = signal('')

  constructor() {
    const data = this.data;

    this.textData = Object.assign(this.defaultTextData, data)
    console.log(this.textData)
  }

  onInput(event: InputEvent): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.inputResponse.set(event.target.value)
    }
  }

  onCancel(): void {
    this.dialogRef.close({ confirmed: false })
  }
  onConfirm(): void {
    this.dialogRef.close({ confirmed: true, value: this.inputResponse() })
  }
}
