import { computed, Injectable, Signal, signal, WritableSignal, inject } from '@angular/core'
import { Router } from '@angular/router'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { UntypedFormGroup } from '@angular/forms'

import { UtilsService } from './utils.service'
import { JwtService, JwtTokenDecoded } from './jwt.service'
import { PostsService } from './posts.service'
import { BehaviorSubject, filter, firstValueFrom, fromEvent } from 'rxjs'
import { EnvironmentService } from './environment.service'
import { MessageService } from './message.service'
import { TranslateService } from '@ngx-translate/core'
import { DashboardService } from './dashboard.service'
import { BlogDetails } from '../interfaces/blog-details'
import { SimpleDialogService } from './simple-dialog.service'
import { InteractionControl, InteractionControlType } from '../interfaces/interaction-control'

export type AccountData = {
  token: string
  blog: BlogDetails
}

@Injectable({
  providedIn: 'root'
})
export class LoginService {
  private http = inject(HttpClient)
  private router = inject(Router)
  private utils = inject(UtilsService)
  private jwt = inject(JwtService)
  private postsService = inject(PostsService)
  private messagesService = inject(MessageService)
  private translate = inject(TranslateService)
  private dashboardService = inject(DashboardService)
  private simpleDialog = inject(SimpleDialogService)

  public loggedIn: BehaviorSubject<boolean>
  public currentAccount: Signal<BlogDetails | undefined> = computed(() => this.accountList()[0]?.blog)
  public accountList: WritableSignal<AccountData[]> = signal([])

  constructor() {
    this.loggedIn = new BehaviorSubject(this.jwt.tokenValid())

    this.getLocalStorageAccounts()

    // Update account on other tab change
    fromEvent(window, 'storage')
      .pipe(filter((event) => (<StorageEvent>event).key === 'accountList'))
      .subscribe(async () => {
        this.getLocalStorageAccounts()
        await this.handleSuccessfulLogin()
      })
  }

  getLocalStorageAccounts() {
    const savedAccountList: AccountData[] = localStorage.getItem('accountList')
      ? JSON.parse(localStorage.getItem('accountList') as string)
      : []
    if (this.loggedIn.value && savedAccountList.length === 0) {
      let url = (this.jwt.getTokenData() as JwtTokenDecoded)['url']
      this.dashboardService.getBlogDetails(url, false).then((res) => {
        savedAccountList.push({
          token: localStorage.getItem('authToken') as string,
          blog: res
        })
        localStorage.setItem('accountList', JSON.stringify(savedAccountList))
      })
    }
    this.accountList.set(savedAccountList)
  }

  async logIn(loginForm: UntypedFormGroup): Promise<boolean> {
    let success = false
    try {
      const petition: any = await this.http
        .post(`${EnvironmentService.environment.baseUrl}/login`, loginForm.value)
        .toPromise()
      if (petition.success) {
        if (petition.mfaRequired) {
          success = true
          // HACK DO NOT TOUCH THE ASYNC. IM SERIOUS. IT WOULD SKIP THIS SCREEN
          // IF YOU TOUCH THIS CODE YOU NEED TO TEST LOGIN WITH AN MFA ACC
          await this.router.navigate(['/login/mfa'])
          await this.addToken(petition.token)
        } else {
          await this.addToken(petition.token)
          await this.handleSuccessfulLogin()
          await this.router.navigate(['/dashboard'])
          success = true
        }
      }
    } catch (exception) {
      console.error(exception)
    }
    return success
  }

  async logInMfa(loginMfaForm: UntypedFormGroup): Promise<boolean> {
    let success = false
    try {
      const petition: any = await this.http
        .post(`${EnvironmentService.environment.baseUrl}/login/mfa`, loginMfaForm.value)
        .toPromise()
      if (petition.success) {
        this.addToken(petition.token)
        await this.handleSuccessfulLogin()
        await this.router.navigate(['/dashboard'])
        success = true
      }
    } catch (exception) {
      console.error(exception)
    }
    return success
  }

  async addToken(token: string) {
    localStorage.setItem('authToken', token)

    const decoded = this.jwt.decodeToken(token)
    const blog = await this.dashboardService.getBlogDetails(decoded.url)

    // Don't record double logins
    if (this.currentAccount()?.id === blog.id) {
      if (this.loggedIn.value) {
        this.messagesService.add({
          severity: 'warn',
          summary: this.translate.instant('login.alreadyLoggedIn')
        })
      }
      return
    }

    // Multiple accounts
    this.accountList.update((list) => [
      {
        token,
        blog
      },
      ...list
    ])
    localStorage.setItem('accountList', JSON.stringify(this.accountList()))

    // Reload on logging in to other account
    if (this.accountList().length > 1) {
      const splashElement = document.getElementById('splash')
      splashElement?.classList.remove('loaded')

      await this.handleSuccessfulLogin()

      window.location.reload()
    }
  }

