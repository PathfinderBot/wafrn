import { Component, signal, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { EnvironmentService } from 'src/app/services/environment.service'
import { LoginService } from 'src/app/services/login.service'
import { TranslateModule } from '@ngx-translate/core'
@Component({
  selector: 'app-enable-bluesky',
  imports: [FormsModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatInputModule, TranslateModule],
  templateUrl: './enable-bluesky.component.html',
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
