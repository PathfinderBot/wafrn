import { Component, signal, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faWarning } from '@fortawesome/free-solid-svg-icons'
import { TranslatePipe } from '@ngx-translate/core'
import { InfoCardComponent } from '../info-card/info-card.component'
import { MatExpansionModule } from '@angular/material/expansion'
import { LoginService } from 'src/app/services/login.service'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'

@Component({
  selector: 'app-setting-delete-account',
  imports: [
    MatExpansionModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FontAwesomeModule,
    InfoCardComponent,
    TranslatePipe
  ],
  templateUrl: './setting-delete-account.component.html',
  styleUrl: './setting-delete-account.component.scss'
})
export class SettingDeleteAccountComponent {
  private loginService = inject(LoginService);

  password: string = ''
  loading = signal(false)

  warnIcon = faWarning

  handleInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.password = target.value
    }
  }

  async requestDeleteAccount() {
    this.loading.set(true)
    const success = await this.loginService.deleteAccount(this.password)
    if (success) {
      this.loginService.logOutAccount(this.loginService.accountList()[0].token)
    }
    this.loading.set(false)
  }
}
