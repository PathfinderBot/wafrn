import { Location } from '@angular/common'
import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  Signal,
  viewChild,
  ViewChild,
  ChangeDetectionStrategy
} from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCardModule } from '@angular/material/card'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatChipsModule } from '@angular/material/chips'
import { FontAwesomeModule, IconDefinition } from '@fortawesome/angular-fontawesome'
import {
  faClose,
  faEnvelope,
  faExclamationTriangle,
  faGlobe,
  faLandMineOn,
  faQuoteLeft,
  faServer,
  faSkullCrossbones,
  faUnlock,
  faUser,
  faPaperPlane,
  faNewspaper,
  faAt,
  faCircleInfo,
  faPlus,
  faPencil,
  faQuestion,
  faAngleDown,
  faMessage
} from '@fortawesome/free-solid-svg-icons'
import { PostHeaderComponent } from '../post/post-header/post-header.component'
import { PostFragmentComponent } from '../post-fragment/post-fragment.component'
import { SingleAskComponent } from '../single-ask/single-ask.component'
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu'
import { FileUploadComponent } from '../file-upload/file-upload.component'
import { MediaPreviewComponent } from '../media-preview/media-preview.component'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { AvatarSmallComponent } from '../avatar-small/avatar-small.component'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatTooltipModule } from '@angular/material/tooltip'
import { InfoCardComponent } from '../info-card/info-card.component'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MatBadgeModule } from '@angular/material/badge'
import { EmojiPickerComponent } from '../emoji-picker/emoji-picker.component'
import { Dialog } from '@angular/cdk/dialog'
import { Router } from '@angular/router'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import Fuse from 'fuse.js'
import { MatSelectModule } from '@angular/material/select'
import { Subscription, Subject, debounceTime, from } from 'rxjs'
import { BlogDetails } from '../../interfaces/blogDetails'
import { EditorData } from '../../interfaces/editor-data'
import { Emoji } from '../../interfaces/emoji'
import { EmojiCollection } from '../../interfaces/emoji-collection'
import { InteractionControl } from '../../interfaces/InteractionControl'
import { ProcessedPost } from '../../interfaces/processed-post'
import { QuestionPollQuestion } from '../../interfaces/questionPoll'
import { SimplifiedUser } from '../../interfaces/simplified-user'
import { WafrnMedia } from '../../interfaces/wafrn-media'
import { DashboardService } from '../../services/dashboard.service'
import { EditorService } from '../../services/editor.service'
import { EnvironmentService } from '../../services/environment.service'
import { JwtService } from '../../services/jwt.service'
import { LoginService } from '../../services/login.service'
import { MessageService } from '../../services/message.service'
import { ParticleService } from '../../services/particle.service'
import { PostsService } from '../../services/posts.service'
import { SettingsService } from '../../services/settings.service'
import { Language } from '../../interfaces/language'

type EmojiSuggestion = {
  img: string
  id: string
  name: string
}

@Component({
  selector: 'app-new-editor',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FontAwesomeModule,
    PostHeaderComponent,
    PostFragmentComponent,
    SingleAskComponent,
    MatMenuModule,
    FileUploadComponent,
    MediaPreviewComponent,
    MatProgressSpinnerModule,
    AvatarSmallComponent,
    MatCheckboxModule,
    MatTooltipModule,
    InfoCardComponent,
    TranslateModule,
    MatBadgeModule,
    MatChipsModule,
    MatProgressBarModule,
    MatSelectModule
  ],
  templateUrl: './new-editor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './new-editor.component.scss'
})
export class NewEditorComponent implements OnInit, OnDestroy {
  private messages = inject(MessageService)
  private dashboardService = inject(DashboardService)
  private editorService = inject(EditorService)
  private loginService = inject(LoginService)
  postService = inject(PostsService)
  settingsService = inject(SettingsService)
  private jwtService = inject(JwtService)
  private router = inject(Router)
  private location = inject(Location)
  private particle = inject(ParticleService)
  private translateService = inject(TranslateService)

