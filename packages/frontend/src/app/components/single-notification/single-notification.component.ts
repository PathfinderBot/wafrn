import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core'
import { RouterModule } from '@angular/router'

import { MatCardModule } from '@angular/material/card'

import { PostFragmentComponent } from '../post-fragment/post-fragment.component'
import { PostHeaderComponent } from '../post/post-header/post-header.component'
import { PostRibbonComponent } from '../post-ribbon/post-ribbon.component'
import {
  faAt,
  faCheck,
  faCircleQuestion,
  faCookieBite,
  faHeart,
  faQuoteLeft,
  faRepeat,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import { UserNotifications } from '../../interfaces/user-notifications'
import { EnvironmentService } from '../../services/environment.service'

@Component({
  selector: 'app-single-notification',
  templateUrl: './single-notification.component.html',
  styleUrls: ['./single-notification.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterModule, MatCardModule, PostFragmentComponent, PostHeaderComponent, PostRibbonComponent]
  //providers: [DateTimeToRelativePipe, DateTimeFromJsDatePipe]
})
export class SingleNotificationComponent implements OnInit {
  emojiUrl: string = ''
  @Input() notification!: UserNotifications

  notificationIcons = {
    ['MENTION']: faAt,
    ['LIKE']: faHeart,
    ['FOLLOW']: faUser,
    ['REWOOT']: faRepeat,
    ['QUOTE']: faQuoteLeft,
    ['EMOJIREACT']: faCheck,
    ['USERBITE']: faCookieBite,
    ['POSTBITE']: faCookieBite,
    ['ASK']: faCircleQuestion
  }

  constructor() {}

  ngOnInit(): void {
    if (this.notification.emojiReact) {
      this.emojiUrl = `${EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''}/api/v2/cache/emoji/${this.notification.emojiReact.uuid}`
    }
  }
}
