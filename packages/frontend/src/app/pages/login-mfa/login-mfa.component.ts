import { Component, OnInit, inject } from '@angular/core'
import { LoginService } from 'src/app/services/login.service'

import { UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { MessageService } from 'src/app/services/message.service'
import { faUser, faEye, faEyeSlash, faArrowRightToBracket, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from 'src/app/services/environment.service'

@Component({
  selector: 'app-login',
  templateUrl: './login-mfa.component.html',
  styleUrls: ['./login-mfa.component.scss'],
  standalone: false
})
export class LoginMfaComponent implements OnInit {
  private loginService = inject(LoginService)
  private messages = inject(MessageService)
  private router = inject(Router)

  loading = false
  logo = EnvironmentService.environment.logo
  faUser = faUser
  faArrowRightToBracket = faArrowRightToBracket
  submitIcon = faArrowRight

  loginMfaForm = new UntypedFormGroup({
    token: new UntypedFormControl('', [Validators.required])
  })

  ngOnInit(): void {}

  async onSubmit() {
    this.loginMfaForm.disable()
    try {
      const login = await this.loginService.logInMfa(this.loginMfaForm)
      if (!login) {
        this.messages.add({
          severity: 'warn',
          summary: 'Login failed'
        })
      }
    } catch (exception) {
      console.error(exception)
      this.messages.add({
        severity: 'error',
        summary: 'Something failed!'
      })
    }
    this.loginMfaForm.enable()
  }
}
