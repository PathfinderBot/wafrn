import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { Router } from '@angular/router'
import { LoginService } from '../../services/login.service'

@Component({
  selector: 'app-home-redirector',
  imports: [],
  templateUrl: './home-redirector.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-redirector.component.scss'
})
export class HomeRedirectorComponent {
  private router = inject(Router)

  constructor() {
    const loginService = inject(LoginService)

    if (!loginService.loggedIn.value) {
      this.router.navigate(['/dashboard/exploreLocal'])
    }
  }
}
