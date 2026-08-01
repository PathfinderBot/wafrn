import { Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, Subject } from 'rxjs'
import { OverlayService } from 'src/app/services/overlay.service'

@Component({
  selector: 'app-crash-button',
  imports: [MatButtonModule, TranslateModule],
  templateUrl: './crash-button.component.html',
  styleUrl: './crash-button.component.scss'
})
export class CrashButtonComponent {
  private overlayService = inject(OverlayService)

  survivedCount = 0
  clearTextTimeout = new Subject<void>()
  survivedTextList: number[] = []

  constructor() {
    this.clearTextTimeout.pipe(debounceTime(2000)).subscribe(() => {
      this.survivedTextList.length = 0
    })
  }

  rollToDie() {
    // SECURE AND COMPLETELY RANDOMIZED DEATH CHANCE!!!
    const crypto = window.crypto || window.Crypto
    const randArr = new Uint32Array(1)
    crypto.getRandomValues(randArr)
    const randomNumber = randArr[0]

    if (randomNumber % 6 === 0) {
      this.overlayService.createKillscreenOverlay(this.survivedCount)
      return
    }

    this.survivedTextList.push(this.survivedCount)
    this.survivedCount += 1
  }
}
