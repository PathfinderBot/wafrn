import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { LoginService } from '../../services/login.service'
import { languageMap, supportedLanguages } from '../../lists/languages'

@Component({
  selector: 'app-setting-language-switcher',

  imports: [MatFormFieldModule, MatSelectModule, TranslatePipe],
  templateUrl: './setting-language-switcher.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setting-language-switcher.component.scss'
})
export class SettingLanguageSwitcherComponent {
  private loginService = inject(LoginService)
  private translationService = inject(TranslateService)

  allLanguages
  appLanguage: string

  languageMap = languageMap

  constructor() {
    const translationService = this.translationService

    this.allLanguages = supportedLanguages
    this.appLanguage = translationService.currentLang
  }

  setLanguage(event: MatSelectChange) {
    this.appLanguage = event.value
    this.translationService.use(this.appLanguage)
    localStorage?.setItem('appLanguage', this.appLanguage)
    this.loginService.updateUserOptions([{ name: 'wafrn.appLanguage', value: this.appLanguage }])
  }
}
