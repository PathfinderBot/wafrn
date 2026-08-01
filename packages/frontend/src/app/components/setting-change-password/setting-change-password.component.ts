import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatExpansionModule } from '@angular/material/expansion'
import { TranslatePipe } from '@ngx-translate/core'
import { JwtService } from '../../services/jwt.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-setting-change-password',
  imports: [MatButtonModule, MatExpansionModule, TranslatePipe],
  templateUrl: './setting-change-password.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setting-change-password.component.scss'
})
export class SettingChangePasswordComponent {
  private loginService = inject(LoginService)
  private jwt = inject(JwtService)
  private messageService = inject(MessageService)

  loading = signal(false)

  async changePassword() {
    const email = this.jwt.getTokenData()?.email
    if (!email) return

    this.loading.set(true)

    await this.loginService.requestPasswordReset(email, false)
    this.messageService.add({
      severity: 'info',
      summary: 'settings.changePasswordMessage',
      translate: true
    })

    this.loading.set(false)
  }
}
