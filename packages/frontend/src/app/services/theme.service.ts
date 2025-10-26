import { effect, Injectable, signal, WritableSignal } from '@angular/core'
import { LoginService } from './login.service'
import { HttpClient } from '@angular/common/http'
import { debounceTime, filter, firstValueFrom, fromEvent, merge } from 'rxjs'
import { EnvironmentService } from './environment.service'
import { SettingListItem, SettingsService } from './settings.service'

// !! NOTE FOR ADDING THEMES !! //
//
// If you want to add a theme, you must:
// - Add it to `themeVariants`
// - Fill out its `themeData` (name data and if the theme forces light/dark) entry
//   - Compatibility allows you to force dark/light if you need.
//   - Auto Reset makes the theme be reset to default on reload
// - Add the theme as a CSS file in `/assets/themes/name.css`
// - Add a link file to it in theme-manager.component.html
// - Add your theme to a group in `themeGroupList`

// !! NOTE FOR ADDING MODES !! //
//
// If you want to add a style mode, you must:
// - Add it to `additionalStyleModeVariants`
// - Fill out its `additionalStyleModesData`
// - Add a link file to it in theme-manager.component.html

const themeVariants = [
  'default',
  'tan',
  'green',
  'gold',
  'red',
  'pink',
  'purple',
  'blue',
  'rizzler',
  'contrastWater',
  'wafrn98',
  'aqua',
  'unwafrn',
  'wafrnverse',
  'dracula',
  'fan',
  'waffler',
  'catppuccin_frappe',
  'catppuccin_latte',
  'catppuccin_macchiato',
  'catppuccin_mocha',
  'cohfrn'
] as const
type ThemeTuple = typeof themeVariants
export type Theme = ThemeTuple[number]

type ThemeData = {
  [key in Theme]: {
    name: string
    compatibility: 'light' | 'dark' | 'both'
    autoReset?: boolean
  }
}

export const themeData: ThemeData = {
  default: { name: 'Default', compatibility: 'both' },
  tan: { name: 'Tan', compatibility: 'both' },
  green: { name: 'Green', compatibility: 'both' },
  gold: { name: 'Gold', compatibility: 'both' },
  red: { name: 'Red', compatibility: 'both' },
  pink: { name: 'Pink', compatibility: 'both' },
  purple: { name: 'Purple', compatibility: 'both' },
  blue: { name: 'Blue', compatibility: 'both' },
  rizzler: { name: 'Rizzler', compatibility: 'both', autoReset: true },
  contrastWater: { name: 'Contrast Water', compatibility: 'both', autoReset: true },
  wafrn98: { name: 'Wafrn98', compatibility: 'dark' },
  aqua: { name: 'Aqua', compatibility: 'light' },
  unwafrn: { name: 'Unwafrn', compatibility: 'dark' },
  wafrnverse: { name: 'Wafrnverse', compatibility: 'both' },
  dracula: { name: 'Dracula', compatibility: 'both' },
  fan: { name: 'Fan', compatibility: 'both' },
  waffler: { name: 'Waffler', compatibility: 'both' },
  cohfrn: { name: 'Cohfrn', compatibility: 'both' },
  catppuccin_frappe: { name: 'Catppuccin Frappe', compatibility: 'both' },
  catppuccin_latte: { name: 'Catppuccin Latte', compatibility: 'both' },
  catppuccin_macchiato: { name: 'Catppuccin Macchiato', compatibility: 'both' },
  catppuccin_mocha: { name: 'Catppuccin Mocha', compatibility: 'both' }
}

const themeGroupVariants = ['defaultThemes', 'computeryThemes', 'experimentalThemes', 'programmersThemes'] as const
type ThemeGroupTuple = typeof themeGroupVariants
export type ThemeGroup = ThemeGroupTuple[number]
export type ThemeGroupList = {
  [key in ThemeGroup]: {
    name: string
    entries: Theme[]
  }
}

export const themeGroupList: ThemeGroupList = {
  defaultThemes: {
    name: 'Default theme variants',
    entries: ['default', 'tan', 'green', 'gold', 'red', 'pink', 'purple', 'blue']
  },
  computeryThemes: {
    name: 'Computery themes',
    entries: ['unwafrn', 'wafrnverse', 'wafrn98', 'aqua', 'fan', 'cohfrn', 'waffler']
  },
  experimentalThemes: {
    name: 'Experimental themes',
    entries: ['rizzler', 'contrastWater']
  },
  programmersThemes: {
    name: "Programmer's Favourites",
    entries: ['dracula', 'catppuccin_latte', 'catppuccin_frappe', 'catppuccin_macchiato', 'catppuccin_mocha']
  }
}

