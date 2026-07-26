import { Component, inject, input, Signal, ViewEncapsulation, WritableSignal } from '@angular/core'
import { InjectHtmlModule } from 'src/app/directives/inject-html/inject-html.module'
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'
import { Theme, LightDarkMode, AdditionalStyleMode, ThemeService } from 'src/app/services/theme.service'

@Component({
  selector: 'app-post-html-content',
  imports: [InjectHtmlModule],
  templateUrl: './post-html-content.component.html',
  styleUrl: './post-html-content.component.scss',
  encapsulation: ViewEncapsulation.ShadowDom
})
export class PostHtmlContentComponent {
  colorScheme: Signal<Theme>
  theme: Signal<LightDarkMode>
  additionalStyleModes: { [key in AdditionalStyleMode]: WritableSignal<boolean> }
  fragment = input.required<string | WafrnMedia>()

  constructor() {
    const themeService = inject(ThemeService)

    this.colorScheme = themeService.theme
    this.theme = themeService.lightDarkMode
    this.additionalStyleModes = themeService.additionalStyleModes
  }
}
