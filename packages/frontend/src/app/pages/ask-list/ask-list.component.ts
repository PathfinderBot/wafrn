import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { SingleAskComponent } from 'src/app/components/single-ask/single-ask.component'
import { Ask } from 'src/app/interfaces/ask'
import { BlogService } from 'src/app/services/blog.service'
import { DashboardService } from 'src/app/services/dashboard.service'
import { EditorService } from 'src/app/services/editor.service'
import { LoaderComponent } from 'src/app/components/loader/loader.component'
import { TranslatePipe } from '@ngx-translate/core'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-ask-list',
  imports: [SingleAskComponent, MatButtonModule, MatCardModule, LoaderComponent, TranslatePipe],
  templateUrl: './ask-list.component.html',
  styleUrl: './ask-list.component.scss'
})
export class AskListComponent {
  private dashboard = inject(DashboardService);
  private editor = inject(EditorService);
  private blogService = inject(BlogService);
  private cdr = inject(ChangeDetectorRef)

  loading = true
  asks: Ask[] = []

  constructor() {
    const simpleTitle = inject(SimpleTitleService);

    simpleTitle.set('menu.unansweredAsks')
  }

  async ngOnInit() {
    await this.syncAsks()
  }

  async syncAsks() {
    this.loading = true
    const asks = await this.dashboard.getMyAsks()
    this.asks = asks
    this.loading = false
    this.cdr.detectChanges()

  }

  async ignoreAsk(ask: Ask) {
    await this.blogService.ignoreAsk(ask)
    await this.syncAsks()
  }

  replyAsk(ask: Ask) {
    this.editor.replyAsk(ask)
  }
}
