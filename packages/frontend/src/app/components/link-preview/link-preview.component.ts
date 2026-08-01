import {
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy
} from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { CommonModule } from '@angular/common'
import { MediaService } from '../../services/media.service'
import { EnvironmentService } from '../../services/environment.service'
@Component({
  selector: 'app-link-preview',
  imports: [CommonModule, MatCardModule],
  templateUrl: './link-preview.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './link-preview.component.scss'
})
export class LinkPreviewComponent implements OnChanges {
  private mediaService = inject(MediaService)
  private cdr = inject(ChangeDetectorRef)

  @Input() link: string = ''

  loading = true
  url = ''
  hostname = ''
  title = ''
  description = ''
  img = ''
  favicon: string | undefined = ''
  forceTenorGif = false
  forceYoutube = false

  ngOnChanges(changes: SimpleChanges): void {
    try {
      this.forceTenorGif = false
      this.forceYoutube = false
      if (this.link) {
        if (this.url.startsWith('https://media.tenor.com/') || this.url.startsWith('https://static.klipy.com')) {
          this.loading = false
          this.forceTenorGif = true
          return
        }
        this.loading = true
        const cacheDomain = EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''
        try {
          this.url = this.link
        } catch (error) {
          this.url = this.link
          console.log(this.link)
        }

        this.hostname = new URL(this.url).hostname
        this.mediaService.getLinkPreview(this.url).then((data) => {
          this.favicon = cacheDomain + '/api/v2/cache/favicon/' + encodeURIComponent(this.url)
          this.loading = false
          if (data.images && data.images.length) {
            this.img = cacheDomain + '/api/v2/cache/imageurl/' + encodeURIComponent(this.url)
          }
          if (!this.img && data.favicons && data.favicons.length) {
            this.img = this.favicon
          }
          let sitenamePrefix = ''
          if (data.siteName) {
            sitenamePrefix = data.siteName + ' - '
          }
          if (data.title) {
            this.title = sitenamePrefix + data.title
          }
          if (data.description) {
            this.description = data.description
          }
          this.cdr.detectChanges()
        })
      }
    } catch (error) {}
  }
}
