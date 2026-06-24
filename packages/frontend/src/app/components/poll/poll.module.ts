import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { PollComponent } from './poll.component'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatRadioModule } from '@angular/material/radio'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [PollComponent],
  imports: [
    CommonModule,
    MatProgressBarModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatRadioModule,
    MatCheckboxModule,
    TranslateModule
  ],
  exports: [PollComponent]
})
export class PollModule {}
