import { Component, input, Input, viewChild } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { RouterModule } from '@angular/router'
import { PostLinkModule } from 'src/app/directives/post-link/post-link.module'
import { ProcessedPost } from 'src/app/interfaces/processed-post'
import { PostActionButtonsComponent } from '../post-action-buttons/post-action-buttons.component'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  selector: 'app-bottom-reply-bar',
  imports: [RouterModule, MatButtonModule, PostLinkModule, PostActionButtonsComponent, TranslateModule],
  templateUrl: './bottom-reply-bar.component.html',
  styleUrl: './bottom-reply-bar.component.scss'
})
export class BottomReplyBarComponent {
  fragment = input.required<ProcessedPost>()
  @Input() notes: string = ''
  postActionButtons = viewChild.required(PostActionButtonsComponent)
}
