import { HttpClient, HttpParams } from "@angular/common/http";
import { computed, Injectable, signal, inject } from "@angular/core";
import { JwtService } from "./jwt.service";
import { filter, firstValueFrom } from "rxjs";
import { SimplifiedUser } from "../interfaces/simplified-user";
import {
  EmojiRelations,
  Media,
  NotificationRaw,
  Quote,
  Tag,
  basicPost,
} from "../interfaces/unlinked-posts";
import { UserNotifications } from "../interfaces/user-notifications";
import { ProcessedPost } from "../interfaces/processed-post";
import { PostsService } from "./posts.service";
import { EnvironmentService } from "./environment.service";
import { Emoji } from "../interfaces/emoji";
import { Ask } from "../interfaces/ask";
import sanitize from "sanitize-html";
import { LoginService } from "./login.service";
import { SettingsService } from "./settings.service";
import { AudioService } from "./audio.service";

// Copied from backend interface
export type NotificationData = {
  notifications: number;
  followsAwaitingApproval: number;
  reports: number;
  usersAwaitingApproval: number;
  asks: number;
};

@Injectable({
  providedIn: "root",
})
export class NotificationsService {
  private http = inject(HttpClient);
  private jwt = inject(JwtService);
  private postService = inject(PostsService);
  private settings = inject(SettingsService);
  private audioService = inject(AudioService);
  private loginService = inject(LoginService);

  uniqueDate = new Date();

  emojiMap = new Map<string, Emoji>();
  userMap = new Map<string, SimplifiedUser>();
  postMap = new Map<string, ProcessedPost>();

  // Data for other components to subscribe to
  public notifications = signal(0);
  public reports = signal(0);
  public followsAwaitingApproval = signal(0);
  public usersAwaitingApproval = signal(0);
  public asks = signal(0);

  totalNotifications = computed(
    () =>
      this.notifications() +
      this.reports() +
      this.followsAwaitingApproval() +
      this.usersAwaitingApproval() +
      this.asks()
  );

  constructor() {
    const loginService = this.loginService;

    // Initial notifications load when logging in
    loginService.loggedIn.pipe(filter((logged) => logged)).subscribe(() => {
      this.updateCount();
    });
  }

  /**
   * @description Gets the number of notifications from the server if the user is logged in.
   *
   * The server does not mark notifications as read when checked this way.
   */
  async updateCount(): Promise<void> {
    if (!this.loginService.loggedIn.value) return;

    let res: NotificationData = {
      notifications: 0,
      reports: 0,
      followsAwaitingApproval: 0,
      usersAwaitingApproval: 0,
      asks: 0,
    };

    const notifications = await firstValueFrom(
      this.http.get<NotificationData>(
        `${EnvironmentService.environment.baseUrl}/v2/notificationsCount`
      )
    );
    res = notifications ? notifications : res;

    const previousCount = this.totalNotifications();

    this.notifications.set(res.notifications);
    this.reports.set(res.reports);
    this.followsAwaitingApproval.set(res.followsAwaitingApproval);
    this.usersAwaitingApproval.set(res.usersAwaitingApproval);
    this.asks.set(res.asks);

    // Check for any notification changes to play the audio
    if (
      previousCount < this.totalNotifications() &&
      this.settings.values().disableSounds !== true
    ) {
      this.audioService.playSound("notification");
    }
  }

  async getNotificationsScrollV2(page: number): Promise<UserNotifications[]> {
    if (!this.jwt.tokenValid()) {
      return [];
    }
    if (page === 0) {
      this.uniqueDate = new Date();
    }
    let petitionData: HttpParams = new HttpParams();
    petitionData = petitionData.set("date", this.uniqueDate.getTime());
    petitionData = petitionData.set("page", page);
    const petition = await firstValueFrom(
      this.http.get<{
        users: SimplifiedUser[];
        posts: basicPost[];
        medias: Media[];
        asks: Ask[];
        tags: Tag[];
        emojiRelations: EmojiRelations;
        notifications: NotificationRaw[];
        quotes: Quote[];
      }>(`${EnvironmentService.environment.baseUrl}/v3/notificationsScroll`, {
        params: petitionData,
      })
    );
    if (petition) {
      if (petition.notifications.length) {
        this.uniqueDate = new Date(
          petition.notifications[petition.notifications.length - 1].createdAt
        );
      } else {
        this.uniqueDate = new Date(0);
      }
      const processed = this.postService.processPostNew({
        posts: petition.posts,
        emojiRelations: petition.emojiRelations,
        mentions: [],
        users: petition.users,
        polls: [],
        medias: petition.medias,
        tags: petition.tags,
        likes: [],
        quotes: petition.quotes,
        quotedPosts: [],
        rewootIds: [],
        bookmarks: [],
      });
      let users = petition.users;
      petition.emojiRelations.emojis.forEach((emoji) => {
        this.emojiMap.set(emoji.id, emoji);
      });
      users.forEach((usr) => {
        const userEmojis = petition.emojiRelations.userEmojiRelation
          .filter((emojiRelation) => emojiRelation.userId === usr.id)
          .map((elem) => this.emojiMap.get(elem.emojiId));
        usr.name = sanitize(usr.name, {
          allowedTags: [],
        });
        usr.name = usr.name.replaceAll("‏", "");
        userEmojis.forEach((elem) => {
          if (elem) {
            usr.name = usr.name.replaceAll(
              elem.name,
              this.postService.emojiToHtml(elem)
            );
          }
        });
        this.userMap.set(usr.id, usr);
      });
      processed.flat().forEach((post) => {
        this.postMap.set(post.id, post);
      });
      let res: UserNotifications[] = petition.notifications.map(
        (notification) => {
          let usr = this.userMap.get(notification.userId) as SimplifiedUser;
          if (!usr) {
            usr = {
              id: "60",
              avatar: "",
              name: "ERROR",
              url: "ERROR",
            };
          }
          const emoji = notification.emojiReactionId
            ? this.emojiMap.get(
                petition.emojiRelations.postEmojiReactions.find(
                  (elem) => elem.id == notification.emojiReactionId
                )?.emojiId as string
              )
            : undefined;
          let notificationProcessed: UserNotifications = {
            userId: notification.userId,
            type: notification.notificationType,
            url:
              notification.notificationType === "FOLLOW" || "USERBITE"
                ? `/blog/${usr.url}`
                : `/post/${notification.postId}`,
            avatar: usr.avatar,
            userUrl: usr.url,
            userName: usr.name,
            date: new Date(notification.createdAt),
            fragment: notification.postId
              ? this.postMap.get(notification.postId)
              : undefined,
            emojiReact: emoji,
            emojiName: emoji
              ? emoji.name
              : notification.notificationType === "EMOJIREACT"
              ? petition.emojiRelations.postEmojiReactions.find(
                  (elem) => elem.id == notification.emojiReactionId
                )?.content
              : undefined,
          };
          return notificationProcessed;
        }
      );
      return res;
    } else {
      return [];
    }
  }
}
