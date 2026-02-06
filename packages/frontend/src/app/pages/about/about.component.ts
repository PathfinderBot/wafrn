import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'
import { EnvironmentService } from 'src/app/services/environment.service'
import { JwtService } from 'src/app/services/jwt.service'
import { SimpleSeoService } from 'src/app/services/simple-seo.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'
import { UtilsService } from 'src/app/services/utils.service'

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  standalone: false
})
export class AboutComponent implements OnInit {
  private simpleTitle = inject(SimpleTitleService);
  private seo = inject(SimpleSeoService);
  private utilsService = inject(UtilsService);
  private cdr = inject(ChangeDetectorRef);
  private jwtService = inject(JwtService);

  loggedIn = this.jwtService.tokenValid()

  logo = EnvironmentService.environment.logo
  bubbleHostsShowType = EnvironmentService.environment.bubbleHostsShowType
  blockedHostsShowType = EnvironmentService.environment.blockedHostsShowType
  disableShowingBlockedServers = EnvironmentService.environment.disableShowingBlockedServers
  blockedServers: string[] = []
  bubbledServers: string[] = []
  blockedLoaded = false
  blockedLoading = false
  bubbleLoaded = false
  bubbleLoading = false

  constructor() {
    this.simpleTitle.set('About this instance')
  }

  ngOnInit(): void {
    this.seo.setSEOTags(
      'About this instance',
      'About this instance, privacy policy, rules and blocked servers',
      'The wafrn team',
      '/assets/linkpreview.png'
    )
  }

  async loadBubbleServers() {
    this.bubbleLoading = true
    this.bubbledServers = await this.utilsService.getBubbleServers()
    this.bubbleLoaded = true
    this.bubbleLoading = false
    this.cdr.markForCheck()
  }

  async loadBlockedServers() {
    if (this.disableShowingBlockedServers) {
      this.blockedLoaded = true
      this.cdr.markForCheck()
      return;
    }
    this.blockedLoading = true
    this.blockedServers = await this.utilsService.getBlockedServers()
    this.blockedLoaded = true
    this.blockedLoading = false
    this.cdr.markForCheck()
  }
}
