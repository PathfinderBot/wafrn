import { CommonModule } from '@angular/common'
import {
  Component,
  computed,
  input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  ChangeDetectionStrategy
} from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatDialog } from '@angular/material/dialog'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faBluesky } from '@fortawesome/free-brands-svg-icons'
import {
  faChevronDown,
  faServer,
  faUser,
  faUserSlash,
  faVolumeMute,
  faVolumeUp,
  faUsers,
  faTriangleExclamation,
  faRepeat,
  faQuoteRight,
  faReply,
  faCookieBite,
  faCode,
  faPlaneDeparture,
  faRobot,
  faScrewdriverWrench,
  faRefresh,
  faLock,
  faUserGroup,
  faEnvelope
} from '@fortawesome/free-solid-svg-icons'
import { TranslatePipe } from '@ngx-translate/core'
import { BlogDetails } from '../../interfaces/blog-details'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { BlocksService } from '../../services/blocks.service'
import { BlogService } from '../../services/blog.service'
import { EditorService } from '../../services/editor.service'
import { EnvironmentService } from '../../services/environment.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'
import { UserOptionsService } from '../../services/user-options.service'
import { ReportService } from '../../services/report.service'
import { SettingsService } from '../../services/settings.service'
import { SimpleDialogService } from '../../services/simple-dialog.service'
import { UtilsService } from '../../services/utils.service'
import { InfoCardComponent } from '../info-card/info-card.component'

@Component({
  selector: 'app-blog-header',
  imports: [
    CommonModule,
    MatCardModule,
    FontAwesomeModule,
    MatMenuModule,
    MatButtonModule,
    MatTooltipModule,
    RouterModule,
    InfoCardComponent,
    TranslatePipe
  ],
  templateUrl: './blog-header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './blog-header.component.scss'
})
export class BlogHeaderComponent implements OnChanges, OnDestroy {
  protected loginService = inject(LoginService)
  userOptionsService = inject(UserOptionsService)
  private messages = inject(MessageService)
  private editorService = inject(EditorService)
  blockService = inject(BlocksService)
  dialogService = inject(MatDialog)
  activatedRoute = inject(ActivatedRoute)
  environmentService = inject(EnvironmentService)
  reportService = inject(ReportService)
  simpleDialog = inject(SimpleDialogService)
  blogService = inject(BlogService)
  utilsService = inject(UtilsService)
  settingsService = inject(SettingsService)
  router = inject(Router)

  parser = new DOMParser()
  blogDetails = input<BlogDetails>()
  avatarUrl = computed<string>(() => {
    const blog = this.blogDetails()
    if (blog === undefined) return '/assets/img/anon.webp'
    return EnvironmentService.environment.cacheDomain + '/api/v2/cache/avatar/' + blog.id
  })
  headerUrl = ''
  isMe = false
  expandDownIcon = faChevronDown
  muteUserIcon = faVolumeMute
  unmuteUserIcon = faVolumeUp
  reportUserIcon = faTriangleExclamation
  disableRewootIcon = faRepeat
  disableQuotesIcon = faQuoteRight
  disableRepliesIcon = faReply
  rawJsonIcon = faCode
  migratedToUrl = ''

  envelopeIcon = faEnvelope
  userIcon = faUser
  bskyIcon = faBluesky
  botIcon = faRobot
  followerIcon = faUserGroup
  adminIcon = faScrewdriverWrench
  usersIcon = faUsers
  blockUserIcon = faUserSlash
  unblockServerIcon = faServer
  biteUserIcon = faCookieBite
  lockIcon = faLock
  movedAccountIcon = faPlaneDeparture
  refetchUserIcon = faRefresh
  allowAsk = false
  allowRemoteAsk = false
  isBlueskyUser = false
  headerHTML: string | undefined

  rawOutputEnabled = EnvironmentService.environment.enableRawOutput
  instanceHostname = new URL(EnvironmentService.environment.frontUrl).hostname

  atprotoProfileUrl = computed<string>(() => {
    const did = this.blogDetails()?.bskyDid
    if (!did) return ''
    const dest = this.settingsService.values().atprotoLinkDestination || 'bsky.app'
    return `https://${dest}/profile/${did}`
  })

