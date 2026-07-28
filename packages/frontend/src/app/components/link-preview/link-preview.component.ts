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
        const linkToGet = this.link.startsWith(EnvironmentService.environment.externalCacheurl)
        try {
          this.url = linkToGet
            ? (new URL(this.link, EnvironmentService.environment.frontUrl).searchParams.get('media') as string)
            : this.link
        } catch (error) {
          this.url = this.link
          console.log(this.link)
        }

        this.hostname = new URL(this.url).hostname
        this.mediaService.getLinkPreview(this.url).then((data) => {
          this.favicon = EnvironmentService.environment.externalCacheurl + encodeURIComponent(data.favicons.at(0))
          this.loading = false
          if (data.images && data.images.length) {
            this.img = EnvironmentService.environment.externalCacheurl + encodeURIComponent(data.images[0])
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
