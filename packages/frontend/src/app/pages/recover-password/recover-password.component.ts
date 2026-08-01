import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-recover-password',
  templateUrl: './recover-password.component.html',
  styleUrls: ['./recover-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class RecoverPasswordComponent {
  private loginService = inject(LoginService)
  private messageService = inject(MessageService)

  loading = false
  logo = EnvironmentService.environment.logo
  icon = faUser

  loginForm = new UntypedFormGroup({
    email: new UntypedFormControl('', [Validators.required, Validators.email])
  })

  async onSubmit() {
    this.loading = true
    await this.loginService.requestPasswordReset(this.loginForm.value.email)
    this.loading = false
  }
}