  privacyOptions = [
    { level: 0, name: 'Public', icon: faGlobe },
    { level: 3, name: 'Unlisted', icon: faUnlock },
    { level: 2, name: 'This instance only', icon: faServer },
    { level: 1, name: 'Followers only', icon: faUser },
    { level: 10, name: 'Direct Message', icon: faEnvelope },
    { level: 20, name: 'Link Only', icon: faNewspaper }
  ]
  quoteOpen = false
  data: EditorData | undefined
  emojiDialog = inject(Dialog)
  editing = false
  baseMediaUrl = EnvironmentService.environment.baseMediaUrl
  userSelectionMentionValue = ''
  contentWarning = ''
  enablePrivacyEdition = true
  pollQuestions: QuestionPollQuestion[] = []
  disableImageUploadButton = false
  uploadedMedias: WafrnMedia[] = []
  languages: Language[] = []

  settings = this.settingsService.values()

  postContent = viewChild<ElementRef<HTMLTextAreaElement>>('postContent')
  @ViewChild('suggestionsMenu') suggestionsMenu!: MatMenuTrigger
  @ViewChild(FileUploadComponent) fileUploadComponent: FileUploadComponent | undefined

  suggestionLoading = signal(false)
  suggestionMatches = signal(false)
  suggestions: { img: string; text: string; id?: string }[] = []
  emojiSuggestions: EmojiSuggestion[] = []
  cursorPosition = {
    x: 0,
    y: 0
  }

  cursorTextPosition = 0

  showContentWarning = false
  displayMarqueeButton = false
  postCreatorForm = new FormGroup({
    content: new FormControl('')
  })
  initialContent = ''
  tags: string = ''
  privacy: number = 0
  urlPostToQuote: string = ''
  quoteLoading = false
  postBeingSubmitted = false
  draggingOverTextarea = false

  // Multi user posting index of current user
  currentUser: Signal<BlogDetails | undefined> = computed(() => this.accountList().at(this.posterAccount())?.blog)
  posterAccount = signal(0)
  accountList
  toAvatarUrl // mirrored function

  closeIcon = faClose
  quoteIcon = faQuoteLeft
  contentWarningIcon = faExclamationTriangle
  landMineIcon = faLandMineOn
  skull = faSkullCrossbones
  infoIcon = faCircleInfo
  alertIcon = faExclamationTriangle
  postIcon = faPaperPlane
  atIcon = faAt
  addIcon = faPlus
  editingIcon = faPencil
  replyAskIcon = faQuestion
  dropdownIcon = faAngleDown
  interactionControlIcon = faMessage

  emojiSubscription: Subscription
  editorUpdatedSubscription: Subscription | undefined
  httpMentionPetitionSubscription: Subscription | undefined
  scrollSubject = new Subject<void>()
  scrollSubscription: Subscription

  mentionedUsers: SimplifiedUser[] = []
  showMentionedUsersList = true

  canBeQuoted = InteractionControl.Anyone
  canEditCanReply = true

  canReply = InteractionControl.Anyone
  canLike = InteractionControl.Anyone

  canBeQuotedOptions = [
    {
      value: InteractionControl.Anyone,
      viewValue: this.translateService.instant('editor.interactionControl.anyoneCanQuote')
    },
    {
      value: InteractionControl.NoOne,
      viewValue: this.translateService.instant('editor.interactionControl.noOneCanQuote')
    }
  ]
  canReplyOptions = [
    {
      value: InteractionControl.Anyone,
      viewValue: this.translateService.instant('editor.interactionControl.anyone')
    },
    {
      value: InteractionControl.FollowingAndMentioned,
      viewValue: this.translateService.instant('editor.interactionControl.FollowingAndMentioned')
    },
    {
      value: InteractionControl.FollowersAndMentioned,
      viewValue: this.translateService.instant('editor.interactionControl.FollowersAndMentioned')
    },
    {
      value: InteractionControl.FollowersFollowingAndMentioned,
      viewValue: this.translateService.instant('editor.interactionControl.FollowersFollowingAndMentioned')
    },
    {
      value: InteractionControl.MentionedUsersOnly,
      viewValue: this.translateService.instant('editor.interactionControl.MentionedUsersOnly')
    }
  ]

