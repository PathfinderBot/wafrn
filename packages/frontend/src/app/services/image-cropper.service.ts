import { Injectable, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'

@Injectable({
  providedIn: 'root'
})
export class ImageCropperService {
  private dialogService = inject(MatDialog);


  async getImageCropperComponent(): Promise<typeof ImageCropperDlgComponent> {
    const { ImageCropperDlgComponent } = await import('../components/image-cropper-dlg/image-cropper-dlg.component')
    return ImageCropperDlgComponent
  }

  async openImageCropper(imageAspect: 'header' | 'avatar', image: File, cropFinishedCallback: (croppedImage: File) => void) {
    this.dialogService.open(await this.getImageCropperComponent(), {
      data: { imageAspect: imageAspect, image: image, cropFinishedCallback }
    })
  }
}
