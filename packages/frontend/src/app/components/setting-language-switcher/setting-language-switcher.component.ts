import { Component, inject } from '@angular/core'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatSelectChange, MatSelectModule } from '@angular/material/select'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { languageMap, SupportedLanguage, supportedLanguages } from 'src/app/lists/languages'
import { LoginService } from 'src/app/services/login.service'

@Component({
  selector: 'app-setting-language-switcher',

  imports: [MatFormFieldModule, MatSelectModule, TranslatePipe],
  templateUrl: './setting-language-switcher.component.html',
  styleUrl: './setting-language-switcher.component.scss'
})
export class SettingLanguageSwitcherComponent {
  private loginService = inject(LoginService);
  private translationService = inject(TranslateService);

  allLanguages
  appLanguage: string

  languageMap = languageMap

  constructor() {
    const translationService = this.translationService;

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
