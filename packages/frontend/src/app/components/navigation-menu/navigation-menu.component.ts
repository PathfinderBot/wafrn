import {
  Component,
  computed,
  OnDestroy,
  OnInit,
  Signal,
  ViewEncapsulation,
  WritableSignal,
  inject,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { MatBadgeModule } from '@angular/material/badge'
import { MatButtonModule } from '@angular/material/button'
import { MatDialogModule } from '@angular/material/dialog'
import { MatListModule } from '@angular/material/list'
import { MatSidenavModule } from '@angular/material/sidenav'
import { RouterModule, NavigationEnd, Router } from '@angular/router'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatToolbarModule } from '@angular/material/toolbar'
import { TranslateModule } from '@ngx-translate/core'
import { ColorSchemeSwitcherComponent } from '../color-scheme-switcher/color-scheme-switcher.component'
import { MenuItemComponent } from '../menu-item/menu-item.component'
import { SnappyRouter } from '../snappy/snappy-router.component'
import { fromEvent, merge, Subscription } from 'rxjs'
import { toObservable } from '@angular/core/rxjs-interop'

import {
  faQuestion,
  faHouse,
  faUser,
  faCompass,
  faPencil,
  faBell,
  faPowerOff,
  faServer,
  faExclamationTriangle,
  faBan,
  faEnvelope,
  faSearch,
  faSignOut,
  faBars,
  faUserLock,
  faCog,
  faChartSimple,
  faHourglass,
  faIcons,
  faPaintbrush,
  faBookmark,
  faSync,
  faHashtag,
  faArrowLeft,
  faUserPlus,
  faArrowRightToBracket,
  faGrip,
  faImagePortrait,
  faUsers,
  faPlus,
  faShuffle,
  faInbox,
  faVolumeXmark,
  faBellSlash,
  faRoadBarrier,
  faFileLines
} from '@fortawesome/free-solid-svg-icons'

import buildData from '../../../buildData.json'
import { BlogDetails } from '../../interfaces/blog-details'
import { MenuItem, MenuLink } from '../../interfaces/menu-item'
import { DashboardService } from '../../services/dashboard.service'
import { EditorService } from '../../services/editor.service'
import { EnvironmentService } from '../../services/environment.service'
import { GlobalData } from '../../services/global-data.service'
import { JwtService } from '../../services/jwt.service'
import { LoginService, AccountData } from '../../services/login.service'
import { NotificationsService } from '../../services/notifications.service'
import { ThemeService } from '../../services/theme.service'
import { Action } from '../../interfaces/editor-launcher-data'

@Component({
  selector: 'app-navigation-menu',
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MenuItemComponent,
    MatBadgeModule,
    FontAwesomeModule,
    MatButtonModule,
    MatDialogModule,
    ColorSchemeSwitcherComponent,
    SnappyRouter,
    MatToolbarModule,
    TranslateModule
  ],
  templateUrl: './navigation-menu.component.html',
  styleUrls: ['./navigation-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None
})
export class NavigationMenuComponent implements OnInit, OnDestroy {
  private editorService = inject(EditorService)
  private router = inject(Router)
  jwtService = inject(JwtService)
  protected loginService = inject(LoginService)
  private notificationsService = inject(NotificationsService)
  private dashboardService = inject(DashboardService)
  private cdr = inject(ChangeDetectorRef)

  menuItems: MenuItem[] = []
  menuItemsMobile: MenuItem[][] = []
  menuLinks: MenuLink[] = []

