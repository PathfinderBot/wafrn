import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { WafrnMediaComponent } from './wafrn-media.component'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { LinkPreviewComponent } from '../link-preview/link-preview.component'
import { TranslateModule } from '@ngx-translate/core'
import { SafePipe } from '../../pipes/safe.pipe'

@NgModule({
  declarations: [WafrnMediaComponent],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    FontAwesomeModule,
    LinkPreviewComponent,
    TranslateModule,
    SafePipe
  ],
  exports: [WafrnMediaComponent]
})
export class WafrnMediaModule {}
