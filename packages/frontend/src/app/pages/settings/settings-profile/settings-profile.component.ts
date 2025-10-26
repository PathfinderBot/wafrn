import { Component, computed, signal, Signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SettingEntryComponent } from 'src/app/components/setting-entry/setting-entry.component'
import { FediAttachment, SettingData, SettingsService } from 'src/app/services/settings.service'
import { MatCardModule } from '@angular/material/card'
import { BlogDetails } from 'src/app/interfaces/blogDetails'
import { LoginService } from 'src/app/services/login.service'
import { EnvironmentService } from 'src/app/services/environment.service'
import { MatInputModule } from '@angular/material/input'
import { faImage, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { SelectImageButtonComponent } from 'src/app/select-image-button/select-image-button.component'
import { EmojiCollectionsComponent } from 'src/app/components/emoji-collections/emoji-collections.component'
import { MatExpansionModule } from '@angular/material/expansion'
import { Emoji } from 'src/app/interfaces/emoji'
import { MessageService } from 'src/app/services/message.service'
import { ImageCropperService } from 'src/app/services/image-cropper.service'

@Component({
  selector: 'app-setting-loader',
  imports: [
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FontAwesomeModule,
    TranslateModule,
    SettingEntryComponent,
    SelectImageButtonComponent,
    MatExpansionModule,
    EmojiCollectionsComponent
  ],
  templateUrl: './settings-profile.component.html',
  styleUrl: './settings-profile.component.scss'
})
export class SettingsProfileComponent {
  data: SettingData
  values
  fediAttachments: FediAttachment[]

  newHeaderImage = signal<string | null>(null)
  newAvatarImage = signal<string | null>(null)

  blog: Signal<BlogDetails | undefined>
  avatarUrl = computed<string>(() => {
    if (this.newAvatarImage() != null) return this.newAvatarImage()!
    return this.blog()
      ? EnvironmentService.environment.externalCacheurl +
          encodeURIComponent(EnvironmentService.environment.baseMediaUrl + this.blog()?.avatar)
      : ''
  })
  headerUrl = computed<string>(() => {
    if (this.newHeaderImage() != null) return this.newHeaderImage()!
    return this.blog()
      ? EnvironmentService.environment.externalCacheurl +
          encodeURIComponent(EnvironmentService.environment.baseMediaUrl + this.blog()?.headerImage)
      : ''
  })

  imageIcon = faImage
  addIcon = faPlus
  removeIcon = faXmark

  constructor(
    private settingsService: SettingsService,
    private messageService: MessageService,
    private imageCropperService: ImageCropperService,
    loginService: LoginService
  ) {
    this.data = settingsService.data
    this.values = settingsService.values
    this.fediAttachments = settingsService.fediAttachments
    this.blog = loginService.currentAccount
  }

  addFediAttachment() {
    this.fediAttachments.push({ name: '', value: '' })
  }
  removeFediAttachment(index: number) {
    const entry = this.fediAttachments[index]
    const entryEmpty = entry.name === '' && entry.value === ''

    this.fediAttachments.splice(index, 1)

    if (!entryEmpty) {
      this.settingsService.settingsModified.set(true)
    }
  }
  updateFediAttachment(index: number, key: keyof FediAttachment, event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      this.fediAttachments[index][key] = target.value
    }
    this.settingsService.settingsModified.set(true)
  }

  attachFile(type: 'avatar' | 'header', file: File) {
    this.imageCropperService.openImageCropper(type, file, (croppedImage: File) => {
      if (type === 'avatar') {
        this.settingsService.avatar = croppedImage
        this.newAvatarImage.set(URL.createObjectURL(this.settingsService.avatar!))
      }
      if (type === 'header') {
        this.settingsService.headerImage = croppedImage
        this.newHeaderImage.set(URL.createObjectURL(this.settingsService.headerImage!))
      }
      this.settingsService.settingsModified.set(true)
    })
  }

  copyEmoji(emoji: Emoji) {
    navigator.clipboard.writeText(' ' + emoji.name + ' ')
    this.messageService.add({
      severity: 'success',
      summary: `The emoji ${emoji.name} was copied to your clipboard`
    })
  }
}
