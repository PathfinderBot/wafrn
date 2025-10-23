import { effect, Injectable, signal } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import { GlobalData } from './global-data.service'
import { NotificationsService } from './notifications.service'
import { toObservable } from '@angular/core/rxjs-interop'
import { merge } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class SimpleTitleService {
  // Last set value so we can have notifications sync
  private title = signal('')

  constructor(
    private titleService: Title,
    private translate: TranslateService,
    private notifications: NotificationsService
  ) {
    merge(toObservable(this.notifications.totalNotifications), toObservable(this.title)).subscribe(() => {
      this.syncTitle()
    })
  }

  /**
   * Sets the page title given a translation key
   */
  set(title: string) {
    this.title.set(title)
  }

  private syncTitle() {
    if (!this.title()) return
    const notificationsFormatted = this.notifications.totalNotifications()
      ? `(${this.notifications.totalNotifications()}) `
      : ''
    this.translate.get(this.title()).subscribe((res) => {
      this.titleService.setTitle(`${notificationsFormatted}${res} — ${GlobalData.appDefaultTitle}`)
    })
  }
}
