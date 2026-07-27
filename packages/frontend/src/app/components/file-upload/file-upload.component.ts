import { HttpEventType } from '@angular/common/http'
import { Component, EventEmitter, Input, Output, input, signal, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faFileUpload } from '@fortawesome/free-solid-svg-icons'
import { Observable, Subscription } from 'rxjs'
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'
import { EnvironmentService } from 'src/app/services/environment.service'
import { FileUploadService } from 'src/app/services/file-upload.service'

enum UploadStatus {
  Pending = 'PENDING',
  Uploading = 'UPLOADING',
  Error = 'ERROR'
}

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
  imports: [FormsModule, FontAwesomeModule, MatButtonModule, MatProgressSpinnerModule]
})
export class FileUploadComponent {
  private fileUploadService = inject(FileUploadService)

  readonly disabled = input(false)
  readonly config = input({
    url: `/uploadMedia`,
    formdataName: 'image',
    formats: `image/*, video/*, audio/*, application/pdf`,
    buttonText: ``
  })
  @Output() fileUpload = new EventEmitter<WafrnMedia>()
  @Output() uploadCanceled = new EventEmitter()

  uploading = false
  uploadIcon = faFileUpload
  uploadStatus = signal<UploadStatus>(UploadStatus.Pending)
  UploadStatus = UploadStatus // Mirrored for component
  uploadProgress = signal<number>(0)
  uploadSubscription: Subscription | undefined

  async onFileSelected(event: Event) {
    const el = event.target as HTMLInputElement
    if (el.files === null || el.files.length === 0) return

    this.uploadFile(el.files[0])
  }

  uploadFile(file: File) {
    this.uploadStatus.set(UploadStatus.Uploading)
    this.uploadSubscription = this.fileUploadService
      .uploadFile(EnvironmentService.environment.baseUrl + this.config().url, file, this.config().formdataName)
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            if (event.total === undefined) return
            this.uploadProgress.set(Math.round(100 * (event.loaded / event.total)))
          }
          if (event.type === HttpEventType.Response) {
            const response = event.body
            if (response && response[0]) {
              this.fileUpload.emit(response[0])
              this.uploadProgress.set(0)
            }
            this.uploadStatus.set(UploadStatus.Pending)
          }
        },
        error: () => {
          this.uploadStatus.set(UploadStatus.Error)
        }
      })
  }

  cancelUpload() {
    this.uploadSubscription?.unsubscribe()
    this.uploadStatus.set(UploadStatus.Pending)
    this.uploadCanceled.emit()
  }
}
