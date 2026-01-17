import { CommonModule } from '@angular/common'
import { Component, OnChanges, input, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import {
  faArrowUpRightFromSquare,
  faChevronDown,
  faClose,
  faEnvelope,
  faGlobe,
  faHeart,
  faHeartBroken,
  faPen,
  faQuoteLeft,
  faRepeat,
  faReply,
  faServer,
  faShareNodes,
  faTrash,
  faUnlock,
  faUser,
  faNewspaper,
  faRobot
} from '@fortawesome/free-solid-svg-icons'
import { DateTime } from 'luxon'
import { PostLinkModule } from 'src/app/directives/post-link/post-link.module'
import { ProcessedPost } from '../../../interfaces/processed-post'
import { LoginService } from '../../../services/login.service'
import { MessageService } from '../../../services/message.service'
import { PostsService } from '../../../services/posts.service'
import { AvatarSmallComponent } from '../../avatar-small/avatar-small.component'
import { PostActionsComponent } from '../../post-actions/post-actions.component'
import { BlogLinkModule } from 'src/app/directives/blog-link/blog-link.module'
import { TranslatePipe } from '@ngx-translate/core'
import { SimpleDialogService } from 'src/app/services/simple-dialog.service'

@Component({
  selector: 'app-post-header',
  imports: [
    CommonModule,
    RouterModule,
    AvatarSmallComponent,
    PostActionsComponent,
    MatTooltipModule,
    FontAwesomeModule,
    MatButtonModule,
    MatTooltipModule,
    PostLinkModule,
    BlogLinkModule,
    TranslatePipe
  ],
  templateUrl: './post-header.component.html',
  styleUrl: './post-header.component.scss'
})
export class PostHeaderComponent implements OnChanges {
  postService = inject(PostsService);
  private messages = inject(MessageService);
  private simpleDialog = inject(SimpleDialogService);
  protected loginService = inject(LoginService);

  fragment = input.required<ProcessedPost>()
  readonly simplified = input<boolean>(true)
  readonly disableLink = input<boolean>(false)
  readonly headerText = input<string>('')

  // table for the icons. ATTENTION, PRIVACY 10 IS SET ON CONSTRUCTOR
  privacyOptions = [
    { level: 0, name: 'Public', icon: faGlobe },
    { level: 1, name: 'Followers only', icon: faUser },
    { level: 2, name: 'This instance only', icon: faServer },
    { level: 3, name: 'Unlisted', icon: faUnlock }
  ]

  // icons
  shareIcon = faShareNodes
  expandDownIcon = faChevronDown
  solidHeartIcon = faHeart
  clearHeartIcon = faHeartBroken
  reblogIcon = faReply
  quickReblogIcon = faRepeat
  quoteIcon = faQuoteLeft
  shareExternalIcon = faArrowUpRightFromSquare
  deleteIcon = faTrash
  closeIcon = faClose
  worldIcon = faGlobe
  unlockIcon = faUnlock
  envelopeIcon = faEnvelope
  serverIcon = faServer
  userIcon = faUser
  botIcon = faRobot
  editedIcon = faPen
  edited = false

  timeAgo = ''

  constructor() {
    // its an array
    this.privacyOptions[10] = { level: 10, name: 'Direct Message', icon: faEnvelope }
    this.privacyOptions[20] = { level: 20, name: 'Link only', icon: faNewspaper }
  }
  ngOnChanges(): void {
    const relative = DateTime.fromJSDate(this.fragment().createdAt).setLocale('en').toRelative()
    this.timeAgo = relative ? relative : 'Error with date'
    this.edited = this.fragment().updatedAt.getTime() - this.fragment().createdAt.getTime() > 60000
  }

  async followUser(post: ProcessedPost) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.post-header.followTitle',
      titleSuffix: post.user.url
    })

    if (!confirm) return

    const response = await this.postService.followUser(post.userId)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.followMessageSuccess',
        translate: true,
        soundName: 'follow'
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
  }

  async cancelFollowUser(post: ProcessedPost) {
    const response = await this.postService.unfollowUser(post.userId)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.cancelFollowMessageSuccess',
        translate: true
      })
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
  }
}
