import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiCollectionsComponent } from 'src/app/components/emoji-collections/emoji-collections.component'
import { FileUploadComponent } from 'src/app/components/file-upload/file-upload.component'
import { SimpleTitleService } from 'src/app/services/simple-title.service'

@Component({
  selector: 'app-emoji-uploader',
  imports: [FormsModule, MatCardModule, FileUploadComponent, EmojiCollectionsComponent, TranslateModule],
  templateUrl: './emoji-uploader.component.html',
  styleUrl: './emoji-uploader.component.scss'
})
export class EmojiUploaderComponent {
  constructor() {
    const simpleTitle = inject(SimpleTitleService);

    simpleTitle.set('menu.admin.addEmojis')
  }

  onEmojiUpload(evt: any) {
    window.location.reload()
  }
}
