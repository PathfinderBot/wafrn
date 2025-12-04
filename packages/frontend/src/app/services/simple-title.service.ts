import { effect, Injectable, signal, inject } from '@angular/core'
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
  private titleService = inject(Title);
  private translate = inject(TranslateService);
  private notifications = inject(NotificationsService);

  // Last set value so we can have notifications sync
  private title = signal('')

  constructor() {
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
