import { Component, computed, signal, Signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MatCardModule } from '@angular/material/card'
import { MatInputModule } from '@angular/material/input'
import { faImage, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatExpansionModule } from '@angular/material/expansion'
import { EmojiCollectionsComponent } from '../../../components/emoji-collections/emoji-collections.component'
import { SettingEntryComponent } from '../../../components/setting-entry/setting-entry.component'
import { BlogDetails } from '../../../interfaces/blog-details'
import { Emoji } from '../../../interfaces/emoji'
import { SelectImageButtonComponent } from '../../../components/select-image-button/select-image-button.component'
import { EnvironmentService } from '../../../services/environment.service'
import { ImageCropperService } from '../../../services/image-cropper.service'
import { LoginService } from '../../../services/login.service'
import { MessageService } from '../../../services/message.service'
import { SettingsService, SettingData, FediAttachment } from '../../../services/settings.service'

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
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings-profile.component.scss'
})
export class SettingsProfileComponent {
  private settingsService = inject(SettingsService)
  private messageService = inject(MessageService)
  private imageCropperService = inject(ImageCropperService)

  data: SettingData
  values
  fediAttachments: FediAttachment[]

  newHeaderImage = signal<string | null>(null)
  newAvatarImage = signal<string | null>(null)

  blog: Signal<BlogDetails | undefined>
  avatarUrl = computed<string>(() => {
    if (this.newAvatarImage() != null) return this.newAvatarImage()!
    const blog = this.blog()
    return blog
      ? `${EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''}/api/v2/cache/avatar/${blog.id}`
      : ''
  })
  headerUrl = computed<string>(() => {
    if (this.newHeaderImage() != null) return this.newHeaderImage()!
    const blog = this.blog()
    return blog
      ? `${EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : ''}/api/v2/cache/header/${blog.id}`
      : ''
  })

  imageIcon = faImage
  addIcon = faPlus
  removeIcon = faXmark

  constructor() {
    const settingsService = this.settingsService
    const loginService = inject(LoginService)

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
