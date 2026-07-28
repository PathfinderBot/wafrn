import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { DialogRef } from '@angular/cdk/dialog'
import { EmojiCollectionsComponent } from '../emoji-collections/emoji-collections.component'

import { MatButtonModule } from '@angular/material/button'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslatePipe } from '@ngx-translate/core'
import { Emoji } from '../../interfaces/emoji'

@Component({
  selector: 'app-emoji-picker',
  imports: [EmojiCollectionsComponent, MatButtonModule, FontAwesomeModule, TranslatePipe],
  styleUrl: './emoji-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './emoji-picker.component.html'
})
export class EmojiPickerComponent {
  dialogRef = inject<DialogRef<Emoji>>(DialogRef<Emoji>)
  faClose = faXmark

  reactToPost(e: Emoji) {
    this.dialogRef.close(e)
  }

  closeDialog() {
    this.dialogRef.close()
  }
}
