import { Injectable, inject } from '@angular/core'
import { Meta, MetaDefinition } from '@angular/platform-browser'
import { EnvironmentService } from './environment.service'

@Injectable({
  providedIn: 'root'
})
export class SimpleSeoService {
  private metaTagService = inject(Meta)

  setSEOTags(title: string, description: string, author: string, image: string): void {
    const sanitizedDescription = description
    const tags: MetaDefinition[] = [
      { name: 'description', content: sanitizedDescription },
      { name: 'author', content: author },
      { name: 'image', content: image },
      { name: 'og:description', content: sanitizedDescription },
      { name: 'og:author', author },
      { name: 'og:image', content: image },
      { name: 'og:title', content: title },
      { name: 'og:site_name', content: EnvironmentService.environment.frontUrl },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:site', content: EnvironmentService.environment.frontUrl },
      { name: 'twitter:description', content: sanitizedDescription },
      { name: 'twitter:image', content: image }
    ]
    this.metaTagService.addTags(tags)
  }
}