  fediComp = computed<{ name: string; value: string }[]>(() => {
    const fediAttachment = this.blogDetails()?.publicOptions.find(
      (elem) => elem.optionName == 'fediverse.public.attachment'
    )
    if (fediAttachment) {
      return JSON.parse(fediAttachment.optionValue)
    }
    return []
  })
  ngOnChanges(changes: SimpleChanges): void {
    const blog = this.blogDetails()
    if (blog === undefined) return
    this.headerUrl = `${EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''}/api/v2/cache/header/${blog.id}`
    const askLevelOption = blog.publicOptions.find((elem) => elem.optionName == 'wafrn.public.asks')
    let askLevel = askLevelOption ? parseInt(askLevelOption.optionValue) : 2
    if (blog.url.startsWith('@')) {
      askLevel = 3
    }
    this.allowAsk = this.loginService.loggedIn.value ? [1, 2].includes(askLevel) : askLevel == 1
    this.allowAsk = this.allowAsk && !blog.blocked
    this.allowAsk = this.allowAsk && this.loginService.getLoggedUserUUID() != blog.id
    this.allowRemoteAsk = askLevel != 3 && this.loginService.getLoggedUserUUID() != blog.id
    this.allowRemoteAsk = this.allowRemoteAsk && !blog.blocked
    this.isMe = blog.id == this.loginService.getLoggedUserUUID()
    let path = this.activatedRoute.snapshot.routeConfig?.path
    if (path && this.allowAsk && path.toLowerCase().endsWith('/ask')) {
      this.openAskDialog()
    }
    const parsedAsHTML = this.parser.parseFromString(blog.description, 'text/html')
    // const imgs = parsedAsHTML.getElementsByTagName("img");
    // Array.from(imgs).forEach((img, index) => {
    //   img.src = "";
    // });
    this.headerHTML = parsedAsHTML.documentElement.innerHTML
    if (blog?.migratedTo)
      this.migratedToUrl = new URL(`/blog/${blog?.migratedTo}`, EnvironmentService.environment.frontUrl).href
  }

  ngOnDestroy(): void {}

  async openDirectMessage(blog: BlogDetails) {
    const mentionUrl = blog.url?.startsWith('@') ? blog.url : `@${blog.url}`
    const mentionUser: SimplifiedUser = {
      avatar: this.avatarUrl(),
      id: blog.id,
      url: blog.url,
      name: blog.name ?? blog.url
    }

    await this.editorService.openDialogWithData({
      content: `${mentionUrl} `,
      privacy: 10,
      mentionUser
    })
  }

  async unfollowUser(id: string) {
    const response = await this.userOptionsService.unfollowUser(id)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.unfollowMessageSuccess',
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

  async getFollowLoggedOutComponent(): Promise<typeof FollowLoggedOutComponent> {
    const { FollowLoggedOutComponent } = await import('../follow-logged-out/follow-logged-out.component')
    return FollowLoggedOutComponent
  }

  async followUser(id: string) {
    if (!this.loginService.loggedIn.value) {
      const blog = this.blogDetails()
      this.dialogService.open(await this.getFollowLoggedOutComponent(), {
        width: '600px',
        data: {
          bskyDid: blog?.bskyDid,
          url: blog?.url,
          name: blog?.name,
          remoteId: blog?.remoteId
        }
      })

      return
    }

    const response = await this.userOptionsService.followUser(id)
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

  async muteAccount() {
    const blog = this.blogDetails()
    if (blog) {
      blog.muted = (await this.blockService.promptMuteUser(blog.id)) === true
    }
  }

  async unmuteAccount() {
    const blog = this.blogDetails()
    if (blog) {
      // very silly API
      const res = await this.blockService.promptUnmuteUser(blog.id)
      if (res !== undefined) {
        blog.muted = res !== undefined && res.length !== 0
      }
    }
  }

  async blockAccount() {
    const blog = this.blogDetails()
    if (blog) {
      blog.blocked = (await this.blockService.promptBlockUser(blog.id)) === true
    }
  }

  async unblockAccount() {
    const blog = this.blogDetails()
    if (blog) {
      // very silly API
      const res = await this.blockService.promptUnblockUser(blog.id)
      if (res !== undefined) {
        blog.blocked = res !== undefined && res.length !== 0
      }
    }
  }

  async biteAccount(id: string) {
    const response = await this.blogService.biteUser(id)
    if (response) {
      this.messages.add({
        severity: 'success',
        summary: 'messages.biteUserSuccess',
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
    const raw = await this.utilsService.getRawJsonUser(id)
    this.dialogService.open(await this.getRawJsonComponent(), {
      data: raw,
      width: '800px'
    })
  }

  async getAskDialogComponent(): Promise<typeof AskDialogContentComponent> {
    const { AskDialogContentComponent } = await import('../ask-dialog-content/ask-dialog-content.component')
    return AskDialogContentComponent
  }

  async openAskDialog() {
    this.dialogService.open(await this.getAskDialogComponent(), {
      data: { details: this.blogDetails() },
      width: '800px'
    })
  }

  async refetchUserData() {
    await this.blogService.refetchUserData(this.blogDetails()?.url ?? '')
    window.location.reload()
  }

  formatBigNumber(n: number) {
    if (n < 10000) {
      return n
    }

    return Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short'
    }).format(n)
  }

  async updateDisableRewoots() {
    const blog = this.blogDetails()
    if (blog === undefined) return
    await this.userOptionsService.updateDisableRewoots(blog.id)
  }

  async updateDisableQuotes() {
    const blog = this.blogDetails()
    if (blog === undefined) return
    await this.userOptionsService.updateDisableQuotes(blog.id)
  }

  async updateDisableReplies() {
    const blog = this.blogDetails()
    if (blog === undefined) return
    await this.userOptionsService.updateDisableReplies(blog.id)
  }
}
