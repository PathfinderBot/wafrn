import { Component, computed, input, OnChanges, inject } from '@angular/core'
import { ProcessedPost } from '../../interfaces/processed-post'
import { MessageService } from '../../services/message.service'

import {
  faArrowUpRightFromSquare,
  faChevronDown,
  faHeart,
  faHeartBroken,
  faShareNodes,
  faTrash,
  faTriangleExclamation,
  faPen,
  faBellSlash,
  faBell,
  faReply,
  faRepeat,
  faQuoteLeft,
  faGlobe,
  faClose,
  faBookmark,
  faBookBookmark,
  faCommentSlash,
  faLink,
  faPaperPlane,
  faUserSlash,
  faVolumeMute,
  faCookieBite,
  faCode
} from '@fortawesome/free-solid-svg-icons'
import { MatButtonModule } from '@angular/material/button'
import { MatMenuModule } from '@angular/material/menu'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { LoginService } from '../../services/login.service'

import { ReportService } from '../../services/report.service'
import { PostsService } from '../../services/posts.service'
import { UtilsService } from '../../services/utils.service'
import { EnvironmentService } from '../../services/environment.service'
import { faBluesky } from '@fortawesome/free-brands-svg-icons'
import { TranslateModule } from '@ngx-translate/core'
import { SettingsService } from 'src/app/services/settings.service'
import { PostActionButtonsComponent } from '../post-action-buttons/post-action-buttons.component'
import { SimpleDialogService } from 'src/app/services/simple-dialog.service'
import { BlocksService } from 'src/app/services/blocks.service'
import { MatDialog } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  selector: 'app-post-actions',
  imports: [
    PostActionButtonsComponent,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    FontAwesomeModule,
    TranslateModule
  ],
  templateUrl: './post-actions.component.html',
  styleUrl: './post-actions.component.scss'
})
export class PostActionsComponent implements OnChanges {
  private messages = inject(MessageService)
  private postService = inject(PostsService)
  protected loginService = inject(LoginService)
  private reportService = inject(ReportService)
  private utilsService = inject(UtilsService)
  private settingsService = inject(SettingsService)
  private simpleDialog = inject(SimpleDialogService)
  dialogService = inject(MatDialog)
  private blockService = inject(BlocksService)

  post = input.required<ProcessedPost>()
  myId: string = 'user-00000000-0000-0000-0000-000000000000 '
  postSilenced = false
  myRewootsIncludePost = false
  bookmarked = computed(() => this.post().bookmarkers.includes(this.myId))

  bskyUrl = computed<string>(() => {
    this.settingsService.settingsModified() // evil fix to update correctly    if (!bskyUri) return ''
    const bskyUri = this.post().bskyUri
    if (!bskyUri) return ''
    const parts = bskyUri.split('/app.bsky.feed.post/')
    const userDid = parts[0].split('at://')[1]
    return `https://${
      this.settingsService.values().atprotoLinkDestination || 'bsky.app'
    }/profile/${userDid}/post/${parts[1]}`
  })

  externalUrl = computed<string>(() =>
    this.bskyUrl() &&
    this.post()
      .remotePostId.replace(/^https?:\/\//, '')
      .startsWith(window.location.hostname)
      ? this.bskyUrl()
      : this.post().displayUrl
        ? (this.post().displayUrl as string)
        : this.post().remotePostId
  )

  // icons
  shareIcon = faLink
  shareMenuIcon = faShareNodes
  expandDownIcon = faChevronDown
  solidHeartIcon = faHeart
  clearHeartIcon = faHeartBroken
  reblogIcon = faReply
  quickReblogIcon = faRepeat
  shareExternalIcon = faArrowUpRightFromSquare
  bskyIcon = faBluesky
  goExternalPost = faGlobe
  reportIcon = faTriangleExclamation
  deleteIcon = faTrash
  closeIcon = faClose
  editedIcon = faPen
  silenceIcon = faBellSlash
  silenceReplyIcon = faCommentSlash
  unsilenceIcon = faBell
  quoteIcon = faQuoteLeft
  bookmarkIcon = faBookmark
  unbookmarkIcon = faBookBookmark
  refederateIcon = faPaperPlane
  muteIcon = faVolumeMute
  blockIcon = faUserSlash
  biteIcon = faCookieBite
  rawJsonIcon = faCode

  rawOutputEnabled = EnvironmentService.environment.enableRawOutput

  constructor() {
    const loginService = this.loginService

    if (loginService.loggedIn.value) {
      this.myId = loginService.getLoggedUserUUID()
    }
  }

  ngOnChanges(): void {
    this.myRewootsIncludePost = this.postService.rewootedPosts().has(this.post().id)
    this.checkPostSilenced()
  }

  sharePost() {
    navigator.clipboard.writeText(`${EnvironmentService.environment.frontUrl}/fediverse/post/${this.post().id}`)
    this.messages.add({
      severity: 'success',
      summary: 'messages.copyLocalLinkSuccess',
      translate: true
    })
  }

  shareOriginalPost() {
    navigator.clipboard.writeText(this.externalUrl())
    this.messages.add({
      severity: 'success',
      summary: 'messages.copyRemoteLinkSuccess',
      translate: true
    })
  }

  async silencePost(superMute: boolean = false) {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: !superMute ? 'dialog.post-header.silenceInteractionsTitle' : 'dialog.post-header.silenceReplyTitle',
      content: !superMute
        ? 'dialog.post-header.silenceInteractionsDescription'
        : 'dialog.post-header.silenceReplyDescription'
    })

    if (!confirm) return

    const success = await this.postService.silencePost(this.post().id, superMute)

    if (success) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.silencePostSuccess',
        translate: true
      })
      await this.checkPostSilenced()
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
  }

  async unsilencePost() {
    // const success = await this.postService.unsilencePost(this.post().id)
    const success = true

    if (success) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.unsilencePostSuccess',
        translate: true
      })
      await this.checkPostSilenced()
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError',
        translate: true
      })
    }
  }

  private async checkPostSilenced() {
    this.postSilenced = (await this.utilsService.getSilencedPostIds()).includes(this.post().id)
  }

  async forceRefederate() {
    await this.postService.forceRefederate(this.post().id)
  }

  async bitePost() {
    if (await this.postService.bitePost(this.post().id)) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.bitePostSuccess',
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

  async getRawJsonComponent(): Promise<typeof RawJsonDialogComponent> {
    const { RawJsonDialogComponent } = await import('../raw-json-dialog/raw-json-dialog.component')
    return RawJsonDialogComponent
  }

  async getRawJson(id: string) {
    const raw = await this.utilsService.getRawJsonPost(id)
    this.dialogService.open(await this.getRawJsonComponent(), {
      data: raw,
      width: '800px'
    })
  }

  // Dangerous options
  async muteAccount() {
    this.blockService.promptMuteUser(this.post().userId)
  }

  async blockAccount() {
    this.blockService.promptBlockUser(this.post().userId)
  }

  reportPost() {
    this.reportService.report(this.post())
  }
}