const lightDarkModeVariants = ['light', 'dark', 'auto'] as const
type lightDarkModeTuple = typeof lightDarkModeVariants
export type LightDarkMode = lightDarkModeTuple[number]

export type LightDarkModeData = { [key in LightDarkMode]: string }
export const lightDarkModeData: LightDarkModeData = {
  light: 'Light',
  dark: 'Dark',
  auto: 'Auto'
}

// Verifying that a theme/scheme is real
function isLightDarkMode(value: string | undefined): value is LightDarkMode {
  return value !== undefined && lightDarkModeVariants.includes(value as LightDarkMode)
}

function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && themeVariants.includes(value as Theme)
}

// Covers SettingListItem[] because type jank
function isAdditionalStyleMode(value: string[] | SettingListItem[]): value is AdditionalStyleMode[] {
  return !value.some((mode) => !additionalStyleModeVariants.includes(mode as AdditionalStyleMode))
}

// More styles!
const additionalStyleModeVariants = [
  'centerLayout',
  'topToolbar',
  'horizontalMenu',
  'lowContrastSidebar',
  'oldTags',
  'colorfulTags'
] as const
type AdditionalStyleModeTuple = typeof additionalStyleModeVariants
export type AdditionalStyleMode = AdditionalStyleModeTuple[number]

type AdditionalStyleModeData = {
  [key in AdditionalStyleMode]: {
    name: string
  }
}

