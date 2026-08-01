import {
  Component,
  computed,
  inject,
  NgZone,
  Signal,
  signal,
  WritableSignal,
  ChangeDetectionStrategy
} from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogState } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'
import { faKeyboard, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { TranslateModule, TranslateService, _ } from '@ngx-translate/core'
import { animationFrames, filter, fromEvent, map, merge, Subject, takeUntil, takeWhile } from 'rxjs'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { HotkeyAction, HotkeyService } from '../../services/hotkey.service'
import { EditorService } from '../../services/editor.service'
import { GlobalKeydownService, CallbackDictionary } from '../../services/global-keydown.service'
import { JwtService } from '../../services/jwt.service'
import { LoginService } from '../../services/login.service'
import { ThemeService } from '../../services/theme.service'

type HotkeyConfig = {
  [key in HotkeyAction]: string | undefined
}
type ShortcutFunctionMap = Record<string, Function>

type ScrollInput = 'up' | 'down' | 'upPage' | 'downPage' | null

const hotkeyData: Array<{ type: 'group'; value: HotkeyAction[] } | { type: 'header'; value: string }> = [
  { type: 'header', value: 'groupNavigation' },
  { type: 'group', value: ['scrollDown', 'scrollUp', 'scrollDownPage', 'scrollUpPage', 'nextPost', 'previousPost'] },
  { type: 'header', value: 'groupPostAction' },
  { type: 'group', value: ['likePost', 'rewootPost', 'replyPost', 'quotePost'] },
  { type: 'header', value: 'groupMisc' },
  { type: 'group', value: ['openEditor', 'viewKeyboardShortcuts'] }
]

const defaultKeybinds: HotkeyConfig = {
  scrollDown: 'j',
  scrollUp: 'k',
  scrollDownPage: 'd',
  scrollUpPage: 'u',
  nextPost: 'n',
  previousPost: 'p',
  likePost: 'l',
  rewootPost: 'R',
  replyPost: 'E',
  quotePost: 'Q',
  bookmarkPost: 'b',
  openEditor: 'e',
  viewKeyboardShortcuts: '?'
}

let hotkeysEnabled = true
let smoothScroll = signal(true)

@Component({
  selector: 'app-hotkey-manager',
  imports: [MatButtonModule, FontAwesomeModule, MatTooltipModule, BrowserAnimationsModule],
  templateUrl: './hotkey-manager.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './hotkey-manager.component.scss'
})
export class HotkeyManagerComponent {
  private keyboardService = inject(GlobalKeydownService)
  private editorService = inject(EditorService)
  private jwtService = inject(JwtService)
  private dialogService = inject(MatDialog)
  private loginService = inject(LoginService)
  private hotkeyService = inject(HotkeyService)
  private zone = inject(NgZone)

  scrollSize = 100 // Pixels per scroll
  scrollPageSize = 300 // Pixels per page scroll
  scrollRate = 120 // Milliseconds per pixel scroll and minimum scroll

  keyboardIcon = faKeyboard

  currentlyScrolling = false
  continueScrolling = false
  lockedScrollingDirection: ScrollInput = null
  scrollDirection: ScrollInput = null
  offsetDialogButton: Signal<boolean>
  dialogRef: MatDialogRef<HotkeyListComponent, DialogData> | undefined

  // Loaded and mapped from user profile
  shortcutListLookup: ShortcutFunctionMap = {
    scrollDown: () => {
      this.broadcastHotkey('scrollDown')
      this.scrollDown()
    },
    scrollUp: () => {
      this.broadcastHotkey('scrollUp')
      this.scrollUp()
    },
    scrollDownPage: () => {
      this.broadcastHotkey('scrollUpPage')
      this.scrollDownPage()
    },
    scrollUpPage: () => {
      this.broadcastHotkey('scrollDownPage')
      this.scrollUpPage()
    },
    nextPost: () => this.broadcastHotkey('nextPost'),
    previousPost: () => this.broadcastHotkey('previousPost'),
    likePost: () => this.broadcastHotkey('likePost'),
    rewootPost: () => this.broadcastHotkey('rewootPost'),
    replyPost: () => this.broadcastHotkey('replyPost'),
    quotePost: () => this.broadcastHotkey('quotePost'),
    bookmarkPost: () => this.broadcastHotkey('bookmarkPost'),
    openEditor: () => {
      this.broadcastHotkey('openEditor')
      this.openEditor()
    },
    viewKeyboardShortcuts: () => {
      this.broadcastHotkey('viewKeyboardShortcuts')
      this.openHotkeyListDialog()
    },
    no_op: () => {}
  }
  userMapping: HotkeyConfig
  shortcutList: WritableSignal<CallbackDictionary>

  constructor() {
    const themeService = inject(ThemeService)

    const cachedMap = localStorage.getItem('customHotKeyMapping')
    const customMapping = cachedMap !== null ? JSON.parse(cachedMap) : {}
    const joinedMapping = Object.assign(customMapping, defaultKeybinds)
    this.userMapping = joinedMapping
    this.shortcutList = signal(this.mapHotkeys(this.userMapping))

    const cachedSmoothScroll = (localStorage.getItem('hotkeySmoothScroll') ?? 'true') === 'true'
    smoothScroll.set(cachedSmoothScroll)

    this.keyboardService.keydownEvents.pipe(filter(() => hotkeysEnabled)).subscribe((key) => {
      this.keyboardService.handleKeydown(key, this.shortcutList())
    })

    const horizontalMenu = themeService.additionalStyleModes.horizontalMenu
    const topToolbar = themeService.additionalStyleModes.topToolbar
    this.offsetDialogButton = computed(() => horizontalMenu() && !topToolbar())
  }

  broadcastHotkey(action: HotkeyAction) {
    this.hotkeyService.hotkeySubscription.next(action)
  }

  saveHotkeys() {
    // Setting localStorage here because of cache issues in login service
    localStorage.setItem('customHotKeyMapping', JSON.stringify(this.userMapping))
    localStorage.setItem('hotkeySmoothScroll', smoothScroll().toString())
    this.loginService.updateUserOptions([
      { name: 'wafrn.customHotKeyMapping', value: JSON.stringify(this.userMapping) },
      { name: 'wafrn.hotkeySmoothScroll', value: smoothScroll().toString() }
    ])
  }

  mapHotkeys(hotkeys: HotkeyConfig) {
    return Object.fromEntries(
      Object.entries(hotkeys).map(([key, shortcutMapping]) => [
        shortcutMapping,
        this.shortcutListLookup[key] || this.shortcutListLookup['no_op']
      ])
    )
  }

  openHotkeyListDialog() {
    if (this.dialogRef?.getState() === MatDialogState.OPEN) {
      this.dialogRef.close()
      return
    }

    this.dialogRef = this.dialogService.open<HotkeyListComponent, DialogData>(HotkeyListComponent, {
      width: '400px',
      data: {
        currentHotkeys: this.userMapping
      },
      closePredicate: () => hotkeysEnabled
    })
    this.dialogRef.afterClosed().subscribe(() => {
      this.shortcutList.set(this.mapHotkeys(this.userMapping))
      this.saveHotkeys()
    })
  }

  scrollDown() {
    this.scrollDirection = 'down'
    this.scroll(this.scrollSize, this.userMapping['scrollDown'])
  }

  scrollUp() {
    this.scrollDirection = 'up'
    this.scroll(-this.scrollSize, this.userMapping['scrollUp'])
  }

  scrollDownPage() {
    this.scrollDirection = 'downPage'
    this.scroll(this.scrollPageSize, this.userMapping['scrollDownPage'])
  }

  scrollUpPage() {
    this.scrollDirection = 'upPage'
    this.scroll(-this.scrollPageSize, this.userMapping['scrollUpPage'])
  }

  scroll(amount: number, key: string | undefined) {
    // For motion sickness
    if (!smoothScroll()) {
      this.performScroll(amount)
      return
    }

    // Ignore held-key retrigger
    if (this.continueScrolling) return
    this.continueScrolling = true

    const otherKey: HotkeyAction[] = ['scrollUp', 'scrollDown', 'scrollUpPage', 'scrollDownPage']
    const otherKeyMapped = otherKey.map((key) => this.userMapping[key]).filter((k) => k !== key)

    const terminate = new Subject()

    // Cancel on started key depress or other scroll key pressed
    merge(
      fromEvent(document, 'keyup').pipe(
        takeUntil(terminate),
        filter((e) => (<KeyboardEvent>e).key === key)
      ),
      fromEvent(document, 'keydown').pipe(
        takeUntil(terminate),
        filter((e) => otherKeyMapped.includes((<KeyboardEvent>e).key))
      )
    ).subscribe(() => {
      this.continueScrolling = false
      terminate.next('')
    })

    let previousTimestamp: DOMHighResTimeStamp | null = null
    const currentDirection = this.scrollDirection
    let cancel = false
    const startTop = document.documentElement.scrollTop

    // Prevent multiple of the same scroll
    if (this.currentlyScrolling && this.lockedScrollingDirection === currentDirection) return
    this.lockedScrollingDirection = currentDirection

    this.zone.runOutsideAngular(() => {
      animationFrames()
        .pipe(
          map((val) => {
            const deltaTime = val.elapsed - (previousTimestamp ?? val.elapsed)
            previousTimestamp = val.elapsed
            return Object.assign(val, { deltaTime })
          }),
          takeWhile(() => currentDirection === this.scrollDirection && !cancel)
        )
        .subscribe(({ elapsed, deltaTime }) => {
          // Ensure exact minimum scroll distance
          const cancelScrolling = elapsed > this.scrollRate && !this.continueScrolling
          if (cancelScrolling) {
            this.currentlyScrolling = false
            cancel = true

            const currentTop = document.documentElement.scrollTop
            if (Math.abs(startTop - currentTop) < Math.abs(amount)) {
              const distance = amount - (currentTop - startTop)
              this.performScroll(distance)
            }
            return
          }

          this.currentlyScrolling = true

          const distance = amount * (deltaTime / this.scrollRate)
          this.performScroll(distance)
        })
    })
  }

  performScroll(amount: number) {
    this.zone.runOutsideAngular(() => {
      document.documentElement.scrollBy({ behavior: 'instant', top: amount })
    })
  }

  openEditor() {
    // Only if user is logged in
    if (!this.jwtService.tokenValid()) return
    this.editorService.openDialogWithData(undefined)
  }
}

interface DialogData {
  currentHotkeys: HotkeyConfig
}

@Component({
  selector: 'app-hotkey-list-dialog',
  imports: [MatButtonModule, FontAwesomeModule, TranslateModule, MatCheckboxModule],
  templateUrl: './hotkey-list-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './hotkey-manager.component.scss'
})
export class HotkeyListComponent {
  private translateService = inject(TranslateService)

  readonly data = inject<DialogData>(MAT_DIALOG_DATA)
  mapping = this.data.currentHotkeys
  defaultKeybinds = defaultKeybinds
  hotkeyData = hotkeyData

  changingKey: string | null = null
  cancelSetKeybind = new Subject()
  smoothScroll = smoothScroll

  undoIcon = faRotateLeft
  titleIcon = faKeyboard

  constructor() {
    this.cancelSetKeybind.subscribe(() => {
      hotkeysEnabled = true
      this.changingKey = null
    })
  }

  getKeybind(id: HotkeyAction) {
    const key = this.mapping[id] || this.translateService.instant(_('keyboard-shortcuts.unbound'))

    if (this.changingKey === id) {
      return `>${key}<`
    }

    return key
  }

  isOverlapping(key: string | undefined) {
    if (key === undefined) return false

    const allKeys = Object.entries(this.mapping).map((v) => v[1])
    return allKeys.indexOf(key) !== allKeys.lastIndexOf(key)
  }

  setKeybind(id: HotkeyAction) {
    if (!hotkeysEnabled) return
    hotkeysEnabled = false
    this.changingKey = id
    const modifierKeys = ['Shift', 'Alt', 'Control']

    fromEvent(document, 'keydown')
      .pipe(takeUntil(this.cancelSetKeybind))
      .subscribe((eventRaw) => {
        const e = <KeyboardEvent>eventRaw
        e.preventDefault()
        e.stopImmediatePropagation()
        const keyIsModifier = modifierKeys.includes(e.key)
        if (keyIsModifier) return

        const unbind = e.code === 'Escape'
        if (unbind) {
          this.mapping[id] = undefined
        } else {
          this.mapping[id] = e.shiftKey ? e.key.toUpperCase() : e.key
        }

        this.cancelSetKeybind.next('')
      })
  }

  resetKeybind(id: HotkeyAction) {
    this.mapping[id] = defaultKeybinds[id]
    this.cancelSetKeybind.next('')
  }

  toggleSignal(signal: WritableSignal<boolean>) {
    signal.update((v) => !v)
  }
}
