import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, inject, input, ViewEncapsulation} from '@angular/core'
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InjectHtmlModule } from 'src/app/directives/inject-html/inject-html.module';
import { PostLinkModule } from 'src/app/directives/post-link/post-link.module';
import { ProcessedPost } from 'src/app/interfaces/processed-post';
import { SimplifiedUser } from 'src/app/interfaces/simplified-user';
import { WafrnMedia } from 'src/app/interfaces/wafrn-media'
import { PollModule } from '../poll/poll.module';
import { WafrnMediaModule } from '../wafrn-media/wafrn-media.module';
import { PostsService } from 'src/app/services/posts.service';
import { SettingsService } from 'src/app/services/settings.service';

type FragmentType = "post" | "quote";

type EmojiReaction = {
  id: string;
  content: string;
  img?: string;
  external: boolean;
  name: string;
  users: SimplifiedUser[];
  tooltip: string;
  includesMe: boolean;
};

@Component({
  selector: 'app-post-content',
  templateUrl: './post-content.component.html',
  imports: [
    CommonModule,
    PollModule,
    WafrnMediaModule,
    RouterModule,
    MatButtonModule,
    MatTooltipModule,
    InjectHtmlModule,
    PostLinkModule,
    TranslateModule,
  ],
  styleUrl: './post-content.component.scss',
  encapsulation: ViewEncapsulation.ShadowDom
})
export class PostContentComponent implements AfterViewInit {
  private postService = inject(PostsService);
  protected settingsService = inject(SettingsService);

  fragment = input.required<ProcessedPost>();
  mentionPosts: string[] = [];
  availableEmojiNames: Set<string> = new Set();

  sanitizedContent = "";
  noTagsContent = "";

  seenMedia: number[] = [];

  wafrnFormattedContent = computed(() => {
    let processedBlock: Array<string | WafrnMedia> = [];
    this.sanitizedContent = this.postService.getPostHtml(this.fragment());
    // wafrn silly feature
    if (localStorage.getItem("replaceAIWithCocaine") === "true") {
      // TODO this should be done in a better way but because we are playing with html... AAAA
      const replaceAIWord = localStorage.getItem("replaceAIWord")
        ? JSON.parse(localStorage.getItem("replaceAIWord") as string)
        : "cocaine";
      const wordsToReplace = [
        "ai",
        "artificial intelligence",
        "artificial inteligence",
        "llm",
        "intelligence artificielle",
        "ia",
      ];
      let regexpString = wordsToReplace
        .map((elem) => `\\s${elem}\\s|^${elem}\\s|\\s${elem}$`)
        .join("|");
      let regexp = new RegExp(regexpString, "gi");
      this.sanitizedContent = this.sanitizedContent.replaceAll(
        regexp,
        ` ${replaceAIWord} `
      );
      regexpString = wordsToReplace.map((elem) => `>${elem} `).join("|");
      regexp = new RegExp(regexpString, "gi");
      this.sanitizedContent = this.sanitizedContent.replaceAll(
        regexp,
        `>${replaceAIWord} `
      );
      regexpString = wordsToReplace.map((elem) => ` ${elem}<`).join("|");
      regexp = new RegExp(regexpString, "gi");
      this.sanitizedContent = this.sanitizedContent.replaceAll(
        regexp,
        ` ${replaceAIWord}<`
      );
      regexpString = wordsToReplace.map((elem) => `>${elem}<`).join("|");
      regexp = new RegExp(regexpString, "gi");
      this.sanitizedContent = this.sanitizedContent.replaceAll(
        regexp,
        `>${replaceAIWord}<`
      );
    }
    this.noTagsContent = this.postService.getPostHtml(this.fragment(), []);
    if (this.fragment().medias && this.fragment().medias?.length > 0) {
      const mediaDetectorRegex = /\!\[media\-([0-9]+)]/gm;
      const textDivided = this.sanitizedContent.split(mediaDetectorRegex);
      textDivided.forEach((elem, index) => {
        if (index % 2 == 0) {
          if (elem != "") {
            processedBlock.push(elem);
          }
        } else {
          const medias = this.fragment().medias as WafrnMedia[];
          const mediaToInsert = medias[parseInt(elem) - 1];
          if (mediaToInsert) {
            processedBlock.push(mediaToInsert);
            this.seenMedia.push(parseInt(elem) - 1);
          } else {
            processedBlock.push(`![media-${elem}]`);
          }
        }
      });
    } else {
      processedBlock = [this.sanitizedContent];
    }
    return processedBlock;
  });

  constructor(private el: ElementRef) {}

  ngAfterViewInit() {
    // this is very janky, but it works
    
    const shadowRoot = this.el.nativeElement.shadowRoot;
    const sheets = Array.from(document.styleSheets);
    sheets.forEach(sheet => {
      try {
        const newSheet = new CSSStyleSheet();
        const rules = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
        newSheet.replaceSync(rules);
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, newSheet];
      } catch (e) {
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = (sheet as CSSStyleSheet & { href: string }).href;
        shadowRoot.appendChild(linkEl);
      }
    });
  }
}
