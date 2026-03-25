import { CommonModule } from '@angular/common'
import { AfterViewInit, Component, ElementRef, inject, input, ViewEncapsulation } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { InjectHtmlModule } from 'src/app/directives/inject-html/inject-html.module'
import { PostLinkModule } from 'src/app/directives/post-link/post-link.module'
import { ProcessedPost } from 'src/app/interfaces/processed-post'
import { SimplifiedUser } from 'src/app/interfaces/simplified-user'
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'
import { PollModule } from '../poll/poll.module'
import { WafrnMediaModule } from '../wafrn-media/wafrn-media.module'
import {  } from 'src/app/services/posts.service'
import { SettingsService } from 'src/app/services/settings.service'

type FragmentType = 'post' | 'quote'

type EmojiReaction = {
  id: string
  content: string
  img?: string
  external: boolean
  name: string
  users: SimplifiedUser[]
  tooltip: string
  includesMe: boolean
}

@Component({
  selector: 'app-post-content',
  templateUrl: './post-content.component.html',
  imports: [
    CommonModule,
    PollModule,
    WafrnMediaModule,
    RouterModule,
    MatButtonModule,
    MatTooltipModule,
    InjectHtmlModule,
    PostLinkModule,
    TranslateModule
  ],
  styleUrl: './post-content.component.scss',
  encapsulation: ViewEncapsulation.ShadowDom
})
export class PostContentComponent implements AfterViewInit {
  protected settingsService = inject(SettingsService)

  fragment = input.required<ProcessedPost>()
  block = input.required<string | WafrnMedia>()
  mentionPosts: string[] = []
  availableEmojiNames: Set<string> = new Set()

  sanitizedContent = ''
  noTagsContent = ''

  seenMedia: number[] = []

  constructor(private el: ElementRef) {}

  private intersectionObserver?: IntersectionObserver

  ngAfterViewInit() {
    // this is very janky, but it works

    const shadowRoot = this.el.nativeElement.shadowRoot
    if (!shadowRoot) return

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const sheets = Array.from(document.styleSheets)
          sheets.forEach((sheet) => {
            try {
              const newSheet = new CSSStyleSheet()
              const rules = Array.from(sheet.cssRules)
                .map((r) => r.cssText)
                .join('\n')
              newSheet.replaceSync(rules)
              shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, newSheet]
            } catch (e) {
              const linkEl = document.createElement('link')
              linkEl.rel = 'stylesheet'
              linkEl.href = (sheet as CSSStyleSheet & { href: string }).href
              shadowRoot.appendChild(linkEl)
            }
          })
        } else {
          shadowRoot.adoptedStyleSheets = []
        }
      },
      { rootMargin: '500px' }
    )

    this.intersectionObserver.observe(this.el.nativeElement)
  }

  ngOnDestroy() {
    this.intersectionObserver?.disconnect()
  }
}
