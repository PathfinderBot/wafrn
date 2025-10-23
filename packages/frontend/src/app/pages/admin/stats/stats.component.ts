import { Component } from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { statsReply } from 'src/app/interfaces/statsReply'
import { AdminService } from 'src/app/services/admin.service'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-stats',
  imports: [MatCardModule, TranslateModule],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss'
})
export class StatsComponent {
  backendReply: statsReply | undefined
  constructor(adminService: AdminService, simpleTitle: SimpleTitleService) {
    simpleTitle.set('menu.admin.stats')

    adminService.getStats().then((response) => {
      this.backendReply = response
    })
  }
}
