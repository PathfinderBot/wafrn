import { Component, input, OnInit, ChangeDetectionStrategy } from '@angular/core'
import { AvatarSmallComponent } from '../avatar-small/avatar-small.component'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { MatCardModule } from '@angular/material/card'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { NgTemplateOutlet } from '@angular/common'
import { DateTime } from 'luxon'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { SimplifiedUser } from '../../interfaces/simplified-user'

@Component({
  selector: 'app-post-ribbon',
  imports: [MatCardModule, AvatarSmallComponent, FontAwesomeModule, NgTemplateOutlet],
  templateUrl: './post-ribbon.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './post-ribbon.component.scss'
})
export class PostRibbonComponent implements OnInit {
  readonly users = input.required<SimplifiedUser[]>()
  readonly icon = input<IconDefinition>()
  readonly image = input<string>()
  readonly time = input<Date>()
  readonly card = input(true)

  plusIcon = faPlus

  timeAgo = ''

  ngOnInit(): void {
    // TODO unhardcode
    const relative = DateTime.fromJSDate(this.time() || new Date())
      .setLocale('en')
      .toRelative()
    this.timeAgo = relative ? relative : 'ERROR GETING TIME'
  }
}
