import { HttpClient } from '@angular/common/http'
import { ChangeDetectorRef, Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { MatCardModule } from '@angular/material/card'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatButtonModule } from '@angular/material/button'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { TranslateModule } from '@ngx-translate/core'
import { lastValueFrom } from 'rxjs'
import { FollowListElem } from '../../../interfaces/follow-list-elem'
import { EnvironmentService } from '../../../services/environment.service'
import { MessageService } from '../../../services/message.service'
import { UserOptionsService } from '../../../services/user-options.service'

@Component({
  selector: 'app-import-followers',
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    FormsModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatProgressBarModule,
    TranslateModule
  ],
  templateUrl: './import-followers.component.html',
  styleUrls: ['./import-followers.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ImportFollowersComponent {
  private http = inject(HttpClient)
  private userOptionsService = inject(UserOptionsService)
  private messages = inject(MessageService)
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
        this.messages.add({
          severity: 'error',
          summary: 'Following list failed to load'
        })
        this.uploading = false
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
      const res = await this.userOptionsService.followUser(user.id)
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