  emojiCacherUrl =
    (EnvironmentService.environment.cacheDomain ? EnvironmentService.environment.cacheDomain : '') +
    '/api/v2/cache/emoji/'

  parser = new DOMParser()

  // Emoji search
  emojiCollections = signal<EmojiCollection[]>([])
  emojiProcessed = computed<Emoji[]>(() =>
    this.emojiCollections()
      .flatMap((collection) => collection.emojis.map((emoji) => emoji))
      .map((emoji) => {
        return emoji
      })
  )
  fuse = new Fuse<Emoji>([], {
    threshold: 0.4,
    keys: [
      { name: 'id' },
      {
        name: 'name',
        getFn: (emoji) => {
          // Trim keyboard emoji
          const keyboardEmoji = emoji.id !== emoji.name
          if (keyboardEmoji) return emoji.name.split(')').at(1) ?? emoji.name

          return emoji.name
        }
      }
    ]
  })

  constructor() {
    const dashboardService = this.dashboardService
    const loginService = this.loginService

    // Current account is assumed to be the logged in user
    this.accountList = loginService.accountList
    this.toAvatarUrl = dashboardService.getAvatarUrl

    this.data = EditorService.editorData
    this.editing = this.data?.edit == true
    this.privacy = this.data?.privacy ?? this.loginService.getUserDefaultPostPrivacyLevel()
    this.canReply = this.loginService.getUserDefaultReplyControl()
    this.canBeQuoted = this.loginService.getUserDefaultQuoteControl()
    if (this.data?.content) {
      this.postCreatorForm.controls['content'].patchValue(this.data.content)
    }
    if (this.data?.mentionUser) {
      this.mentionedUsers.push(this.data.mentionUser)
    }
    if (this.data?.post) {
      this.contentWarning = this.data.post.content_warning ?? ''
      this.privacy = Math.max(this.data.post.privacy, this.privacy)
    }
    this.emojiSubscription = this.postService.updateFollowers.subscribe(() => {
      this.emojiCollections.set([...this.postService.emojiCollections])
      this.fuse.setCollection(this.emojiProcessed())
      this.languages = this.postService.languages
    })
    this.postService.loadFollowers()
    const currentUserId = this.jwtService.getTokenData()?.userId
    if (this.data?.post?.mentionPost && this.data.post.mentionPost.length > 0) {
      const mentionedUsersSet = new Set(this.data.post.mentionPost.filter((elem) => elem.id != currentUserId))
      this.mentionedUsers = Array.from(mentionedUsersSet)
    }
    if (this.data?.post) {
      if (
        this.data.post.user.id != currentUserId &&
        !this.mentionedUsers.map((elem) => elem.id).includes(this.data.post.user.url)
      ) {
        this.mentionedUsers.push(this.data.post.user)
      }
    }

    if (this.settings.autoAddSpecifiedTags) {
      this.tags = this.settings.autoAddSpecifiedTags as string
    }

    if (this.settings.autoAddSpecifiedTagsAsks && this.data?.ask) {
      if (this.tags && this.settings.autoAddSpecifiedTagsAsksNoGeneral) {
        this.tags = [this.tags, this.settings.autoAddSpecifiedTagsAsks as string].join(', ')
      } else {
        this.tags = this.settings.autoAddSpecifiedTagsAsks as string
      }
    }

    if (this.settings.autoAddContentWarning) {
      this.showContentWarning = true
      this.contentWarning = this.settings.autoAddContentWarning as string
    }

    if (this.editing && this.data?.post) {
      if (this.data.post.markdownContent) {
        this.postCreatorForm.controls['content'].patchValue(this.data.post.markdownContent)
      } else {
        this.messages.add({
          severity: 'warn',
          summary: 'editor.oldPostHtmlRawWarning',
          translate: true
        })
        this.postCreatorForm.controls['content'].patchValue(this.data.post.content)
      }
      this.contentWarning = this.data.post.content_warning ?? ''
      this.tags = this.data.post.tags.map((tag) => tag.tagName).join(',')
      this.uploadedMedias = this.data.post.medias ? this.data.post.medias.filter((elem) => elem.mediaOrder < 9999) : []
      this.privacy = this.data.post.privacy
    }

    this.scrollSubscription = this.scrollSubject.pipe(debounceTime(500)).subscribe(() => {
      this.doUpdateMentionsPanelPosition()
    })
  }

