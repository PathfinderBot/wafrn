import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { MessageService } from '../../../services/message.service'
import { SimpleTitleService } from '../../../services/simple-title.service'
import { ThemeService } from '../../../services/theme.service'

@Component({
  selector: 'app-css-editor',
  imports: [MatCardModule, FormsModule, MatInputModule, MatButtonModule, TranslateModule],
  templateUrl: './css-editor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './css-editor.component.scss'
})
export class CssEditorComponent {
  private themeService = inject(ThemeService)
  private messages = inject(MessageService)
  private router = inject(Router)

  ready = false
  myCSS = ''
  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.settings.themeEditor')

    this.themeService
      .getMyThemeAsSting()
      .then((theme) => {
        this.myCSS = theme.trim()
        this.ready = true
      })
      .catch((error) => {
        console.warn(error)
        this.ready = true
      })
  }

  submit() {
    this.ready = false
    this.themeService
      .updateTheme(this.myCSS || ' ') // Backend doesn't like empty strings
      .then(async () => {
        this.ready = true
        this.messages.add({
          severity: 'success',
          summary: 'Success!'
        })
        await this.themeService.syncCustomCSS(true)
      })
      .catch((error: any) => {
        console.error(error)
        this.ready = true
        this.messages.add({
          severity: 'error',
          summary: 'Something went wrong'
        })
      })
  }
}
