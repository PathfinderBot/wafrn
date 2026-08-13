import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs'
import { JwtService } from './jwt.service'
import { UserOptions } from '../interfaces/user-options'
import { Emoji } from '../interfaces/emoji'
import { EmojiCollection } from '../interfaces/emoji-collection'
import { emojis } from '../lists/emoji-compact'
import { EnvironmentService } from './environment.service'
import { SimpleDialogService } from './simple-dialog.service'
import { ServiceAnnouncement } from '../interfaces/service-announcement'
import { Language } from '../interfaces/language'

@Injectable({
  providedIn: 'root'
})
export class UserOptionsService {
  private http = inject(HttpClient)
  private jwtService = inject(JwtService)
  private simpleDialogService = inject(SimpleDialogService)

  public updateFollowers: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)
  public optionsSynced = new Subject<void>()

  keyboardEmojis: Emoji[] = emojis
    .map((emoji) => {
      return {
        id: emoji.char,
        name: emoji.category + emoji.name, // todo add a display name?
        url: '',
        external: false,
        uuid: emoji.name
      }
    })
    .filter((elem) => !!elem) as Emoji[]

  public silencedPostsIds: string[] = []
  public mutedUsers: string[] = []
  public languages: Language[] = []
  public followedUserIds: Array<string> = []
  public emojiCollections: EmojiCollection[] = []
  public notYetAcceptedFollowedUsersIds: Array<string> = []
  public blockedUserIds: Array<string> = []
  public followedHashtags: string[] = []
  public myFollowers: string[] = []
  public enableBluesky: boolean = false
  public usersQuotesDisabled: string[] = []
  public usersRewootsDisabled: string[] = []
  public usersRepliesDisabled: string[] = []

  private lastTimeLoadedFollowers = new Date(0)

  async loadFollowers() {
    // if this was called less than 3 seconds ago lets not do it. I could use RXJS for this but its an old part of the code
    if (new Date().getTime() - this.lastTimeLoadedFollowers.getTime() < 3000) {
      return
    }
    this.lastTimeLoadedFollowers = new Date()
    if (!this.jwtService.tokenValid()) return

    const followsAndBlocks = await firstValueFrom(
      this.http.get<{
        followedUsers: string[]
        myFollowers: string[]
        blockedUsers: string[]
        notAcceptedFollows: string[]
        options: UserOptions[]
        silencedPosts: string[]
        emojis: EmojiCollection[]
        mutedUsers: string[]
        followedHashtags: string[]
        mutedRewoots: string[]
        mutedQuotes: string[]
        hiddenReplies: string[]
        enableBluesky: boolean
        serviceAnnouncements: ServiceAnnouncement[]
        languages: Language[]
      }>(`${EnvironmentService.environment.baseUrl}/my-ui-options`)
    )
    if (followsAndBlocks.serviceAnnouncements && followsAndBlocks.serviceAnnouncements.length > 0) {
      // at this point we only have ONE so we pick up the FIRST ONE.
      const announcement = followsAndBlocks.serviceAnnouncements[0]
      this.simpleDialogService.createConfirmDialog({
        title: 'serverAnnouncements.' + announcement.code,
        content: announcement.message,
        options: {
          confirm: 'ok'
        }
      })
    }
    this.followedHashtags = followsAndBlocks.followedHashtags
    this.languages = followsAndBlocks.languages || []
    this.emojiCollections = followsAndBlocks.emojis ? followsAndBlocks.emojis : []
    this.emojiCollections = this.emojiCollections.concat({
      name: 'Keyboard Emojis',
      comment: 'Your phone emojis',
      emojis: this.keyboardEmojis
    })
    this.followedUserIds = followsAndBlocks.followedUsers
    this.blockedUserIds = followsAndBlocks.blockedUsers
    this.notYetAcceptedFollowedUsersIds = followsAndBlocks.notAcceptedFollows
    this.mutedUsers = followsAndBlocks.mutedUsers
    this.enableBluesky = followsAndBlocks.enableBluesky
    this.myFollowers = followsAndBlocks.myFollowers
    this.usersQuotesDisabled = followsAndBlocks.mutedQuotes
    this.usersRewootsDisabled = followsAndBlocks.mutedRewoots
    this.usersRepliesDisabled = followsAndBlocks.hiddenReplies
    // Here we check user options
    if (followsAndBlocks.options?.length > 0) {
      // frontend options start with wafrn.
      const options = followsAndBlocks.options.filter((option) => option.optionName.startsWith('wafrn.'))
      options.forEach((option) => {
        localStorage.setItem(option.optionName.split('wafrn.')[1], option.optionValue)
      })
      this.optionsSynced.next()
    }
    if (followsAndBlocks.silencedPosts) {
      this.silencedPostsIds = followsAndBlocks.silencedPosts
    } else {
      this.silencedPostsIds = []
    }
    this.updateFollowers.next(true)
  }

  async followUser(id: string): Promise<boolean> {
    let res = false
    const payload = {
      userId: id
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/follow`, payload)
      )
      await this.loadFollowers()
      res = response?.success === true
    } catch (exception: any) {
      console.error(exception)
      if (exception.error?.message) {
        this.simpleDialogService.createConfirmDialog({
          title: 'Error',
          content: exception.error.message,
          options: {
            confirm: 'ok'
          }
        })
      }
    }

    return res
  }

  async unfollowUser(id: string): Promise<boolean> {
    let res = false
    const payload = {
      userId: id
    }
    try {
      const response = await this.http
        .post<{ success: boolean }>(`${EnvironmentService.environment.baseUrl}/unfollow`, payload)
        .toPromise()
      await this.loadFollowers()
      res = response?.success === true
    } catch (exception) {
      console.error(exception)
    }

    return res
  }

  async updateDisableRewoots(userId: string) {
    const res = await firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/muteRewoots`, {
        userId: userId
      })
    )
    this.loadFollowers()
    return res
  }

  async updateDisableQuotes(userId: string) {
    const res = await firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/muteRewoots`, {
        userId: userId,
        muteQuotes: true
      })
    )
    this.loadFollowers()
    return res
  }

  async updateDisableReplies(userId: string) {
    const res = await firstValueFrom(
      this.http.post(`${EnvironmentService.environment.baseUrl}/muteRewoots`, {
        userId: userId,
        hideReplies: true
      })
    )
    this.loadFollowers()
    return res
  }
}