  ngOnInit() {
    // Do not autofocus on touchscreens due to IOS bug
    const deviceIsTouchscreen = window.matchMedia('(pointer: coarse)').matches
    if (deviceIsTouchscreen) return

    const autoFocusElem = <HTMLElement | null>document.querySelector('[autofocus]')

    // If parent is bsky, we set canreply same as parent
    if (this.data?.post && this.data.post.replyControl != InteractionControl.Anyone) {
      this.canReply = InteractionControl.SameAsOp
      this.canEditCanReply = false
    }

    // Focus on the next frame (EVIL FIX)
    requestAnimationFrame(() => {
      autoFocusElem?.focus()
    })
  }

  @HostListener('window:scroll')
  updateMentionsPanelPosition() {
    this.scrollSubject.next()
  }

  doUpdateMentionsPanelPosition() {
    if (this.editorUpdatedSubscription) {
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight
      const textarea = document.getElementById('postCreatorContent') as HTMLTextAreaElement
      const internalPosition = this.getCaretPosition(textarea)
      const rect = textarea.getBoundingClientRect()
      // 350 being the max width of the suggestions menu and 350 being the max height
      this.cursorPosition = {
        x: Math.min(internalPosition.x + rect.x, screenWidth - 350),
        y: Math.min(
          Math.max(48, internalPosition.y + rect.y),
          Math.max(screenHeight - 325, screenHeight - 64 * this.suggestions.length)
        )
      }
    }
  }

  updateMentionsSuggestions(newText: string | null, cursorPosition: number) {
    this.httpMentionPetitionSubscription?.unsubscribe()
    this.suggestions.length = 0
    this.emojiSuggestions.length = 0
    this.suggestionLoading.set(false)

    const textToMatch = (' ' + newText?.slice(cursorPosition - 250, cursorPosition).replaceAll('\n', ' ')) as string
    const match = textToMatch
      .match(/[\n\r\s]?[@:][\w-\.]+@?[\w-\.]*$/)
      ?.at(0)
      ?.trim()
    const trailingSpace = newText?.endsWith(' ')
    if (!match || trailingSpace) {
      this.suggestionMatches.set(false)
      return
    }
    this.suggestionMatches.set(true)

    const matchIsUser = match.startsWith('@')
    if (matchIsUser) {
      this.suggestionLoading.set(true)
      this.httpMentionPetitionSubscription = from(
        this.editorService.searchUser(match.toLowerCase().slice(1))
      ).subscribe((res: any) => {
        this.suggestions = res.users.map((elem: any) => {
          return {
            img: elem.avatar,
            text: elem.url,
            id: elem.id
          }
        })
        this.httpMentionPetitionSubscription?.unsubscribe()
        this.suggestionLoading.set(false)
      })
    } else {
      // Evil regex to remove VARIATION SELECTOR 1-16 (check https://unicode-explorer.com/b/FE00)
      // These made certain keyboard emoji duplicate. Agony.
      //
      // Sliced to 25 because if you have more than that many suggestions you have a problem
      const matchedEmojiIds = [
        ...new Set(this.fuse.search(match).map((res) => res.item.id.replaceAll(/([\uFE00-\uFE0F])/g, '')))
      ].slice(0, 25)
      this.emojiSuggestions = matchedEmojiIds
        .map((id) => this.emojiProcessed().find((emoji) => emoji.id === id))
        .filter((elem) => elem !== undefined)
        .map((emoji) => ({
          img: emoji.url ? this.emojiCacherUrl + emoji.uuid : '',
          id: emoji.id,
          name: emoji.name.includes(')') ? emoji.name.split(')')[1] : emoji.name
        }))
    }
  }

