import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core'
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
import { KeyValueTypedPipe } from '../../pipes/keyvaluetyped.pipe'

export interface CustomDialogData<T extends string> {
  title: string
  titleSuffix?: string // Left untranslated and emphasized
  content?: string
  contentSuffix?: string
  options: Record<T, { type: 'confirm' | 'cancel'; text: string }>
}

@Component({
  selector: 'app-custom-dialog',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogTitle,
    MatDialogContent,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
    KeyValueTypedPipe
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './custom-dialog.component.html'
})
export class CustomDialogComponent<T extends string> {
  protected data = inject<CustomDialogData<T>>(MAT_DIALOG_DATA)

  readonly dialogRef = inject<MatDialogRef<CustomDialogComponent<T>, T | undefined>>(
    MatDialogRef<CustomDialogComponent<T>>
  )

  textData: CustomDialogData<T>

  // Defaults for the buttons

  inputResponse = signal('')

  constructor() {
    const data = this.data

    this.textData = data
  }

  onInput(event: InputEvent): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.inputResponse.set(event.target.value)
    }
  }

  // All options return their key, clicking off returns undefined
  onSelect(value: T): void {
    this.dialogRef.close(value)
  }
}
