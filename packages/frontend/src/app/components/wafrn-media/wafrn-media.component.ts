import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  input,
  OnInit,
  Signal,
  ViewChild,
  inject,
  ChangeDetectionStrategy
} from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { MatButtonModule } from '@angular/material/button'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { TranslateModule } from '@ngx-translate/core'
import { LinkPreviewComponent } from '../link-preview/link-preview.component'
import { SafePipe } from '../../pipes/safe.pipe'
import { WafrnMedia } from '../../interfaces/wafrn-media'
import { EnvironmentService } from '../../services/environment.service'
import { MediaService } from '../../services/media.service'
import { faEyeSlash } from '@fortawesome/free-solid-svg-icons'
//@ts-expect-error something vite i dont remember
import Vlitejs from 'vlitejs'
import { SettingsService } from '../../services/settings.service'

type FitMode = 'contain' | 'cover'

@Component({
  selector: 'app-wafrn-media',
  imports: [MatCardModule, MatButtonModule, FontAwesomeModule, LinkPreviewComponent, TranslateModule, SafePipe],
  templateUrl: './wafrn-media.component.html',
  styleUrls: ['./wafrn-media.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class WafrnMediaComponent implements OnInit, AfterViewInit {
  private mediaService = inject(MediaService)
  private settingsService = inject(SettingsService)
  settings = this.settingsService.values()

  data = input.required<WafrnMedia>()
  filteredWords = input<string>()
  fitMode = input<FitMode>('contain')
  altTextButtons = input<boolean>(true)

  @ViewChild('videoelement') videoElement: ElementRef<HTMLVideoElement> | undefined
  @ViewChild('audioelement') audioElement: ElementRef<HTMLAudioElement> | undefined

  vlitePlayer: { play: Function; pause: Function } | undefined

  readonly extensionsToHideImgTag = ['mp4', 'aac', 'mp3', 'wav', 'ogg', 'webm', 'weba', 'svg', 'ogg', 'oga']
  readonly tmpUrl = computed<string>(
    () =>
      (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
      '/api/v2/cache/media/' +
      this.data().id
  )
  readonly displayUrl = computed<string>(() => this.tmpUrl())
  readonly extension = computed<string>(() => this.getExtension())
  readonly mimeType = computed<string>(() => this.getMimeType())
  readonly width = computed<number | ''>(() => this.data().width ?? '')
  readonly height = computed<number | ''>(() => this.data().height ?? '')
  readonly enableVideoControls = computed<boolean | ''>(() => this.mediaService.checkForceClassicVideoPlayer() ?? false)
  readonly enableAudioControls = computed<boolean | ''>(() => this.mediaService.checkForceClassicAudioPlayer() ?? false)

  private readonly alwaysAltMedia = ['audio']
  readonly alwaysShowAlt = computed<boolean>(() => this.alwaysAltMedia.includes(this.mimeType()?.split('/')[0]))

  private readonly nonsentitiveMedia = ['audio']
  readonly hideSensitiveButton = computed<boolean>(() =>
    this.nonsentitiveMedia.includes(this.mimeType()?.split('/')[0])
  )

  disableNSFWFilter: boolean
  hideNoDescriptionMedia: Signal<boolean>

  originallyNsfw = true
  nsfw = true
  viewLongImage = false
  descriptionVisible = this.settings.showMediaDescriptions || false
  // Icons
  readonly hideIcon = faEyeSlash

  errorMode = false
  constructor() {
    const mediaService = this.mediaService

    this.disableNSFWFilter = mediaService.checkNSFWFilterDisabled()
    this.hideNoDescriptionMedia = computed(() => this.settings.hideNoDescriptionMedia === true)
  }

  ngOnInit(): void {
    const noDescription = this.data().description === null
    const hasFilteredWords = this.filteredWords() !== undefined
    this.nsfw =
      this.settings.markAllMediaAsNSFW === true ||
      ((this.data().NSFW || (noDescription && this.hideNoDescriptionMedia()) || hasFilteredWords) &&
        !this.disableNSFWFilter)
    this.originallyNsfw = this.nsfw
  }

  ngAfterViewInit(): void {
    const videoElement = this.videoElement?.nativeElement
    if (videoElement && !this.mediaService.checkForceClassicVideoPlayer()) {
      this.vlitePlayer = new Vlitejs(videoElement, {
        options: {
          autoHide: true,
          autoHideDelay: 2000
        }
      }).player
    }
    const audioElement = this.audioElement?.nativeElement
    if (audioElement && !this.mediaService.checkForceClassicAudioPlayer()) {
      this.vlitePlayer = new Vlitejs(audioElement, {}).player
    }
  }

  showPicture() {
    this.nsfw = false
    this.viewLongImage = true
  }

  private getExtension() {
    const mediaUrl = this.data().url ? this.data().url.split('.') : ['']
    return mediaUrl[mediaUrl.length - 1].toLowerCase()
  }

  private getMimeType() {
    if (typeof this.data()?.mediaType === 'string') {
      return this.data().mediaType as string
    }
    switch (this.extension()) {
      case 'mp4': {
        return 'video/mp4'
      }
      case 'webm': {
        return 'video/webm'
      }
      case 'mp3': {
        return 'audio/mpeg'
      }
      case 'wav': {
        return 'audio/wav'
      }
      case 'ogg':
      case 'oga': {
        return 'audio/ogg'
      }
      case 'opus': {
        return 'audio/opus'
      }
      case 'aac': {
        return 'audio/aac'
      }
      case 'm4a': {
        return 'audio/mp4'
      }
      case 'pdf': {
        return 'pdf'
      }
      default: {
        return 'UNKNOWN'
      }
    }
  }

  handleError() {
    this.errorMode = true
  }

  toggleNsfw() {
    if (!this.nsfw) {
      this.vlitePlayer?.pause() || this.videoElement?.nativeElement.pause()
    }

    this.nsfw = !this.nsfw
  }
}
