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
import { Subject, timer } from 'rxjs'
import { FifteenGameComponent } from '../fifteen-game/fifteen-game.component'
import { ParticleService } from 'src/app/services/particle.service'
import { TypingGameComponent } from '../typing-game/typing-game.component'

export enum Annoyance {
  none = '0',
  timeout = '1',
  typing = '2',
  fifteen = '3'
}

export interface ConfirmDialogData {
  title: string
  titleSuffix?: string // Left untranslated and emphasized
  content?: string
  contentSuffix?: string
  options?: {
    confirm?: string
    cancel?: string
  }
  annoying?: string
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
    FifteenGameComponent,
    TypingGameComponent,
    TranslatePipe
  ],
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  protected data = inject<ConfirmDialogData>(MAT_DIALOG_DATA)
  private particle = inject(ParticleService)

  readonly dialogRef = inject<MatDialogRef<ConfirmDialogComponent, ConfirmDialogResult>>(
    MatDialogRef<ConfirmDialogComponent>
  )

  textData: ConfirmDialogData
  confirmButtonEnabled: boolean

  // Annoyance data
  annoyanceComplete = new Subject<void>()

  // Defaults for the buttons
  defaultTextData = {
    options: {
      confirm: 'dialog.confirm',
      cancel: 'dialog.cancel'
    }
  }

  inputResponse = signal('')

  // Type mirroring for component
  Annoyance = Annoyance

  constructor() {
    const data = this.data

    this.textData = Object.assign(this.defaultTextData, data)

    // Disable button if there's additional conditions
    this.confirmButtonEnabled = data.annoying !== undefined && data.annoying === Annoyance.none
    this.annoyanceComplete.subscribe(() => {
      this.confirmButtonEnabled = true
    })

    // Various annoyances

    if (data.annoying === Annoyance.timeout) {
      timer(2000).subscribe(() => {
        this.annoyanceComplete.next()
      })
    }

    if (!data.annoying || data.annoying == Annoyance.none) {
      this.confirmButtonEnabled = true
    }
  }

  winAnnoyance() {
    this.particle.genericConfetti()
    this.annoyanceComplete.next()
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
