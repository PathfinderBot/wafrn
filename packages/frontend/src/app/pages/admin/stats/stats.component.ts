import { JsonPipe } from '@angular/common'
import { ChangeDetectorRef, Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { statsReply } from '../../../interfaces/stats-reply'
import { AdminService } from '../../../services/admin.service'
import { SimpleTitleService } from '../../../services/simple-title.service'

@Component({
  selector: 'app-stats',
  imports: [MatCardModule, TranslateModule],
  templateUrl: './stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './stats.component.scss'
})
export class StatsComponent {
  backendReply: statsReply | undefined
  private cdr = inject(ChangeDetectorRef)
  constructor() {
    const adminService = inject(AdminService)
    const simpleTitle = inject(SimpleTitleService)

    simpleTitle.set('menu.admin.stats')

    adminService.getStats().then((response) => {
      this.backendReply = response
      this.cdr.detectChanges()
    })
  }
}
