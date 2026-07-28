import { Component, Signal, WritableSignal, inject, ChangeDetectionStrategy } from '@angular/core'
import { AdditionalStyleMode, Theme, LightDarkMode, ThemeService } from '../../services/theme.service'

@Component({
  selector: 'app-theme-manager',
  imports: [],
  templateUrl: './theme-manager.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './theme-manager.component.scss'
})
export class ThemeManagerComponent {
  colorScheme: Signal<Theme>
  theme: Signal<LightDarkMode>
  additionalStyleModes: { [key in AdditionalStyleMode]: WritableSignal<boolean> }

  constructor() {
    const themeService = inject(ThemeService)

    this.colorScheme = themeService.theme
    this.theme = themeService.lightDarkMode
    this.additionalStyleModes = themeService.additionalStyleModes
  }
}
