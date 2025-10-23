import { Injectable } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'
import { AudioName, AudioService } from './audio.service'
import { TranslateService } from '@ngx-translate/core'

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  constructor(
    private translateService: TranslateService,
    private snackBar: MatSnackBar,
    private audioService: AudioService
  ) {}

  add(message: {
    severity: 'error' | 'success' | 'warn' | 'info'
    summary: string
    translate?: true
    soundName?: AudioName
  }) {
    if (localStorage.getItem('disableSounds') != 'true' && message.soundName) {
      this.audioService.playSound(message.soundName)
    }
    let icon = ''
    switch (message.severity) {
      case 'warn':
      case 'error':
        icon = '❌'
        break
      default:
        icon = '✅'
    }

    const summary = message.translate ? this.translateService.instant(message.summary) : message.summary

    this.snackBar.open(summary, icon, {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    })
  }
}
