import { HttpClient, HttpContext } from '@angular/common/http'
import { Injectable, OnDestroy, inject } from '@angular/core'
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs'

import { WafrnMedia } from '../interfaces/wafrn-media'
import { Action, EditorLauncherData } from '../interfaces/editor-launcher-data'
import { MatDialog } from '@angular/material/dialog'
import { ProcessedPost } from '../interfaces/processed-post'
import { Ask } from '../interfaces/ask'
import { DashboardService } from './dashboard.service'
import { EditorData } from '../interfaces/editor-data'
import { EnvironmentService } from './environment.service'

import { NewEditorComponent } from '../components/new-editor/new-editor.component'
import { MessageService } from './message.service'
import { SimplifiedUser } from '../interfaces/simplified-user'
import { Router } from '@angular/router'
import { AUTH_OVERRIDE } from '../interceptors/wafrn-auth.interceptor'
import { SimpleDialogService } from './simple-dialog.service'
import { InteractionControlType } from '../interfaces/interaction-control'

@Injectable({
  providedIn: 'root'
})
export class EditorService implements OnDestroy {
  private http = inject(HttpClient)
  private dashboardService = inject(DashboardService)
  private dialogService = inject(MatDialog)
  private messages = inject(MessageService)
  private router = inject(Router)
  private simpleDialogService = inject(SimpleDialogService)

  base_url = EnvironmentService.environment.baseUrl
  public launchPostEditorEmitter: BehaviorSubject<EditorLauncherData> = new BehaviorSubject<EditorLauncherData>({
    action: Action.None
  })

  editorSubscription: Subscription
  // TODO do something about this when angular 19, I dont like this too much
  public static editorData: EditorData | undefined
  constructor() {
    this.editorSubscription = this.launchPostEditorEmitter.subscribe((data) => {
      if (data.action !== Action.None) {
        this.launchPostEditorEmitter.next({
          action: Action.None
        })
      }
    })
  }
  ngOnDestroy(): void {
    this.editorSubscription.unsubscribe()
  }

  async createPost(options: {
    mentionedUsers: string[]
    content: string
    media: WafrnMedia[]
    privacy: number
    tags?: string
    idPostToReblog?: string
    contentWarning?: string
    blueskySelfLabel?: string
    blueskyGraphicMedia?: boolean
    idPostToEdit?: string
    idPosToQuote?: string
    ask?: Ask
    withToken?: string
    canReply?: InteractionControlType
    canLike?: InteractionControlType
    canBeQuoted?: InteractionControlType
  }): Promise<{ success: false } | { success: true; id: string }> {
    try {
      const httpOptions = options.withToken ? { context: new HttpContext().set(AUTH_OVERRIDE, options.withToken) } : {}
      const petitionResponse: any = await this.http
        .post(
          `${this.base_url}/v3/createPost`,
          {
            content: options.content,
            parent: options.idPostToReblog,
            medias: options.media,
            tags: options.tags,
            privacy: options.privacy,
            content_warning: options.contentWarning ?? '',
            blueskySelfLabel: options.blueskySelfLabel,
            blueskyGraphicMedia: options.blueskyGraphicMedia,
            idPostToEdit: options.idPostToEdit,
            postToQuote: options.idPosToQuote,
            ask: options.ask?.id,
            mentionedUserIds: options.mentionedUsers,
            canReply: options.canReply,
            canLike: options.canLike,
            canBeQuoted: options.canBeQuoted
          },
          httpOptions
        )
        .toPromise()
      if (petitionResponse && !('success' in petitionResponse)) {
        // HACK wait 0.7 seconds so post is fully processed?
        await new Promise((resolve) => setTimeout(resolve, 700))

        return { success: true, id: petitionResponse.id }
      }
    } catch (exception: any) {
      if (exception.error?.message) {
        this.simpleDialogService.createConfirmDialog({
          title: 'Error',
          content: exception.error.message,
          options: {
            confirm: 'ok'
          }
        })
      } else {
        this.messages.add({
          severity: 'warn',
          summary: 'Something went wrong and your woot was not published. Check your internet connection and try again'
        })
      }
    }

    return { success: false }
  }

  async uploadMedia(description: string, nsfw: boolean, img: File): Promise<WafrnMedia | undefined> {
    let res: WafrnMedia | undefined = undefined
    try {
      const payload = new FormData()
      payload.append('files', img)
      payload.append('description', description)
      payload.append('nsfw', nsfw.toString())
      const petition: any = await this.http
        .post<Array<WafrnMedia>>(`${EnvironmentService.environment.baseUrl}/uploadMedia`, payload)
        .toPromise()
      if (petition) {
        res = petition[0]
      }
    } catch (exception) {
      console.error(exception)
    }

    return res
  }

  async searchUser(url: string): Promise<{ users: SimplifiedUser[] }> {
    if (url.length === 0) return { users: [] }
    let result = await firstValueFrom(
      this.http.get<{
        users: SimplifiedUser[]
      }>(`${EnvironmentService.environment.baseUrl}/userSearch/${encodeURIComponent(url)}`)
    )
    return result || { users: [] }
  }

  public async replyPost(post: ProcessedPost, edit = false) {
    await this.openDialogWithData({ post: post, edit: edit })
  }

  public async quotePost(quoteTo: ProcessedPost) {
    await this.openDialogWithData({ quote: quoteTo })
  }

  public async replyAsk(ask: Ask) {
    await this.openDialogWithData({ ask: ask })
  }

  public async openDialogWithData(data: any) {
    if (this.dialogService.openDialogs.length === 0) {
      const mobile = window.innerWidth <= 992
      EditorService.editorData = {
        ...data,
        scrollDate: this.dashboardService.startScrollDate,
        path: window.location.pathname
      }
      this.router.navigate(['/editor'])
    }
  }

  async getEditorComponent() {
    const { NewEditorComponent } = await import('../components/new-editor/new-editor.component')
    return NewEditorComponent
  }
}
