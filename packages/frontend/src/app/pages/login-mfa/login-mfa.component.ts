import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule, UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule } from '@ngx-translate/core'
import { faUser, faArrowRightToBracket, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-login',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FontAwesomeModule,
    TranslateModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './login-mfa.component.html',
  styleUrls: ['./login-mfa.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
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