  logOut() {
    localStorage.clear()
    this.router.navigate(['/'])
    this.loggedIn.next(false)
    this.accountList.set([])
  }

  logOutAccount(token: string) {
    const loggingCurrentUser = token === this.accountList().at(0)?.token
    if (this.accountList().length === 1) {
      return this.logOut()
    }
    this.accountList.update((accounts) => accounts.filter((elem) => elem.token !== token))
    localStorage.setItem('accountList', JSON.stringify(this.accountList()))

    if (loggingCurrentUser) {
      this.switchAccount(this.accountList()[0].token)
    }
  }

  async register(
    registerForm: UntypedFormGroup,
    img: File | null
  ): Promise<{
    success: boolean
    message?: string
  }> {
    let resPetition = {
      success: false
    }
    try {
      const payload = this.utils.objectToFormData(registerForm.value)
      if (img) {
        payload.append('avatar', img)
      }
      const petition: any = await this.http
        .post(`${EnvironmentService.environment.baseUrl}/register`, payload)
        .toPromise()
      resPetition = petition
    } catch (exception) {
      console.error(exception)
    }
    return resPetition
  }

  async requestPasswordReset(email: string, navigate: boolean = true) {
    const res = false
    const payload = {
      email: email
    }
    const response: any = await this.http
      .post(`${EnvironmentService.environment.baseUrl}/forgotPassword`, payload)
      .toPromise()
    if (response?.success && navigate) {
      this.router.navigate(['/'])
    }

    return res
  }

  async resetPassword(email: string, code: string, password: string) {
    const res = false
    const payload = {
      email: email,
      code: code,
      password: password
    }
    const response: any = await this.http
      .post(`${EnvironmentService.environment.baseUrl}/resetPassword`, payload)
      .toPromise()
    if (response?.success) {
      this.router.navigate(['/'])
    }

    return res
  }

  async updatePassword(oldPassword: string, newPassword: string) {
    let res = false
    const payload = {
      oldPassword: oldPassword,
      newPassword: newPassword
    }
    try {
      const response: any = await firstValueFrom(
        this.http.post(`${EnvironmentService.environment.baseUrl}/changePassword`, payload)
      )
      if (response && response.success) {
        res = true
      }
    } catch (error) {
      console.error(error)
    }
    return res
  }

  async updateEmail(password: string, newEmail: string) {
    let res = false
    const payload = {
      password: password,
      email: newEmail
    }
    try {
      const response: any = await firstValueFrom(
        this.http.post(`${EnvironmentService.environment.baseUrl}/changeEmail`, payload)
      )
      if (response && response.success) {
        res = true
      }
    } catch (error) {
      console.error(error)
    }
    return res
  }

  async activateAccount(email: string, code: string) {
    const res = false
    const payload = {
      email: email,
      code: code
    }
    const response: any = await this.http
      .post(`${EnvironmentService.environment.baseUrl}/activateUser`, payload)
      .toPromise()
    if (response?.success) {
      this.router.navigate(['/'])
    }

    return res
  }

  async getUserMfaList() {
    const response: any = await this.http.get(`${EnvironmentService.environment.baseUrl}/user/mfa`).toPromise()
    if (response?.success) {
      return response.mfa
    }
    this.translate.get('profile.security.mfa.errorMessageGeneric').subscribe((res: string) => {
      this.messagesService.add({
        severity: 'error',
        summary: res
      })
    })
    return false
  }

  async deleteMfa(mfaId: string) {
    const response: any = await this.http
      .delete(`${EnvironmentService.environment.baseUrl}/user/mfa/${mfaId}`)
      .toPromise()
    if (response?.success) {
      this.translate.get('profile.security.mfa.deleteSuccess').subscribe((res: string) => {
        this.messagesService.add({
          severity: 'success',
          summary: res
        })
      })
      return true
    } else {
      this.translate.get('profile.security.mfa.errorMessageGeneric').subscribe((res: string) => {
        this.messagesService.add({
          severity: 'error',
          summary: res
        })
      })
    }
    return false
  }

  async createNewMfa(mfaForm: UntypedFormGroup): Promise<any> {
    const response: any = await this.http
      .post(`${EnvironmentService.environment.baseUrl}/user/mfa`, mfaForm.value)
      .toPromise()
    if (response?.success && response?.mfa?.id) {
      return response.mfa
    } else {
      this.translate.get('profile.security.mfa.errorMessageGeneric').subscribe((res: string) => {
        this.messagesService.add({
          severity: 'error',
          summary: res
        })
      })
    }
    return false
  }