export const additionalStyleModesData: AdditionalStyleModeData = {
  centerLayout: { name: 'Center Layout' },
  topToolbar: { name: 'Top Toolbar' },
  horizontalMenu: { name: 'Horizontal Menu' },
  lowContrastSidebar: { name: 'Low Contrast Sidebar' },
  oldTags: { name: 'Old Tags' },
  colorfulTags: { name: 'Colorful Tags' }
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public theme = signal<Theme>('default')
  public lightDarkMode = signal<LightDarkMode>('auto')
  public additionalStyleModes: { [key in AdditionalStyleMode]: WritableSignal<boolean> } = {
    centerLayout: signal(false),
    topToolbar: signal(false),
    horizontalMenu: signal(false),
    lowContrastSidebar: signal(false),
    oldTags: signal(false),
    colorfulTags: signal(false)
  }
  public customCSS = signal<string>('') // Empty string is own theme, otherwise is the theme of the viewed blog
  public customCSSEnabled = signal(true) // Allows pages to disable it and re-enable on snappy hide

  constructor(
    private loginService: LoginService,
    private http: HttpClient,
    private settingService: SettingsService
  ) {
    // Setup when logging out and completing setting sync
    // Also watches change from other tabs
    merge(
      loginService.loggedIn,
      fromEvent(window, 'storage').pipe(
        filter((event) => ['theme', 'colorScheme'].includes((<StorageEvent>event).key ?? '')),
        debounceTime(200)
      )
    ).subscribe(() => this.setup())

    // Also run once initially
    this.setup()

    // Load and sync user custom CSS
    this.syncCustomCSS()
    effect(() => {
      this.syncCustomCSS()
    })
  }

  setup() {
    const theme = this.settingService.values().theme
    if (typeof theme === 'string' && isTheme(theme)) {
      this.setTheme(theme)
    }

    const darkLightMode = this.settingService.values().lightDarkMode
    if (typeof darkLightMode === 'string' && isLightDarkMode(darkLightMode)) {
      this.setLightDarkMode(darkLightMode)
    }

    const settingAdditionalStyleModes = this.settingService.values().additionalStyleModes
    if (Array.isArray(settingAdditionalStyleModes) && isAdditionalStyleMode(settingAdditionalStyleModes)) {
      additionalStyleModeVariants.forEach((mode) => {
        const enabled = settingAdditionalStyleModes.includes(mode)
        this.additionalStyleModes[mode].set(enabled)
      })
    }

    // Fan theme fallback for old browsers
    const chromeVersionForCompatibilityReasons = this.getChromeVersion()
    if (chromeVersionForCompatibilityReasons && chromeVersionForCompatibilityReasons < 122) {
      // we force the fan theme on old browsers
      this.setTheme('fan', true)
    }
  }

  public setTheme = async (theme: Theme, doNotSavePreference = false) => {
    this.theme.set(theme)
    this.settingService.values().theme = theme
    this.settingService.values.update((v) => v)

    // Forced lightDarkMode
    if (themeData[theme]?.compatibility === 'light') await this.setLightDarkMode('light')
    if (themeData[theme]?.compatibility === 'dark') await this.setLightDarkMode('dark')

    this.settingService.forceUpdateValue('theme', !doNotSavePreference)
  }

  public setLightDarkMode = async (lightDarkMode: LightDarkMode, doNotSavePreference = false) => {
    this.lightDarkMode.set(lightDarkMode)
    this.settingService.values().lightDarkMode = lightDarkMode
    this.settingService.values.update((v) => v)

    document.documentElement.setAttribute('data-theme', lightDarkMode)
    this.settingService.forceUpdateValue('lightDarkMode', !doNotSavePreference)
  }

  // When setting additionalStyleMode either call the set method here or modify and call sync afterwards if modifying many settings at once.
  public setAdditionalStyleMode = async (mode: AdditionalStyleMode, value: boolean, doNotSavePreference = false) => {
    this.additionalStyleModes[mode].set(value)
    this.syncAdditionalStyleModeSettings()

    this.settingService.forceUpdateValue('additionalStyleModes', !doNotSavePreference)
  }

  public syncAdditionalStyleMode() {
    this.syncAdditionalStyleModeSettings()

    this.settingService.forceUpdateValue('additionalStyleModes')
  }

  // Helper to sync up the settings service values and theme service values
  private syncAdditionalStyleModeSettings() {
    const modes = Object.entries(this.additionalStyleModes)
      .filter(([_, enabled]) => enabled())
      .map(([val, _]) => val)

    this.settingService.values().additionalStyleModes = modes
    this.settingService.values.update((v) => v)
  }

  public async toggleAdditionalStyleMode(mode: AdditionalStyleMode, doNotSavePreference = false) {
    this.setAdditionalStyleMode(mode, !this.additionalStyleModes[mode](), doNotSavePreference)
  }

  getChromeVersion() {
    var raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)

    return raw ? parseInt(raw[2], 10) : false
  }

  //
  // CUSTOM CSS STUFF
  //

  async syncCustomCSS() {
    const isOwnCSS = this.customCSS() === ''
    if (isOwnCSS && this.loginService.loggedIn.value) {
      this.customCSSLinkElement().href = this.getThemeUrl(this.loginService.getLoggedUserUUID())
      return
    }

    // Someone else's CSS, check if we want to use it and if it exists
    if (this.settingService.values().useOtherUserCustomThemes !== true) return

    const themeExists = await this.themeExists(this.customCSS())
    if (!themeExists) return

    // We want to use it and it exists
    this.customCSSLinkElement().href = this.getThemeUrl(this.customCSS())
  }

  // Get or create custom CSS link element
  private customCSSLinkElement(): HTMLLinkElement {
    // If it exists, return it
    const existingElement = document.getElementById(this.linkElementID())
    if (existingElement) return <HTMLLinkElement>existingElement

    // Otherwise, create it and return it
    const linkEl = document.createElement('link')
    linkEl.setAttribute('rel', 'stylesheet')
    linkEl.id = this.linkElementID()
    document.head.appendChild(linkEl)
    return linkEl
  }

  // arbitrary ID to give the theme link element
  // If it collides with some random extension element just add more text
  private linkElementID(): string {
    return 'app-custom-css-link'
  }

  // Shorthand for the theme location in the media URL
  private getThemeUrl(theme: string): string {
    return `${EnvironmentService.environment.baseUrl}/uploads/themes/${theme}.css`
  }

  async themeExists(theme: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.get(`${EnvironmentService.environment.baseUrl}/uploads/themes/${theme}.css`, {
        responseType: 'text'
      })
    )
    return res !== undefined && res.length > 0
  }

  // CSS editor stuff

  updateTheme(newTheme: string) {
    return firstValueFrom(this.http.post(`${EnvironmentService.environment.baseUrl}/updateCSS`, { css: newTheme }))
  }

  async getMyThemeAsSting(): Promise<string> {
    let res = ''
    try {
      const themeResponse = await firstValueFrom(
        this.http.get(
          `${EnvironmentService.environment.baseUrl}/uploads/themes/${this.loginService.getLoggedUserUUID()}.css`,
          {
            responseType: 'text'
          }
        )
      )
      if (themeResponse && themeResponse.length > 0) {
        res = themeResponse
      }
    } catch (error) {}
    return res
  }
}
