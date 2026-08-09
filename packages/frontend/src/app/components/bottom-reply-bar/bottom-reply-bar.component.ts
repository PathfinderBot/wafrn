import { Component, input, Input, viewChild, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { RouterModule } from '@angular/router'
import { PostActionButtonsComponent } from '../post-action-buttons/post-action-buttons.component'
import { TranslateModule } from '@ngx-translate/core'
import { PostLinkDirective } from '../../directives/post-link/post-link.directive'
import { ProcessedPost } from '../../interfaces/processed-post'

@Component({
  selector: 'app-bottom-reply-bar',
  imports: [RouterModule, MatButtonModule, PostLinkDirective, PostActionButtonsComponent, TranslateModule],
  templateUrl: './bottom-reply-bar.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './bottom-reply-bar.component.scss'
})
export class BottomReplyBarComponent {
  fragment = input.required<ProcessedPost>()
  @Input() notes: string = ''
  postActionButtons = viewChild.required(PostActionButtonsComponent)
}