  currentAccount: Signal<BlogDetails | undefined>
  accountList: Signal<AccountData[]>
  accountListMenuItems = computed(() =>
    this.accountList()
      .filter((_, index) => index !== 0)
      .map<MenuItem>((account) => {
        return {
          label: '',
          labelDynamic: () => account.blog.name,
          image: this.dashboardService.getAvatarUrl(account.blog),
          visible: () => this.loginService.loggedIn.value,
          badge: () => 0, // TODO: badges on other accounts from token (needs API)
          items: [
            {
              label: 'menu.viewBlog',
              icon: faImagePortrait,
              visible: () => this.loginService.loggedIn.value,
              routerLinkDynamic: computed(() => '/blog/' + account.blog.url),
              command: () => {
                this.hideMenu()
              }
            },
            {
              label: 'menu.switchToAlt',
              icon: faShuffle,
              visible: () => this.loginService.loggedIn.value,
              command: () => {
                this.hideMenu()
                this.loginService.switchAccount(account.token)
              }
            },
            {
              label: '',
              visible: () => this.loginService.loggedIn.value,
              divider: true
            },
            {
              label: 'menu.logout',
              icon: faSignOut,
              visible: () => this.loginService.loggedIn.value,
              command: () => {
                this.loginService.logOutAccount(account.token)
                this.hideMenu()
              }
            }
          ]
        }
      })
  )

  // Groups of notifications
  inboxNotifications = computed(
    () =>
      this.notificationsService.notifications() +
      this.notificationsService.asks() +
      this.notificationsService.followsAwaitingApproval()
  )
  adminNotifications = computed(
    () => this.notificationsService.reports() + this.notificationsService.usersAwaitingApproval()
  )
  mobileNotifications = computed(
    () =>
      this.notificationsService.asks() + this.notificationsService.followsAwaitingApproval() + this.adminNotifications()
  )

  maintenanceMode = EnvironmentService.environment.maintenance
  maintenanceMessage = EnvironmentService.environment.maintenanceMessage
  menuVisible: boolean
  privateMessagesNotifications = ''
  mobile: WritableSignal<boolean>
  logo = EnvironmentService.environment.logo
  defaultIcon = faQuestion
  navigationSubscription: Subscription
  scrollSubscription: Subscription
  hamburguerIcon = faBars
  pencilIcon = faPencil
  currentRoute = ''
  reloadIcon = faSync
  backIcon = faArrowLeft

  pwaPage: boolean

  keyboardActive = true

  horizontalMenuMode: Signal<boolean>
  offsetTopArea: Signal<boolean>

  buildData = buildData