  insertMention(user: { img: string; text: string }) {
    let initialPart = (' ' + this.postCreatorForm.value.content?.slice(0, this.cursorTextPosition)) as string
    const userUrl = user.text.startsWith('@') ? user.text : '@' + user.text
    initialPart = initialPart.replace(/[[@][A-Z0-9a-z_.@-]*$/i, userUrl)
    let finalPart = this.postCreatorForm.value.content?.slice(this.cursorTextPosition) as string
    this.postCreatorForm.controls['content'].patchValue(initialPart.trim() + ' ' + finalPart.trim())
    this.postContent()?.nativeElement.focus()
    this.suggestions = []
    this.suggestionMatches.set(false)
  }

  insertEmoji(emoji: EmojiSuggestion) {
    let initialPart = (' ' + this.postCreatorForm.value.content?.slice(0, this.cursorTextPosition)) as string
    initialPart = initialPart.replace(/[[:][A-Z0-9a-z_.@-]*$/i, emoji.id)
    let finalPart = this.postCreatorForm.value.content?.slice(this.cursorTextPosition) as string
    this.postCreatorForm.controls['content'].patchValue(initialPart.trim() + ' ' + finalPart.trim())
    this.postContent()?.nativeElement.focus()
    this.emojiSuggestions.length = 0
    this.suggestionMatches.set(false)
  }

  ngOnDestroy(): void {
    this.emojiSubscription.unsubscribe()
    this.editorUpdatedSubscription?.unsubscribe()
    this.httpMentionPetitionSubscription?.unsubscribe()
    this.scrollSubscription.unsubscribe()
  }

  get privacyOption() {
    return this.privacyOptions.find((elem) => elem.level === this.privacy)
  }

  getPrivacyIcon() {
    if (Number.isNaN(this.privacy)) {
      this.privacy = 0
    }
    const res = this.privacyOptions.find((elem) => elem.level === this.privacy)?.icon as IconDefinition
    return res
  }

  getPrivacyIconName() {
    return this.privacyOptions.find((elem) => elem.level === this.privacy)?.name
  }

  get idPostToReblog() {
    return this.data?.post?.id
  }

  async uploadImage(media: WafrnMedia) {
    try {
      media.url = ''
      this.uploadedMedias.push(media)
      this.messages.add({
        severity: 'success',
        summary: 'Media uploaded and added to the woot! Please fill in the description'
      })
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'Oh no! something went wrong'
      })
    }
    this.disableImageUploadButton = false
  }

  async uploadCanceled() {
    this.messages.add({
      severity: 'info',
      summary: 'Upload canceled'
    })
  }

  async loadQuote() {
    const urlString = this.urlPostToQuote
    this.quoteLoading = true
    try {
      const url = new URL(urlString)
      let postToAdd: ProcessedPost | undefined
      if (url.host === new URL(EnvironmentService.environment.frontUrl).host) {
        // URL is a local one.  We need to check if it includes an UUID
        const UUIDRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gm
        const matches = urlString.match(UUIDRegex)
        if (matches) {
          const uuid = matches[0]
          const postFromBackend = await this.dashboardService.getPostV2(uuid)
          if (postFromBackend) {
            postToAdd = postFromBackend[postFromBackend.length - 1]
          }
        } else {
          this.messages.add({
            severity: 'error',
            summary: 'Sorry the url you pasted does not seem to be valid'
          })
        }
      } else {
        // url is external. we call the search function
        const searchResult = await this.dashboardService.getSearchPage(0, urlString)
        if (searchResult && searchResult.posts && searchResult.posts.length > 0) {
          postToAdd = searchResult.posts[0][searchResult.posts[0].length - 1]
        }
      }
      if (postToAdd) {
        if (postToAdd.privacy === 10 || postToAdd.privacy === 1 || postToAdd.privacy === 2) {
          this.messages.add({
            severity: 'error',
            summary: 'Sorry the post you selected is not quotable because of settings of the user'
          })
        } else {
          postToAdd.quotes = []
          if (this.data) {
            this.data.quote = postToAdd
          } else {
            this.data = {
              scrollDate: new Date(),
              path: '/',
              quote: postToAdd
            }
          }
        }
      } else {
        this.messages.add({
          severity: 'error',
          summary: 'Sorry we could not find the post you requested'
        })
      }
    } catch (error) {
      console.error(error)
      this.messages.add({
        severity: 'error',
        summary: 'Something went wrong when trying to load this.'
      })
    }
    this.quoteLoading = false
  }

