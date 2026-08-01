import { Component, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MAT_DIALOG_DATA, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog'
import { TranslateModule } from '@ngx-translate/core'
import { MatInputModule } from '@angular/material/input'
import { CommonModule } from '@angular/common'
import { EnvironmentService } from '../../services/environment.service'

@Component({
  selector: 'follow-logged-out',
  imports: [MatInputModule, MatButtonModule, MatDialogTitle, MatDialogContent, TranslateModule, CommonModule],
  templateUrl: './follow-logged-out.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './follow-logged-out.component.scss'
})
export class FollowLoggedOutComponent {
  private dialogRef = inject<MatDialogRef<FollowLoggedOutComponent>>(MatDialogRef)
  data = inject<{
    url: string
    name?: string
    bskyDid?: string
    remoteId?: string
  }>(MAT_DIALOG_DATA)

  disabled = false
  formValid = computed<boolean>(() => this.fediUsername().length > 0 && !this.disabled)
  handle = ''
  url = ''
  name = ''
  remoteId: string | undefined = undefined
  bskyDid: string | undefined = undefined

  fediUsername = signal<string>('')

  constructor() {
    const data = this.data

    this.url = data.remoteId ?? `${EnvironmentService.environment.frontUrl}/blog/${data.url}`
    this.bskyDid = data.bskyDid
    this.handle = data.url.startsWith('@')
      ? data.url
      : `@${data.url}@${new URL(EnvironmentService.environment.frontUrl).hostname}`
    this.name = data.name ?? data.url
    this.remoteId =
      !data.remoteId?.startsWith(EnvironmentService.environment.frontUrl) && this.url.startsWith('@')
        ? data.remoteId
        : !this.url.replace(EnvironmentService.environment.frontUrl + '/blog/', '').startsWith('@')
          ? this.url
          : undefined
  }

  async onConfirm() {
    this.disabled = true
    const fediHost = !!this.fediUsername().replace(/^@/, '').split('@')[1]
      ? this.fediUsername().replace(/^@/, '').split('@')[1]
      : this.fediUsername()
    const webfinger = await fetch(
      `${!fediHost.startsWith('http') ? 'https://' : ''}${fediHost}/.well-known/webfinger?resource=${encodeURIComponent(
        !!this.fediUsername().replace(/^@/, '').split('@')[1]
          ? `acct:${this.fediUsername().replace(/^@/, '')}`
          : this.fediUsername()
      )}`
    )
    let interactionUrl = `${!fediHost.startsWith('http') ? 'https://' : ''}${fediHost}/authorize_interaction?uri=${encodeURIComponent(this.url)}`
    if (webfinger.ok) {
      const webfingerJson = await webfinger.json()
      const auth = webfingerJson.links.find((x: any) => x.rel === 'http://ostatus.org/schema/1.0/subscribe')
      if (auth) {
        interactionUrl = auth.template.replace('{uri}', encodeURIComponent(this.handle))
      }
    }
    window.location.href = interactionUrl
  }

  onInput(event: Event) {
    const target = event.target
    if (target instanceof HTMLInputElement) {
      this.fediUsername.set(target.value)
    }
  }

  closeDialog() {
    this.dialogRef.close()
  }
}
