import { Component, OnInit, inject } from '@angular/core'
import { Router } from '@angular/router'
import { faArrowRight, faEllipsis, faQuestion } from '@fortawesome/free-solid-svg-icons'

@Component({
  selector: 'app-pagenotfound',
  templateUrl: './pagenotfound.component.html',
  styleUrls: ['./pagenotfound.component.scss'],
  standalone: false
})
export class PagenotfoundComponent implements OnInit {
  pageIcon = faQuestion
  path: string

  constructor() {
    const router = inject(Router);

    this.path = router.url
  }

  ngOnInit(): void {}
}
