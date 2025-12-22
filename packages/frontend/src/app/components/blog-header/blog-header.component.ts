import { CommonModule } from "@angular/common";
import { Component, computed, input, OnChanges, OnDestroy, Signal, SimpleChanges, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { MatMenuModule } from "@angular/material/menu";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { FontAwesomeModule } from "@fortawesome/angular-fontawesome";
import {
  faChevronDown,
  faServer,
  faUser,
  faUserSlash,
  faVolumeMute,
  faVolumeUp,
  faUsers,
  faTriangleExclamation,
  faRepeat,
  faQuoteRight,
  faCookieBite,
  faCode,
  faPlaneDeparture,
  faRobot,
  faScrewdriverWrench,
} from "@fortawesome/free-solid-svg-icons";
import { BlogDetails } from "src/app/interfaces/blogDetails";
import { BlocksService } from "src/app/services/blocks.service";
import { LoginService } from "src/app/services/login.service";
import { MessageService } from "src/app/services/message.service";
import { PostsService } from "src/app/services/posts.service";
import { UtilsService } from "src/app/services/utils.service";
import { MatTooltipModule } from "@angular/material/tooltip";
import { EnvironmentService } from "src/app/services/environment.service";
import { InfoCardComponent } from "../info-card/info-card.component";
import { faBluesky } from "@fortawesome/free-brands-svg-icons";
import { ReportService } from "src/app/services/report.service";
import { TranslatePipe } from "@ngx-translate/core";
import { SimpleDialogService } from "src/app/services/simple-dialog.service";
import { BlogService } from "src/app/services/blog.service";
import { RawJsonDialogComponent } from "../raw-json-dialog/raw-json-dialog.component";
import { SettingsService } from "src/app/services/settings.service";

@Component({
  selector: "app-blog-header",
  imports: [
    CommonModule,
    MatCardModule,
    FontAwesomeModule,
    MatMenuModule,
    MatButtonModule,
    MatTooltipModule,
    RouterModule,
    InfoCardComponent,
    TranslatePipe,
  ],
  templateUrl: "./blog-header.component.html",
  styleUrl: "./blog-header.component.scss",
})
export class BlogHeaderComponent implements OnChanges, OnDestroy {
  protected loginService = inject(LoginService);
  postService = inject(PostsService);
  private messages = inject(MessageService);
  blockService = inject(BlocksService);
  dialogService = inject(MatDialog);
  activatedRoute = inject(ActivatedRoute);
  environmentService = inject(EnvironmentService);
  reportService = inject(ReportService);
  simpleDialog = inject(SimpleDialogService);
  blogService = inject(BlogService);
  utilsService = inject(UtilsService);
  settingsService = inject(SettingsService);

  parser = new DOMParser();
  blogDetails = input<BlogDetails>();
  avatarUrl = computed<string>(() => {
    const blog = this.blogDetails();
    if (blog === undefined) return "/assets/img/anon.webp";
    return (
      EnvironmentService.environment.cacheDomain +
      "/api/v2/cache/avatar/" +
      blog.id
    );
  });
  headerUrl = "";
  isMe = false;
  expandDownIcon = faChevronDown;
  muteUserIcon = faVolumeMute;
  unmuteUserIcon = faVolumeUp;
  reportUserIcon = faTriangleExclamation;
  disableRewootIcon = faRepeat;
  disableQuotesIcon = faQuoteRight;
  rawJsonIcon = faCode;
  migratedToUrl = "";

  userIcon = faUser;
  bskyIcon = faBluesky;
  botIcon = faRobot;
  adminIcon = faScrewdriverWrench;
  usersIcon = faUsers;
  blockUserIcon = faUserSlash;
  unblockServerIcon = faServer;
  biteUserIcon = faCookieBite;
  movedAccountIcon = faPlaneDeparture;
  allowAsk = false;
  allowRemoteAsk = false;
  isBlueskyUser = false;
  headerHTML: string | undefined;

  rawOutputEnabled = EnvironmentService.environment.enableRawOutput;
  instanceHostname = new URL(EnvironmentService.environment.frontUrl).hostname;

  fediComp = computed<{ name: string; value: string }[]>(() => {
    const fediAttachment = this.blogDetails()?.publicOptions.find(
      (elem) => elem.optionName == "fediverse.public.attachment"
    );
    if (fediAttachment) {
      return JSON.parse(fediAttachment.optionValue);
    }
    return [];
  });
  ngOnChanges(changes: SimpleChanges): void {
    const blog = this.blogDetails();
    if (blog === undefined) return;
    this.headerUrl = blog.url.startsWith("@")
      ? EnvironmentService.environment.externalCacheurl +
      encodeURIComponent(blog.headerImage)
      : EnvironmentService.environment.externalCacheurl +
      encodeURIComponent(
        EnvironmentService.environment.baseMediaUrl + blog.headerImage
      );
    const askLevelOption = blog.publicOptions.find(
      (elem) => elem.optionName == "wafrn.public.asks"
    );
    let askLevel = askLevelOption ? parseInt(askLevelOption.optionValue) : 2;
    if (blog.url.startsWith("@")) {
      askLevel = 3;
    }
    this.allowAsk = this.loginService.loggedIn.value
      ? [1, 2].includes(askLevel)
      : askLevel == 1;
    this.allowAsk =
      this.allowAsk && this.loginService.getLoggedUserUUID() != blog.id;
    this.allowRemoteAsk =
      askLevel != 3 && this.loginService.getLoggedUserUUID() != blog.id;
    this.isMe = blog.id == this.loginService.getLoggedUserUUID();
    let path = this.activatedRoute.snapshot.routeConfig?.path;
    if (path && this.allowAsk && path.toLowerCase().endsWith("/ask")) {
      this.openAskDialog();
    }
    const parsedAsHTML = this.parser.parseFromString(
      blog.description,
      "text/html"
    );
    // const imgs = parsedAsHTML.getElementsByTagName("img");
    // Array.from(imgs).forEach((img, index) => {
    //   img.src = "";
    // });
    this.headerHTML = parsedAsHTML.documentElement.innerHTML;
    if (blog?.migratedTo)
      this.migratedToUrl = new URL(
        `/blog/${blog?.migratedTo}`,
        EnvironmentService.environment.frontUrl
      ).href;
  }

  ngOnDestroy(): void { }

  async unfollowUser(id: string) {
    const response = await this.postService.unfollowUser(id);
    if (response) {
      this.messages.add({
        severity: "success",
        summary: "messages.unfollowMessageSuccess",
        translate: true,
      });
    } else {
      this.messages.add({
        severity: "error",
        summary: "messages.genericError",
        translate: true,
      });
    }
  }

  async getFollowLoggedOutComponent(): Promise<
    typeof FollowLoggedOutComponent
  > {
    const { FollowLoggedOutComponent } = await import(
      "../follow-logged-out/follow-logged-out.component"
    );
    return FollowLoggedOutComponent;
  }

  async followUser(id: string) {
    if (!this.loginService.loggedIn.value) {
      const blog = this.blogDetails();
      this.dialogService.open(await this.getFollowLoggedOutComponent(), {
        width: "600px",
        data: {
          bskyDid: blog?.bskyDid,
          url: blog?.url,
          name: blog?.name,
          remoteId: blog?.remoteId,
        },
      });

      return;
    }

    const response = await this.postService.followUser(id);
    if (response) {
      this.messages.add({
        severity: "success",
        summary: "messages.followMessageSuccess",
        translate: true,
        soundName: "follow",
      });
    } else {
      this.messages.add({
        severity: "error",
        summary: "messages.genericError",
        translate: true,
      });
    }
  }

  async muteAccount() {
    const blog = this.blogDetails();
    if (blog) {
      blog.muted = (await this.blockService.promptMuteUser(blog.id)) === true;
    }
  }

  async unmuteAccount() {
    const blog = this.blogDetails();
    if (blog) {
      // very silly API
      const res = await this.blockService.promptUnmuteUser(blog.id);
      if (res !== undefined) {
        blog.muted = res !== undefined && res.length !== 0;
      }
    }
  }

  async blockAccount() {
    const blog = this.blogDetails();
    if (blog) {
      blog.blocked =
        (await this.blockService.promptBlockUser(blog.id)) === true;
    }
  }

  async unblockAccount() {
    const blog = this.blogDetails();
    if (blog) {
      // very silly API
      const res = await this.blockService.promptUnblockUser(blog.id);
      if (res !== undefined) {
        blog.blocked = res !== undefined && res.length !== 0;
      }
    }
  }

  async biteAccount(id: string) {
    const response = await this.blogService.biteUser(id);
    if (response) {
      this.messages.add({
        severity: "success",
        summary: "messages.biteUserSuccess",
        translate: true,
      });
    } else {
      this.messages.add({
        severity: "error",
        summary: "messages.genericError",
        translate: true,
      });
    }
  }

  async getRawJsonComponent(): Promise<typeof RawJsonDialogComponent> {
    const { RawJsonDialogComponent } = await import(
      "../raw-json-dialog/raw-json-dialog.component"
    );
    return RawJsonDialogComponent;
  }

  async getRawJson(id: string) {
    const raw = await this.utilsService.getRawJsonUser(id);
    this.dialogService.open(await this.getRawJsonComponent(), {
      data: raw,
      width: "800px",
    });
  }

  async getAskDialogComponent(): Promise<typeof AskDialogContentComponent> {
    const { AskDialogContentComponent } = await import(
      "../ask-dialog-content/ask-dialog-content.component"
    );
    return AskDialogContentComponent;
  }

  async openAskDialog() {
    this.dialogService.open(await this.getAskDialogComponent(), {
      data: { details: this.blogDetails() },
      width: "800px",
    });
  }

  formatBigNumber(n: number) {
    if (n < 10000) {
      return n;
    }

    return Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
    }).format(n);
  }

  async updateDisableRewoots() {
    const blog = this.blogDetails();
    if (blog === undefined) return;
    await this.postService.updateDisableRewoots(blog.id);
  }

  async updateDisableQuotes() {
    const blog = this.blogDetails();
    if (blog === undefined) return;
    await this.postService.updateDisableQuotes(blog.id);
  }
}
