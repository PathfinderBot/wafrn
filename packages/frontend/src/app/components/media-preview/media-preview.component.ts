import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { WafrnMedia } from '../../interfaces/wafrn-media'
import { EnvironmentService } from '../../services/environment.service'

@Component({
  selector: 'app-media-preview',
  templateUrl: './media-preview.component.html',
  styleUrls: ['./media-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatProgressSpinnerModule]
})
export class MediaPreviewComponent implements OnInit {
  @Input() media!: WafrnMedia
  baseMediaUrl = EnvironmentService.environment.baseMediaUrl
  baseUrl = EnvironmentService.environment.baseUrl
  success = false
  elemUrl = ''

  ngOnInit(): void {
    this.updateMediaUrl()
    this.success = true
  }

  imageLoadFailed(error: any) {
    this.success = false
    setTimeout(() => {
      this.updateMediaUrl(true)
      this.success = true
    }, 1000)
  }

  updateMediaUrl(forceTimestamp = false) {
    this.elemUrl =
      (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/media/' +
      this.media.id
    if (forceTimestamp) {
      this.elemUrl = this.elemUrl + `?date=${new Date().getTime()}`
    }
  }
}
