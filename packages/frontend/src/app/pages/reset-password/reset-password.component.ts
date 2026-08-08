import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule } from '@ngx-translate/core'
import { faLock } from '@fortawesome/free-solid-svg-icons'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'

@Component({
  selector: 'app-reset-password',
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
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ResetPasswordComponent {
  private loginService = inject(LoginService)
  private activeRoute = inject(ActivatedRoute)

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
