import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { UntypedFormGroup, UntypedFormControl, Validators } from '@angular/forms'
import { faUser, faEye, faEyeSlash, faArrowRightToBracket, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'

const loginMessageVariants: string[] = [
  '// TODO: make login screen better',
  "I forgot what to put here, here's a debug message",
  'loading message of the day...',
  'waf waf waf (...) waf;',
  '() => "funny login message"',
  'assert(<MessageOfTheDay>"hi")',
  'echo "echo wafrn" >> ~/.bashrc',
  'click to add subtitle'
]

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class LoginComponent implements OnInit {
  private loginService = inject(LoginService)
  private messages = inject(MessageService)

  faArrowRightToBracket = faArrowRightToBracket
  faUser = faUser
  faEye = faEye
  faEyeSlash = faEyeSlash
  submitIcon = faArrowRight

  showPassword = false // Property to track password visibility

  loginForm = new UntypedFormGroup({
    email: new UntypedFormControl('', [Validators.required, Validators.email]),
    password: new UntypedFormControl('', [Validators.required])
  })

  loginMessage = "you shouldn't see this ever"
  loginReset = false

  constructor() {
    this.newLoginMessage()
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.resetLoginAnimation()
    }, 300)
  }

  refreshLoginMessage() {
    this.newLoginMessage()
    this.resetLoginAnimation()
  }

  newLoginMessage() {
    const crypto = window.crypto
    const randArr = new Uint32Array(1)
    crypto.getRandomValues(randArr)
    this.loginMessage = loginMessageVariants[randArr[0] % loginMessageVariants.length]
  }

  resetLoginAnimation() {
    this.loginReset = false
    setTimeout(() => {
      this.loginReset = true
    }, 0)
  }

  async onSubmit() {
    this.loginForm.disable()
    try {
      const login = await this.loginService.logIn(this.loginForm)
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
    this.loginForm.enable()
  }

  // Toggle password visibility
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword
  }
}
