import { Component, inject, input } from "@angular/core";
import { Overlay, OverlayModule } from "@angular/cdk/overlay";
import { MatButtonModule } from "@angular/material/button";
import { FontAwesomeModule } from "@fortawesome/angular-fontawesome";
import { PostsService } from "../../services/posts.service";
import { MessageService } from "../../services/message.service";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Emoji } from "../../interfaces/emoji";
import { Dialog } from "@angular/cdk/dialog";
import { EmojiPickerComponent } from "../emoji-picker/emoji-picker.component";
import { ParticleService } from "src/app/services/particle.service";
import { EnvironmentService } from "src/app/services/environment.service";

@Component({
  selector: "app-emoji-react",
  imports: [
    MatButtonModule,
    FontAwesomeModule,
    OverlayModule,
    MatTooltipModule,
  ],
  templateUrl: "./emoji-react.component.html",
  styleUrl: "./emoji-react.component.scss",
})
export class EmojiReactComponent {
  private overlay = inject(Overlay);
  private postsService = inject(PostsService);
  private messages = inject(MessageService);
  private particle = inject(ParticleService);

  scrollStrategy;
  dialog = inject(Dialog);
  readonly postId = input<string>("");
  isOpen = false;
  loading = false;

  constructor() {
    this.scrollStrategy = this.overlay.scrollStrategies.reposition();
  }
  openDialog(): void {
    const dialogRef = this.dialog.open<Emoji>(EmojiPickerComponent, {
      autoFocus: false,
    });

    dialogRef.closed.subscribe((result) => {
      if (result) {
        this.reactToPost(result);
      }
    });
  }

  async reactToPost(emoji: Emoji) {
    this.loading = true;
    const response = await this.postsService.emojiReactPost(
      this.postId(),
      emoji.name
    );
    if (response) {
      this.messages.add({
        severity: "success",
        summary: `Reacted with ${emoji.name} succesfully`,
      });

      // Play emoji
      const emojiIsImage = emoji.url !== "";
      if (emojiIsImage) {
        const fullUrl = `${EnvironmentService.environment.cacheDomain}/api/v2/cache/emoji/${emoji.uuid}`;
        this.particle.imageReact(fullUrl);
      } else {
        this.particle.emojiReact(emoji.name);
      }

      this.isOpen = false;
      this.loading = false;
    } else {
      this.messages.add({
        severity: "error",
        summary: `Something went wrong!`,
      });
      this.loading = false;
    }
  }
}
