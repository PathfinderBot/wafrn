import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { Router, RouterModule } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faArrowRight, faEllipsis, faQuestion } from '@fortawesome/free-solid-svg-icons'

@Component({
  selector: 'app-pagenotfound',
  imports: [CommonModule, RouterModule, MatCardModule, TranslateModule, MatButtonModule, FontAwesomeModule],
  templateUrl: './pagenotfound.component.html',
  styleUrls: ['./pagenotfound.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class PagenotfoundComponent implements OnInit {
  pageIcon = faQuestion
  path: string

  constructor() {
    const router = inject(Router)

    this.path = router.url
  }

  ngOnInit(): void {}
}
