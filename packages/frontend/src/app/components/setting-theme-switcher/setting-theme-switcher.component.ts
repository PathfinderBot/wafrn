import { Component, WritableSignal, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslatePipe } from '@ngx-translate/core'
import { KeyValueTypedPipe } from '../../pipes/keyvaluetyped.pipe'
import {
  ThemeService,
  LightDarkMode,
  lightDarkModeData,
  Theme,
  themeData,
  themeGroupList,
  additionalStyleModesData,
  AdditionalStyleMode
} from '../../services/theme.service'

@Component({
  selector: 'app-setting-theme-switcher',
  imports: [MatFormFieldModule, MatSelectModule, TranslatePipe, KeyValueTypedPipe],
  templateUrl: './setting-theme-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setting-theme-switcher.component.scss'
})
export class SettingThemeSwitcherComponent {
  private themeService = inject(ThemeService)

  // light/dark
  lightDarkMode: WritableSignal<LightDarkMode>
  colorThemeData = lightDarkModeData

  // colors
  colorScheme: WritableSignal<Theme>
  colorSchemeData = themeData
  colorSchemeGroupList = themeGroupList

  // style modes
  additionalStyleModes
  additionalStyleModesSelect
  additionalStyleModesData = additionalStyleModesData

  constructor() {
    const themeService = this.themeService

    this.lightDarkMode = themeService.lightDarkMode

    this.colorScheme = themeService.theme

    this.additionalStyleModes = themeService.additionalStyleModes
    this.additionalStyleModesSelect = Object.entries(this.additionalStyleModes)
      .filter(([_, enabled]) => enabled())
      .map(([val, _]) => val) as AdditionalStyleMode[]
  }

  setLightDarkMode(event: MatSelectChange) {
    this.themeService.setLightDarkMode(event.value)
  }
  setTheme(event: MatSelectChange) {
    console.log('setting theme to', event.value)
    this.themeService.setTheme(event.value)
  }
  setAdditionalStyleModes(event: MatSelectChange) {
    this.additionalStyleModesSelect = event.value as AdditionalStyleMode[]

    const allModes = Object.keys(this.additionalStyleModesData) as AdditionalStyleMode[]
    const enabledModes = this.additionalStyleModesSelect
    const disabledModes = allModes.filter((mode) => !this.additionalStyleModesSelect.includes(mode))
    enabledModes.forEach((mode) => this.additionalStyleModes[mode].set(true))
    disabledModes.forEach((mode) => this.additionalStyleModes[mode].set(false))
    this.themeService.syncAdditionalStyleMode()
  }
}
