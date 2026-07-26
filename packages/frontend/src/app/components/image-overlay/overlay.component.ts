import { Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { DATA_TOKEN, ImageOverlayData, KillscreenOverlayData } from 'src/app/services/overlay.service'

@Component({
  selector: 'app-image-overlay',
  imports: [],
  templateUrl: './image-overlay.component.html',
  styleUrl: './overlay.component.scss'
})
export class ImageOverlayComponent {
  url: string
  backgroundSize: string

  constructor() {
    const data = inject<ImageOverlayData>(DATA_TOKEN)

    this.url = data.url
    this.backgroundSize = data.backgroundSize
  }
}

@Component({
  selector: 'app-killscreen-overlay',
  imports: [TranslateModule],
  templateUrl: './killscreen-overlay.component.html',
  styleUrl: './overlay.component.scss'
})
export class KillscreenOverlayComponent {
  survivedCount: number

  constructor() {
    const data = inject<KillscreenOverlayData>(DATA_TOKEN)

    this.survivedCount = data.survivedCount
  }
}
