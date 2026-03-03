import { HttpClient } from '@angular/common/http'
import { ChangeDetectorRef, Component, inject } from '@angular/core'
import { lastValueFrom } from 'rxjs'
import { FollowListElem } from 'src/app/interfaces/follow-list-elem'
import { EnvironmentService } from 'src/app/services/environment.service'
import { MessageService } from 'src/app/services/message.service'
import { PostsService } from 'src/app/services/posts.service'

@Component({
  selector: 'app-import-followers',
  templateUrl: './import-followers.component.html',
  styleUrls: ['./import-followers.component.scss'],
  standalone: false
})
export class ImportFollowersComponent {
  private http = inject(HttpClient);
  private postService = inject(PostsService);
  private messages = inject(MessageService);
  private cdr = inject(ChangeDetectorRef)

  step = 0
  progress = 0.0
  failedFollows: string[] = []
  uploading = false
  size = parseInt(EnvironmentService.environment.maxUploadSize) * 1024 * 1024
  response: {
    foundUsers: FollowListElem[]
    notFoundUsers: string[]
  } = {
    foundUsers: [],
    notFoundUsers: []
  }

  responseResults: {
    success?: boolean
    newFollows: number
    alreadyFollowing: number
    errors: string[]
    message?: string
  } = {
    success: undefined,
    newFollows: 0,
    alreadyFollowing: 0,
    errors: []
  }
  async onFileSelected(event: Event) {
    this.uploading = true
    const el = event.target as HTMLInputElement
    const formdata = new FormData()
    if (el.files && el.files[0]) {
      formdata.append('follows', el.files[0])
      const uploadFollowListUrl = `${EnvironmentService.environment.baseUrl}/loadFollowList`
      const petition = await lastValueFrom(
        this.http.post<{
          foundUsers: FollowListElem[]
          notFoundUsers: string[]
        }>(uploadFollowListUrl, formdata)
      ).catch((error: any) => {
        console.error('error uploading')
        console.error(error)
      })
      if (petition) {
        this.messages.add({
          severity: 'info',
          summary: 'Following list recived'
        })
        this.response = petition
        this.step++
        this.cdr.detectChanges()
      }
    }
  }

  afterUpload(event: any) {
    const response = event.originalEvent.body
    if (response.success) {
      this.responseResults.success = true
      this.responseResults.newFollows = response.newFollows
      this.responseResults.alreadyFollowing = response.alreadyFollowing
      this.responseResults.errors = response.errors
    } else {
      this.responseResults.success = false
    }
    this.cdr.detectChanges()
  }


  async followEveryone() {
    this.step = this.step + 1
    for await (const user of this.response.foundUsers) {
      const res = await this.postService.followUser(user.id)
      if (!res) {
        this.failedFollows.push(user.url)
      }
      this.progress = this.progress + 1
      this.cdr.detectChanges()
    }
    this.step = this.step + 1
    this.messages.add({
      severity: 'success',
      summary: 'You Imported your follows'
    })
  }
}
