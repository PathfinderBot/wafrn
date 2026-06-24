import { CommonModule, NgClass } from '@angular/common';
import { Component, Signal, WritableSignal, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faPalette } from '@fortawesome/free-solid-svg-icons'
import {
  AdditionalStyleMode,
  additionalStyleModesData,
  Theme,
  themeData,
  themeGroupList,
  ThemeGroupList,
  LightDarkMode,
  lightDarkModeData,
  ThemeService
} from 'src/app/services/theme.service'
import { TranslatePipe } from '@ngx-translate/core'

// !! NOTE FOR ADDING THEMES !! //
//
// Themes have been moved to theme-manager.component.ts and are now fully data!

@Component({
  selector: 'app-color-scheme-switcher',
  imports: [
    CommonModule,
    MatMenuModule,
    MatButtonModule,
    MatTooltipModule,
    FaIconComponent,
    MatCheckboxModule,
    NgClass,
    TranslatePipe
  ],
  templateUrl: './color-scheme-switcher.component.html',
  styleUrl: './color-scheme-switcher.component.scss'
})
export class ColorSchemeSwitcherComponent {
  colorScheme: Signal<Theme>
  theme: Signal<LightDarkMode>
  additionalStyleModes: { [key in AdditionalStyleMode]: WritableSignal<boolean> }

  // Data copies
  themeData = themeData
  lightDarkModeData = lightDarkModeData
  additionalStyleModesData = additionalStyleModesData

  // Function copies
  setColorScheme: Function
  setTheme: Function
  toggleAdditionalStyleMode: Function

  // Theme categories
  colorSchemeGroupList: ThemeGroupList

  // Icons
  paletteIcon = faPalette

  // Light/Dark mode
  iconClass = ''

  constructor() {
    const themeService = inject(ThemeService);

    this.colorScheme = themeService.theme
    this.theme = themeService.lightDarkMode
    this.additionalStyleModes = themeService.additionalStyleModes

    this.setColorScheme = themeService.setTheme.bind(themeService)
    this.setTheme = themeService.setLightDarkMode.bind(themeService)
    this.toggleAdditionalStyleMode = themeService.toggleAdditionalStyleMode.bind(themeService)

    this.colorSchemeGroupList = themeGroupList

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.updateIconTheme.bind(this))
  }

  updateIconTheme() {
    if (
      this.theme() === 'dark' ||
      (this.theme() === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      this.iconClass = 'theme-toggle--toggled'
    } else {
      this.iconClass = ''
    }
  }
}
