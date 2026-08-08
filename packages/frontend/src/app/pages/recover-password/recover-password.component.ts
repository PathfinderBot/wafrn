import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule, UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule } from '@ngx-translate/core'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

@Component({
  selector: 'app-recover-password',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FontAwesomeModule,
    TranslateModule
  ],
  templateUrl: './recover-password.component.html',
  styleUrls: ['./recover-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
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
