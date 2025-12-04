import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'
import { EnvironmentService } from 'src/app/services/environment.service'
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

  logo = EnvironmentService.environment.logo
  disableShowingBlockedServers = EnvironmentService.environment.disableShowingBlockedServers
  blockedServers: string[] = []
  loaded = false
  loading = false

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

  async loadBlockedServers() {
    if (this.disableShowingBlockedServers) {
      this.loaded = true
      this.cdr.markForCheck()
      return;
    }
    this.loading = true
    this.blockedServers = await this.utilsService.getBlockedServers()
    this.loaded = true
    this.loading = false
    this.cdr.markForCheck()
  }
}