  async verifyMfa(mfaId: string, mfaVerifyForm: UntypedFormGroup) {
    const response: any = await this.http
      .post(`${EnvironmentService.environment.baseUrl}/user/mfa/${mfaId}/verify`, mfaVerifyForm.value)
      .toPromise()
    if (response?.success) {
      this.translate.get('profile.security.mfa.verifySuccess').subscribe((res: string) => {
        this.messagesService.add({
          severity: 'success',
          summary: res
        })
      })
      return true
    } else {
      this.translate.get('profile.security.mfa.verifyFailed').subscribe((res: string) => {
        this.messagesService.add({
          severity: 'error',
          summary: res
        })
      })
    }
    return false
  }

  async updateProfile(updateProfileForm: any, img: File | undefined, headerImg: File | undefined): Promise<boolean> {
    let success = false

    const optionFormKeyMap = {
      disableNSFWFilter: 'wafrn.disableNSFWFilter',
      automaticalyExpandPosts: 'wafrn.automaticalyExpandPosts',
      disableForceAltText: 'wafrn.disableForceAltText',
      federateWithThreads: 'wafrn.federateWithThreads',
      asksLevel: 'wafrn.public.asks',
      forceClassicLogo: 'wafrn.forceClassicLogo',
      defaultPostEditorPrivacy: 'wafrn.defaultPostEditorPrivacy',
      defaultPostRewootPrivacy: 'wafrn.defaultPostRewootPrivacy',
      rssOptions: 'wafrn.enableRSS',
      mutedWords: 'wafrn.mutedWords',
      superMutedWords: 'wafrn.superMutedWords',
      disableCW: 'wafrn.disableCW',
      forceClassicVideoPlayer: 'wafrn.forceClassicVideoPlayer',
      forceClassicAudioPlayer: 'wafrn.forceClassicAudioPlayer',
      disableConfetti: 'wafrn.disableConfetti',
      enableConfettiRecivingLike: 'wafrn.enableConfettiRecivingLike',
      forceClassicMediaView: 'wafrn.forceClassicMediaView',
      expandQuotes: 'wafrn.expandQuotes',
      attachments: 'fediverse.public.attachment',
      alsoKnownAs: 'fediverse.public.alsoKnownAs',
      defaultExploreLocal: 'wafrn.defaultExploreLocal',
      showNotificationsFrom: 'wafrn.notificationsFrom',
      notifyMentions: 'wafrn.notifyMentions',
      notifyReactions: 'wafrn.notifyReactions',
      notifyQuotes: 'wafrn.notifyQuotes',
      notifyFollows: 'wafrn.notifyFollows',
      notifyRewoots: 'wafrn.notifyRewoots',
      notifyBites: 'wafrn.notifyBites',
      disableSounds: 'wafrn.disableSounds',
      replaceAIWithCocaine: 'wafrn.replaceAIWithCocaine',
      replaceAIWord: 'wafrn.replaceAIWord',
      hideQuotes: 'wafrn.hideQuotes',
      displayMentionsOfBlockedUsersFromOtherUsers: 'wafrn.displayMentionsOfBlockedUsersFromOtherUsers',
      hideNoDescriptionMedia: 'wafrn.hideNoDescriptionMedia',
      disableRewootsExploreLocal: 'wafrn.disableRewootsExploreLocal',
      disableRewootsDashboard: 'wafrn.disableRewootsDashboard',
      disableReplies: 'wafrn.disableReplies',
      disableBsky: 'wafrn.disableBsky',
      forceReducedMotion: 'wafrn.forceReducedMotion'
    }

    try {
      const {
        hideProfileNotLoggedIn,
        hideFollows,
        name,
        description,
        manuallyAcceptsFollows,
        disableEmailNotifications,
        ...form
      } = updateProfileForm

      const payload = this.utils.objectToFormData({
        name,
        description,
        manuallyAcceptsFollows,
        disableEmailNotifications,
        hideFollows,
        hideProfileNotLoggedIn
      })

      const options = []
      for (const key in form) {
        if (form[key] != undefined) {
          const name = optionFormKeyMap[key as keyof typeof optionFormKeyMap]
          const value = JSON.stringify(form[key])
          options.push({ name, value })
        }
      }

      payload.append('options', JSON.stringify(options))

      if (img) {
        payload.append('avatar', img)
      }
      if (headerImg) {
        payload.append('headerImage', headerImg)
      }
      const petition: any = await firstValueFrom(
        this.http.post(`${EnvironmentService.environment.baseUrl}/editProfile`, payload)
      )
      if (petition.success) {
        success = true
        await this.postsService.loadFollowers()
      }
    } catch (exception) {
      console.error(exception)
    }
    return success
  }

