import { Component, input, OnInit } from '@angular/core'
import { SimplifiedUser } from 'src/app/interfaces/simplified-user'
import { AvatarSmallComponent } from '../avatar-small/avatar-small.component'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { MatCardModule } from '@angular/material/card'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { NgTemplateOutlet } from '@angular/common'
import { DateTime } from 'luxon'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

@Component({
  selector: 'app-post-ribbon',
  imports: [MatCardModule, AvatarSmallComponent, FontAwesomeModule, NgTemplateOutlet],
  templateUrl: './post-ribbon.component.html',
  styleUrl: './post-ribbon.component.scss'
})
export class PostRibbonComponent implements OnInit {
  readonly users = input.required<SimplifiedUser[]>()
  readonly icon = input<IconDefinition>()
  readonly image = input<string>()
  readonly time = input.required<Date>()
  readonly card = input(true)

  plusIcon = faPlus

  timeAgo = ''

  ngOnInit(): void {
    // TODO unhardcode
    const relative = DateTime.fromJSDate(this.time()).setLocale('en').toRelative()
    this.timeAgo = relative ? relative : 'ERROR GETING TIME'
  }
}
