import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { TranslateModule } from '@ngx-translate/core'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
@Component({
  selector: 'app-enable-bluesky',
  imports: [FormsModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatInputModule, TranslateModule],
  templateUrl: './enable-bluesky.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './enable-bluesky.component.scss'
})
export class EnableBlueskyComponent {
  private loginService = inject(LoginService)
  private environmentService = inject(EnvironmentService)

  loading = false
  password = ''

  environment = signal<any>(EnvironmentService.environment)
  constructor() {
    setTimeout(() => {
      this.environment.set(EnvironmentService.environment)
    }, 500)
  }

  enableBluesky() {
    this.loading = true
    this.loginService.enableBluesky(this.password).then(() => {
      this.loading = false
    })
  }
}