  async updateUserOptions(options: { name: string; value: string }[]): Promise<boolean> {
    if (!this.loggedIn.value) return false
    let success = false
    try {
      const payload: FormData = new FormData()
      const petition: any = await firstValueFrom(
        this.http.post(`${EnvironmentService.environment.baseUrl}/editOptions`, { options: options })
      )
      if (petition.success) {
        for await (const option of options) {
          localStorage.setItem(option.name.split('wafrn.')[1], option.value)
        }
        success = true
        await this.postsService.loadFollowers()
      }
    } catch (error) {
      console.error(error)
    }

    return success
  }

  async enableBluesky(password: string) {
    try {
      let result = await firstValueFrom(
        this.http.post(`${EnvironmentService.environment.baseUrl}/v2/enable-bluesky`, { password })
      )
      this.messagesService.add({ severity: 'success', summary: 'Bluesky is enabled for you!' })
    } catch (error: any) {
      const tmp = error as HttpErrorResponse
      this.messagesService.add({
        severity: 'error',
        summary: tmp.error.message ?? 'There was an error, try again or contact an administrator'
      })
    }
    return
  }

  async deleteAccount(password: string): Promise<boolean> {
    let res = false
    try {
      let petition = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/user/selfDeactivate`, {
          password: password
        })
      )
      if (petition.success) {
        res = true
      }
    } catch (error) {
      console.error(error)
    }
    if (!res) {
      this.messagesService.add({ severity: 'error', summary: 'messages.genericError', translate: true })
    }
    return res
  }

  async handleSuccessfulLogin() {
    await this.postsService.loadFollowers()
    this.loggedIn.next(true)
  }

  getLoggedUserUUID(): string {
    const res = this.jwt.getTokenData()?.userId ?? ''
    return res
  }

  getUserDefaultPostPrivacyLevel(): number {
    const res = localStorage.getItem('defaultPostEditorPrivacy')
    return res ? parseInt(res) : 0
  }

  getUserDefaultReplyControl(): InteractionControlType {
    const res = localStorage.getItem('defaultPostEditorCanReply')
    return res ? parseInt(res) : InteractionControl.Anyone
  }

  getUserDefaultQuoteControl(): InteractionControlType {
    const res = localStorage.getItem('defaultPostEditorCanQuote')
    return res ? parseInt(res) : InteractionControl.Anyone
  }

  getUserDefaultRewootPrivacyLevel(): number {
    const res = localStorage.getItem('defaultPostRewootPrivacy')
    return res ? parseInt(res) : 0
  }

  getForceClassicLogo(): boolean {
    const res = localStorage.getItem('forceClassicLogo')
    return res == 'true'
  }

  async migrate(target: string): Promise<{ success: boolean; message: string }> {
    const res = await firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        EnvironmentService.environment.baseUrl + '/user/migrateOut',
        { target }
      )
    )
    return res
  }

  async switchAccount(token: string) {
    localStorage.setItem('authToken', token)

    this.accountList.update((accounts) => {
      const otherAccounts = accounts.filter((elem) => elem.token !== token)
      const firstAccount = accounts.find((elem) => elem.token === token) ?? this.accountList()[0]
      return [firstAccount, ...otherAccounts]
    })
    localStorage.setItem('accountList', JSON.stringify(this.accountList()))

    // Show splash
    const splashElement = document.getElementById('splash')
    splashElement?.classList.remove('loaded')

    await this.postsService.loadFollowers()

    window.location.reload()
  }

  async getBskyInviteCode() {
    const confirm = await this.simpleDialog.createConfirmDialog({
      title: 'dialog.bluesky.generateInviteCodeWarningTitle',
      titleSuffix: '',
      content: 'dialog.bluesky.generateInviteCodeWarning'
    })
    let result = ''
    if (confirm) {
      result = (
        await firstValueFrom(
          this.http.get<{ code: string }>(EnvironmentService.environment.baseUrl + '/get-bsky-invite-code')
        )
      ).code
    }
    return result
  }

  async linkBskyAccount(account: string, password: string) {
    await firstValueFrom(
      this.http.post(EnvironmentService.environment.baseUrl + '/connect-bsky-account', { url: account, password })
    )
  }

  userPrefersReducedMotion(): boolean {
    const res =
      window.matchMedia(`(prefers-reduced-motion: reduce)`).matches === true ||
      localStorage.getItem('forceReducedMotion') === 'true'
    return res
  }
}
