import { Component, effect, output, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faImage, faUpload } from '@fortawesome/free-solid-svg-icons'
import { SettingsService } from '../services/settings.service'

// yes, I am rewriting file-upload just so it can have text and emit a different type

@Component({
  selector: 'app-select-image-button',
  imports: [MatButtonModule, MatProgressSpinnerModule, FontAwesomeModule],
  templateUrl: './select-image-button.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './select-image-button.component.scss'
})
export class SelectImageButtonComponent {
  fileEvent = output<File>()
  fileSelected = signal(false)

  setIcon = faImage
  uploadIcon = faUpload
  fileName = ''

  constructor() {
    const settingsService = inject(SettingsService)

    effect(() => {
      if (!settingsService.settingsModified()) {
        this.fileSelected.set(false)
      }
    })
  }

  selectImage(event: Event) {
    const elem = event.target as HTMLInputElement
    if (elem.files === null || elem.files.length === 0) return

    const file = elem.files[0]
    this.fileEvent.emit(file)
    this.fileSelected.set(true)
    this.fileName = file.name
  }
}
