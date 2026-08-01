import { ChangeDetectorRef, Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { Follower } from '../../interfaces/follower'
import { Reblog } from '../../interfaces/reblog'
import { UserNotifications } from '../../interfaces/user-notifications'
import { NotificationsService } from '../../services/notifications.service'
import { SimpleTitleService } from '../../services/simple-title.service'

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class NotificationsComponent implements OnInit {
  private notificationsService = inject(NotificationsService)
  private cdr = inject(ChangeDetectorRef)

  page = 0
  follows: Follower[] = []
  likes: Reblog[] = []
  reblogs: Reblog[] = []
  mentions: Reblog[] = []
  quotes: Reblog[] = []
  emojiReacts: UserNotifications[] = []
  observer: IntersectionObserver

  seen = {
    follows: 0,
    likes: 0,
    reblogs: 0,
    mentions: 0,
    total: 0
  }

  notificationsToShow: UserNotifications[] = []

  constructor() {
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.notifications')

    this.observer = new IntersectionObserver((intersectionEntries: IntersectionObserverEntry[]) => {
      if (intersectionEntries.some((elem) => elem.isIntersecting)) {
        this.page = this.page + 1
        this.loadNotificationsV2(this.page)
      }
    })
  }

  reload() {
    this.page = 0
    this.notificationsToShow = []
    this.ngOnInit()
  }

  async ngOnInit(): Promise<void> {
    // window.scrollTo(0, 0)
    localStorage.setItem('lastTimeCheckNotifications', new Date().toISOString())
    await this.loadNotificationsV2(0)
    this.notificationsService.updateCount()
  }

  async loadNotificationsV2(page: number) {
    console.log(window.location.href)
    const notifications = await this.notificationsService.getNotificationsScrollV2(
      page,
      window.location.href.endsWith('detached')
    )
    // this waythe whole object is not recreated from scratch
    notifications.forEach((notif) => this.notificationsToShow.push(notif))
    setTimeout(() => {
      const elements = document.querySelectorAll('.load-more-notifications-intersector')
      if (elements) {
        elements.forEach((element) => {
          this.observer.observe(element)
        })
      } else {
        console.log('observer not ready')
      }
    })
    this.cdr.detectChanges()
  }

  reblogToNotification(
    reblog: Reblog,
    type: 'MENTION' | 'LIKE' | 'EMOJIREACT' | 'REWOOT' | 'QUOTE' | 'FOLLOW' | 'USERBITE' | 'POSTBITE'
  ): UserNotifications {
    if (!reblog.user) {
      console.log(`ERROR WITH ${type}`)
    }
    return {
      url: `/fediverse/post/${reblog.id}`,
      avatar: reblog.user.avatar,
      date: reblog.createdAt,
      type: type,
      userUrl: reblog.user.url,
      fragment: reblog.content,
      emojiName: reblog.emojiName,
      emojiReact: reblog.emojiReact,
      userName: reblog.user.name,
      userId: reblog.user.id
    }
  }
}
