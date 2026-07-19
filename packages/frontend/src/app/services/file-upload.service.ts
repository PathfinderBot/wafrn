import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { catchError, throwError } from 'rxjs'
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'
import { MessageService } from 'src/app/services/message.service'

@Injectable({
  providedIn: 'root'
})
export class FileUploadService {
  private http = inject(HttpClient);
  private messageService = inject(MessageService);


  uploadFile(url: string, file: File, formdataName: string) {
    const formData = new FormData()
    // FUCK YOU WEBKIT
    const blob = new Blob([file], { type: file.type })
    formData.append(formdataName, blob, file.name)
    return this.http.post<WafrnMedia[]>(url, formData, { reportProgress: true, observe: 'events' }).pipe(
      catchError((error) => {
        this.messageService.add({ severity: 'error', summary: 'Failed to upload.' })
        return throwError(() => error)
      })
    )
  }
}
