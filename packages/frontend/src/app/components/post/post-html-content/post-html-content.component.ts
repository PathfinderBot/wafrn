import {
  Component,
  inject,
  input,
  Signal,
  ViewEncapsulation,
  WritableSignal,
  ChangeDetectionStrategy
} from '@angular/core'
import { InjectHTMLDirective } from '../../../directives/inject-html/inject-html.directive'
import { WafrnMedia } from '../../../interfaces/wafrn-media'
import { Theme, LightDarkMode, AdditionalStyleMode, ThemeService } from '../../../services/theme.service'

@Component({
  selector: 'app-post-html-content',
  imports: [InjectHTMLDirective],
  templateUrl: './post-html-content.component.html',
  styleUrl: './post-html-content.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
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