  constructor() {
    const globalData = inject(GlobalData)
    const loginService = this.loginService
    const themeService = inject(ThemeService)

    this.currentAccount = loginService.currentAccount
    this.accountList = loginService.accountList

    if (this.loginService.getForceClassicLogo()) {
      this.logo = '/assets/classicLogo.png'
    }
    this.navigationSubscription = this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        this.currentRoute = ev.url
        this.notificationsService.updateCount()
      }
    })

    this.scrollSubscription = this.dashboardService.scrollEventEmitter.subscribe(() => {
      this.notificationsService.updateCount()
    })

    this.pwaPage =
      window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true

    // Focus overlay evil fix
    fromEvent(document, 'keydown').subscribe(() => (this.keyboardActive = true))
    fromEvent(document, 'click').subscribe(() => (this.keyboardActive = false))

    this.mobile = globalData.mobile
    this.horizontalMenuMode = themeService.additionalStyleModes.horizontalMenu
    const topToolbarMode = themeService.additionalStyleModes.topToolbar
    this.offsetTopArea = computed(() => (this.mobile() || this.horizontalMenuMode()) && topToolbarMode())

    merge(fromEvent(window, 'resize'), toObservable(this.horizontalMenuMode), toObservable(topToolbarMode)).subscribe(
      () => this.syncMobileMode()
    )

    this.menuVisible = !this.mobile()
  }

  ngOnInit(): void {
    // IMPORTANT: HIDE THE SPLASH SCREEN
    const splashElement = document.getElementById('splash')
    splashElement?.classList.add('loaded')

    const microformatsElement = document.getElementById('indieweb')
    microformatsElement?.classList.add('loaded')
    this.drawMenu()
    if (localStorage.getItem('horizontalMenu') === 'true') {
      this.onCloseMenu()
    }
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe()
    this.scrollSubscription.unsubscribe()
  }

  showMenu() {
    this.menuVisible = true
  }

  hideMenu() {
    this.menuVisible = false
    this.editorService.launchPostEditorEmitter.next({ action: Action.Close })
  }

  syncMobileMode() {
    this.mobile.set(window.innerWidth <= 992 || this.horizontalMenuMode())
  }

  async openEditor() {
    if (!this.loginService.loggedIn.value) return
    this.editorService.openDialogWithData(undefined)
  }

  onCloseMenu() {
    this.menuVisible = false
  }

  historyBack() {
    history.back()
  }

  refresh() {
    const currentUrl = this.router.url
    this.router.navigateByUrl('/nonExistingUrl', { skipLocationChange: true })
    setTimeout(() => {
      this.router.navigate([currentUrl])
      this.cdr.detectChanges()
    }, 25)
    this.cdr.detectChanges()
  }

  drawMenu() {
    // JSON driven UI lmao
    this.menuItems = [
      {
        label: 'menu.register',
        icon: faUserPlus,
        visible: () => !this.loginService.loggedIn.value,
        routerLink: '/register',
        command: () => {
          this.hideMenu()
        }
      },
      {
        label: 'menu.login',
        icon: faArrowRightToBracket,
        visible: () => !this.loginService.loggedIn.value,
        routerLink: '/login',
        command: () => {
          this.hideMenu()
        }
      },
      {
        label: 'divider',
        visible: () => !this.loginService.loggedIn.value,
        divider: true
      },
      {
        label: 'menu.exploreWafrn',
        icon: faCompass,
        visible: () => !this.loginService.loggedIn.value,
        routerLink: '/dashboard/exploreLocal',
        command: () => {
          this.hideMenu()
        }
      },
      {
        label: 'menu.dashboard',
        icon: faHouse,
        visible: () => this.loginService.loggedIn.value,
        routerLink: '/dashboard',
        command: () => {
          this.hideMenu()
        }
      },
      {
        label: 'menu.explore',
        icon: faCompass,
        visible: () => this.loginService.loggedIn.value,
        items: [
          {
            label: 'menu.exploreWafrn',
            icon: faServer,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/dashboard/exploreLocal',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.exploreFediverse',
            icon: faCompass,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/dashboard/explore',
            command: () => {
              this.hideMenu()
            }
          }
        ]
      },
      {
        label: 'menu.search',
        icon: faSearch,
        visible: () => this.loginService.loggedIn.value,
        routerLink: '/dashboard/search',
        command: () => {
          this.hideMenu()
        }
      },
      {
        label: 'menu.inbox',
        icon: faInbox,
        visible: () => this.loginService.loggedIn.value,
        badge: () => this.inboxNotifications(),
        items: [
          {
            label: 'menu.notifications',
            icon: faBell,
            visible: () => this.loginService.loggedIn.value,
            badge: () => this.notificationsService.notifications(),
            routerLink: '/dashboard/notifications',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.privateMessages',
            icon: faEnvelope,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/dashboard/private',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.unansweredAsks',
            icon: faQuestion,
            visible: () => this.loginService.loggedIn.value,
            badge: () => this.notificationsService.asks(),
            routerLink: '/profile/myAsks',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.follows',
            icon: faUsers,
            visible: () =>
              this.currentAccount()?.manuallyAcceptsFollows === true ||
              this.notificationsService.followsAwaitingApproval() > 0,
            badge: () => this.notificationsService.followsAwaitingApproval(),
            routerLinkDynamic: computed(() => '/blog/' + this.currentAccount()?.url + '/followers'),
            command: () => {
              this.hideMenu()
            }
          }
        ]
      },
      {
        label: 'divider',
        visible: () => this.loginService.loggedIn.value,
        divider: true
      },
      {
        label: 'user',
        labelDynamic: computed(() => this.currentAccount()?.name ?? 'No one will believe you'),
        image:
          this.currentAccount() !== undefined
            ? this.dashboardService.getAvatarUrl(<BlogDetails>this.currentAccount())
            : '',
        visible: () => this.loginService.loggedIn.value,
        class: 'active-account',
        active: true,
        items: [
          {
            label: 'menu.myBlog',
            icon: faImagePortrait,
            visible: () => this.loginService.loggedIn.value,
            routerLinkDynamic: computed(() => '/blog/' + this.currentAccount()?.url),
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'divider',
            visible: () => this.loginService.loggedIn.value,
            divider: true
          },
          {
            label: 'menu.addAccount',
            icon: faPlus,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/login',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.logout',
            icon: faSignOut,
            visible: () => this.loginService.loggedIn.value,
            command: () => {
              this.loginService.logOut()
              this.hideMenu()
            }
          }
        ]
      },
      {
        label: 'menu.otherAccounts',
        visible: () => this.loginService.loggedIn.value && this.accountList().length > 1,
        plainText: true
      },
      ...this.accountListMenuItems(),
      {
        label: '',
        visible: () => this.loginService.loggedIn.value,
        divider: true
      },
      {
        label: 'menu.settings.title',
        icon: faCog,
        visible: () => this.loginService.loggedIn.value,
        routerLink: '/settings/profile',
        highlightRoute: false
      },
      {
        label: 'menu.more',
        icon: faGrip,
        visible: () => this.loginService.loggedIn.value,
        items: [
          {
            label: 'menu.settings.detachedNotifications',
            icon: faBell,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/dashboard/notifications/detached',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.themeEditor',
            icon: faPaintbrush,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/css',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.followedHashtags',
            icon: faHashtag,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/manageFollowedHashtags',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.bookmarkedPosts',
            icon: faBookmark,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/bookmarkedPosts',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.silencedPosts',
            icon: faBellSlash,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/silencedPosts',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.myDrafts',
            icon: faFileLines,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/myDrafts',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.mutedUsers',
            icon: faVolumeXmark,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/mutes',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.myBlockedServers',
            icon: faRoadBarrier,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/serverBlocks',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.settings.myBlockedUsers',
            icon: faBan,
            visible: () => this.loginService.loggedIn.value,
            routerLink: '/profile/blocks',
            command: () => {
              this.hideMenu()
            }
          }
        ]
      },
      {
        label: 'menu.admin.title',
        icon: faPowerOff,
        visible: () => this.jwtService.adminToken(),
        badge: () => this.adminNotifications(),
        items: [
          {
            label: 'menu.admin.awaitingAproval',
            icon: faUserLock,
            visible: () => true,
            badge: () => this.notificationsService.usersAwaitingApproval(),
            routerLink: '/admin/activate-users',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.reports',
            icon: faExclamationTriangle,
            visible: () => true,
            badge: () => this.notificationsService.reports(),
            routerLink: '/admin/user-reports',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.addEmojis',
            icon: faIcons,
            visible: () => true,
            routerLink: '/admin/emojis',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.stats',
            icon: faChartSimple,
            visible: () => true,
            routerLink: '/admin/stats',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.emailCampaign',
            icon: faEnvelope,
            visible: () => true,
            routerLink: '/admin/email-campaign',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.serverList',
            icon: faServer,
            visible: () => true,
            routerLink: '/admin/server-list',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.inviteCodes',
            icon: faPlus,
            visible: () => EnvironmentService.environment.registrationLevel === 'INVITE',
            routerLink: '/admin/invite-codes',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.bans',
            icon: faBan,
            visible: () => true,
            routerLink: '/admin/bans',
            command: () => {
              this.hideMenu()
            }
          },
          {
            label: 'menu.admin.blocklist',
            icon: faHourglass,
            visible: () => true,
            routerLink: '/admin/user-blocks',
            command: () => {
              this.hideMenu()
            }
          }
        ]
      }
    ]

    this.menuItemsMobile = [
      [
        {
          label: 'menu.showMenu',
          icon: faBars,
          visible: () => true,
          badge: () => this.mobileNotifications(),
          command: () => {
            this.menuVisible = !this.menuVisible
          }
        }
      ],
      [
        {
          label: 'menu.register',
          icon: faUserPlus,
          visible: () => !this.loginService.loggedIn.value,
          routerLink: '/register',
          command: () => {
            this.hideMenu()
          }
        },
        {
          label: 'menu.login',
          icon: faArrowRightToBracket,
          visible: () => !this.loginService.loggedIn.value,
          routerLink: '/login',
          command: () => {
            this.hideMenu()
          }
        },
        {
          label: 'mobileDivider',
          visible: () => !this.loginService.loggedIn.value,
          divider: true
        },
        {
          label: 'menu.home',
          icon: faHouse,
          visible: () => this.loginService.loggedIn.value,
          routerLink: '/',
          command: () => {
            this.hideMenu()
          }
        },
        {
          label: 'menu.exploreWafrn',
          icon: faCompass,
          visible: () => !this.loginService.loggedIn.value,
          routerLink: '/dashboard/exploreLocal',
          command: () => {
            this.hideMenu()
          }
        },
        {
          label: 'menu.explore',
          icon: faCompass,
          visible: () => this.loginService.loggedIn.value,
          items: [
            {
              label: 'menu.dashboard',
              icon: faHouse,
              visible: () => this.loginService.loggedIn.value,
              routerLink: '/dashboard',
              command: () => {
                this.hideMenu()
              }
            },
            {
              label: 'menu.exploreWafrn',
              icon: faServer,
              visible: () => this.loginService.loggedIn.value,
              routerLink: '/dashboard/exploreLocal',
              command: () => {
                this.hideMenu()
              }
            },
            {
              label: 'menu.exploreFediverse',
              icon: faCompass,
              visible: () => this.loginService.loggedIn.value,
              routerLink: '/dashboard/explore',
              command: () => {
                this.hideMenu()
              }
            },
            {
              label: 'menu.privateMessages',
              icon: faEnvelope,
              visible: () => this.loginService.loggedIn.value,
              routerLink: '/dashboard/private',
              command: () => {
                this.hideMenu()
              }
            },
            {
              label: 'menu.search',
              icon: faSearch,
              visible: () => this.loginService.loggedIn.value,
              routerLink: '/dashboard/search',
              command: () => {
                this.hideMenu()
              }
            }
          ]
        },
        {
          label: 'menu.notifications',
          icon: faBell,
          visible: () => this.loginService.loggedIn.value,
          badge: () => this.notificationsService.notifications(),
          routerLink: '/dashboard/notifications',
          command: () => {
            this.hideMenu()
          }
        },
        {
          label: 'menu.myBlog',
          icon: faUser,
          visible: () => this.loginService.loggedIn.value,
          routerLinkDynamic: computed(() => '/blog/' + this.currentAccount()?.url),
          command: () => {
            this.hideMenu()
          }
        }
      ],
      [
        {
          label: 'menu.writeWoot',
          icon: faPencil,
          visible: () => this.loginService.loggedIn.value,
          routerLink: '/editor',
          command: async () => {
            this.hideMenu()
            this.openEditor()
          }
        }
      ]
    ]

    this.menuLinks = [
      {
        label: 'menu.about',
        routerLink: '/about'
      },
      {
        label: 'menu.privacy',
        routerLink: '/privacy'
      },
      {
        label: 'menu.faq',
        url: 'https://wafrn.net/faq/overview.html'
      },
      {
        label: 'menu.source',
        url: 'https://codeberg.org/wafrn/wafrn'
      },
      ...(EnvironmentService.environment.donationUrl
        ? [
            {
              label: 'menu.donate',
              url: EnvironmentService.environment.donationUrl
            }
          ]
        : [
            {
              label: 'menu.patreon',
              url: 'https://patreon.com/wafrn'
            },
            {
              label: 'menu.kofi',
              url: 'https://ko-fi.com/wafrn'
            }
          ])
    ]
  }
}