  allDescriptionsFilled(): boolean {
    const disableCheck = localStorage.getItem('disableForceAltText') === 'true'
    return disableCheck || this.uploadedMedias.every((med) => med.description)
  }

  deleteImage(index: number) {
    // TODO we should look how to clean the disk at some point. A call to delete the media would be nice
    this.uploadedMedias.splice(index, 1)
  }

  @HostListener('keydown.control.enter')
  async submitPost() {
    if (
      !this.allDescriptionsFilled() ||
      this.postBeingSubmitted ||
      (this.postCreatorForm.value.content === this.initialContent &&
        this.tags.length === 0 &&
        this.uploadedMedias.length === 0)
    ) {
      this.messages.add({
        severity: 'error',
        summary: 'Write a post or do something'
      })
      return
    }
    this.postBeingSubmitted = true
    let tagsToSend = ''
    this.tags
      .split(',')
      .map(this.tagMap)
      .filter((t) => t !== '')
      .forEach((elem) => {
        tagsToSend = `${tagsToSend}${elem.trim()},`
      })
    tagsToSend = tagsToSend.slice(0, -1)
    let res = undefined
    const content = this.postCreatorForm.value.content ? this.postCreatorForm.value.content : ''
    // if a post includes only tags, we reblog it and then we also create the post with tags. Thanks shadowjonathan
    if (
      this.uploadedMedias.length === 0 &&
      content.length === 0 &&
      tagsToSend.length > 0 &&
      this.idPostToReblog &&
      !this.data?.quote?.id
    ) {
      await this.editorService.createPost({
        mentionedUsers: [],
        content: '',
        idPostToReblog: this.idPostToReblog,
        privacy: this.loginService.getUserDefaultRewootPrivacyLevel(),
        media: []
      })
      // wait 500 milliseconds
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const mentionsToBeSent = this.mentionedUsers.map((elem) => elem.id)
    res = await this.editorService.createPost({
      // deduplicate mentions too just in case
      mentionedUsers: Array.from(new Set(mentionsToBeSent)),
      content: content,
      media: this.uploadedMedias,
      privacy: this.privacy,
      tags: tagsToSend,
      idPostToReblog: this.editing ? undefined : this.idPostToReblog,
      contentWarning: this.contentWarning,
      idPostToEdit: this.editing ? this.idPostToReblog : undefined,
      idPosToQuote: this.data?.quote?.id,
      ask: this.data?.ask,
      withToken: this.loginService.accountList().at(this.posterAccount())?.token,
      canReply: this.canReply,
      canBeQuoted: this.canBeQuoted,
      canLike: this.canLike
    })
    // its a great time to check notifications isnt it?
    this.dashboardService.scrollEventEmitter.emit('post')
    const disableConfetti = localStorage.getItem('disableConfetti') == 'true'
    if (res.success) {
      this.messages.add({
        severity: 'success',
        summary: 'Your woot has been published!',
        soundName: 'sendWoot',
        route: '/fediverse/post/' + res.id
      })
      this.particle.emojiReact(['✏️', '🖍️', '✒️', '🖊️'])
      this.postCreatorForm.value.content = ''
      this.uploadedMedias = []
      this.tags = ''
      if (this.data?.ask) {
        // super dirty but we take you to your homepage after an ask
        this.router.navigate(['/'])
      } else {
        this.closeEditor()
      }
    } else {
      this.messages.add({
        severity: 'error',
        summary: 'messages.genericError'
      })
    }
    this.postBeingSubmitted = false
  }

  closeEditor() {
    this.location.back()
  }

  tagMap(tags: string): string {
    const trimmed = tags.trim()
    const prefixRemoved = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed

    return prefixRemoved
  }

  // things for calculating position
  // THANK YOU https://codepen.io/audinue/pen/EogPqQ

  createCopy(textArea: HTMLTextAreaElement) {
    var copy = document.createElement('div')
    copy.textContent = textArea.value
    var style = getComputedStyle(textArea)
    ;[
      'fontFamily',
      'fontSize',
      'fontWeight',
      'wordWrap',
      'whiteSpace',
      'borderLeftWidth',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth'
    ].forEach(function (key: any) {
      copy.style[key] = style[key]
    })
    copy.style.overflow = 'auto'
    copy.style.width = textArea.offsetWidth + 'px'
    copy.style.height = textArea.offsetHeight + 'px'
    copy.style.position = 'absolute'
    copy.style.left = textArea.offsetLeft + 'px'
    copy.style.top = textArea.offsetTop + 'px'
    document.body.appendChild(copy)
    return copy
  }

  getCaretPosition(textArea: HTMLTextAreaElement) {
    let start = textArea.selectionStart
    let end = textArea.selectionEnd
    let copy = this.createCopy(textArea)
    let range = document.createRange()
    let firstChild = copy.firstChild
    let res = {
      x: 0,
      y: 0
    }
    if (firstChild) {
      range.setStart(firstChild, start)
      range.setEnd(firstChild, end)
      let selection = document.getSelection() as Selection
      selection.removeAllRanges()
      selection.addRange(range)
      var rect = range.getBoundingClientRect()
      document.body.removeChild(copy)
      textArea.selectionStart = start
      textArea.selectionEnd = end
      textArea.focus()
      res = {
        x: rect.left - textArea.scrollLeft,
        y: rect.top - textArea.scrollTop
      }
    }
    return res
  }

  editorFocusedOut() {
    this.editorUpdatedSubscription?.unsubscribe()
    this.httpMentionPetitionSubscription?.unsubscribe()
    this.editorUpdatedSubscription = undefined
    this.httpMentionPetitionSubscription = undefined
  }
  editorFocusedIn() {
    this.editorUpdatedSubscription = this.postCreatorForm.controls['content'].valueChanges
      .pipe(debounceTime(500))
      .subscribe((newValue) => this.editorUpdateProcess(newValue))
  }

  editorUpdateProcess(change: string | null) {
    const postElement = this.postContent()?.nativeElement
    if (!postElement) return

    // we only call the event if user is writing to avoid TOOMFOLERY
    const textSelected = postElement.selectionStart !== postElement.selectionEnd
    if (textSelected) return

    this.updateMentionsSuggestions(change, postElement.selectionStart)
    this.cursorTextPosition = postElement.selectionStart
  }

  removeMention(index: number) {
    this.mentionedUsers.splice(index, 1)
  }

  openEmojiSelection(): void {
    const textarea = document.getElementById('postCreatorContent') as HTMLTextAreaElement
    const pos = textarea.selectionStart
    const dialogRef = this.emojiDialog.open<Emoji>(EmojiPickerComponent)

    dialogRef.closed.subscribe((result) => {
      if (result) {
        // we use the reactform for this
        this.postCreatorForm.controls['content'].patchValue(
          textarea.value.slice(0, pos) + result.name + textarea.value.slice(pos)
        )
      }
    })
  }

  calculateBskyPostLength() {
    const cwText = this.contentWarning.length > 0 ? `[${this.contentWarning.trim()}]\n` : ''
    const tagText =
      this.tags.length > 0
        ? `\n${this.tags
            .split(',')
            .map((elem) => '#' + elem)
            .join(' ')}`
        : ''
    const askText = this.data?.ask
      ? (this.data.ask.user ? this.data.ask.user.url : 'anonymous') + ' asked: ' + this.data.ask.question + '\n\n'
      : ''
    const fediQuoteText = this.data?.quote && !this.data.quote.bskyUri ? '\nRE: ' + this.data?.quote.remotePostId : ''
    const inputText = `${askText}${cwText}${this.removeMarkdown(
      this.postCreatorForm.controls['content'].value as string
    ).trim()}${tagText}${fediQuoteText}`

    const encoder = new TextEncoder()
    return encoder.encode(inputText).byteLength
  }

  calculateBskyPostLengthPercent() {
    return this.calculateBskyPostLength() / 300 // max characters
  }

  removeMarkdown(text: string) {
    return (
      text
        // Remove setext-style headers
        .replaceAll(/^[=\-]{2,}\s*$/g, '')
        // Remove footnotes?
        .replaceAll(/\[\^.+?\](\: .*?$)?/g, '')
        .replaceAll(/\s{0,2}\[.*?\]: .*?$/g, '')
        // Remove images
        .replaceAll(/\!\[(.*?)\][\[\(].*?[\]\)]/g, '')
        // Remove blockquotes
        .replaceAll(/^(\n)?\s{0,3}>\s?/gm, '$1')
        // Remove reference-style links?
        .replaceAll(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, '')
        // Remove atx-style headers
        .replaceAll(/^(\n)?\s{0,}#{1,6}\s*( (.+))? +#+$|^(\n)?\s{0,}#{1,6}\s*( (.+))?$/gm, '$1$3$4$6')
        // Remove code blocks
        .replaceAll(/(`{3,})(.*?)\1/gms, '$2')
        .replaceAll(/(`{3,})(md)(.*?)\1/gms, '$3')
        // Remove inline code
        .replaceAll(/`(.+?)`/gs, '$1')
    )
  }

  mediaIsVideo(media: WafrnMedia) {
    return media.url.endsWith('mp4') // technology
  }

  handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items
    // const files = event.clipboardData?.files // Does not allow us to check for firefox, might have better API though!
    if (items === undefined) return

    // Has to be a for loop because of evil APIs
    const mediaFormats = ['image', 'video', 'audio']
    const mediaItems = []
    for (let i = 0; i < items.length; i++) {
      const element = items[i]
      const itemIsMedia = mediaFormats.some((format) => element.type.includes(format))
      if (element.type === 'application/x-moz-file') {
        this.messages.add({
          severity: 'warn',
          summary: 'Firefox does not allow reading the clipboard from file explorers, try dragging the file in'
        })
      }
      if (itemIsMedia) {
        mediaItems.push(items[i])
      }
    }
    if (mediaItems.length === 0) return

    for (const item of mediaItems) {
      const image = item.getAsFile()
      if (!image) return

      this.fileUploadComponent?.uploadFile(image)
    }
  }

  handleDrop(event: DragEvent) {
    const isMedia = event.dataTransfer?.types.includes('Files')
    if (!isMedia) return

    event.preventDefault()
    this.draggingOverTextarea = false

    // Handle Firefox jank and guard for if we had to resort to dark arts
    const items = event.dataTransfer?.items
    if (items && this.handleFirefoxJank(items)) return

    // Otherwise we can just do the normal File jank...
    const fileList: File[] = []
    if (event.dataTransfer) {
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        const file = event.dataTransfer.files[i]
        const mediaFormats = ['image', 'video', 'audio']
        const fileIsMedia = mediaFormats.some((format) => file.type.includes(format))
        if (fileIsMedia) {
          fileList.push(file)
        }
      }
    }
    if (fileList.length === 0) return

    for (const file of fileList) {
      this.fileUploadComponent?.uploadFile(file)
    }
  }

  // Returns true if we had to do it the evil way
  handleFirefoxJank(items: DataTransferItemList): boolean {
    for (let i = 0; i < items.length; i++) {
      const element = items[i]

      // we got a dragged file from the DOM so now we have to go to callback hell
      // there's no way to await this, by the way
      if (element.type === 'application/x-moz-file-promise-url') {
        element.getAsString(async (url) => {
          const blob = await fetch(url).then((res) => res.blob())
          if (blob === null) return
          const file = new File([blob], 'image.' + blob.type.split('/')[1], {
            type: blob.type
          })
          this.fileUploadComponent?.uploadFile(file)
        })
        return true
      }
    }
    return false
  }

  handleDrag(event: DragEvent) {
    const isMedia = event.dataTransfer?.types.includes('Files')
    if (isMedia) {
      if (event.type === 'dragenter') {
        this.draggingOverTextarea = true
      } else {
        this.draggingOverTextarea = false
      }
    }
  }

  setPoster(index: number) {
    this.posterAccount.set(index)
  }
}
