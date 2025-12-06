import { Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { faLock } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from 'src/app/services/environment.service'
import { LoginService } from 'src/app/services/login.service'

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  standalone: false
})
export class ResetPasswordComponent {
  private loginService = inject(LoginService);
  private activeRoute = inject(ActivatedRoute);

  newPassword: string = ''
  logo = EnvironmentService.environment.logo
  loading = false
  icon = faLock

  async resetPassword() {
    this.loading = true
    const params = this.activeRoute.snapshot.params
    await this.loginService.resetPassword(params['email'], params['resetCode'], this.newPassword)
    this.loading = false
  }
}
