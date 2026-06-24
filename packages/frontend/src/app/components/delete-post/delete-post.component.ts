import { Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { DeletePostService } from "src/app/services/delete-post.service";
import { MessageService } from "src/app/services/message.service";
import {
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
  MatDialogClose,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { LoaderComponent } from "../loader/loader.component";
import { TranslateModule } from "@ngx-translate/core";
@Component({
  selector: "app-delete-post",
  templateUrl: "./delete-post.component.html",
  styleUrls: ["./delete-post.component.scss"],
  imports: [MatButtonModule, MatDialogTitle, LoaderComponent, TranslateModule],
})
export class DeletePostComponent {
  private deletePostService = inject(DeletePostService);
  private messages = inject(MessageService);
  private dialogRef = inject<MatDialogRef<DeletePostComponent>>(MatDialogRef);
  data = inject<{
    id: string;
  }>(MAT_DIALOG_DATA);

  postToDelete: string;
  deleting = false;

  constructor() {
    const data = this.data;

    this.postToDelete = data.id;
  }

  cancelDelete() {
    this.dialogRef.close();
  }

  async deletePost() {
    this.deleting = true;
    if (this.postToDelete) {
      try {
        let res = await this.deletePostService.deletePost(this.postToDelete);
        if (res) {
          this.messages.add({
            severity: "success",
            summary:
              "The post has been deleted and now the page will be reloaded",
          });
          this.dialogRef.close();
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          this.messages.add({
            severity: "error",
            summary:
              "There was an error deleting the post. Please, try again and let us know about the issue",
          });
          this.dialogRef.close();
        }
      } catch (err) {
        console.error(err);
        this.messages.add({
          severity: "error",
          summary:
            "There was an error deleting the post. Please, try again and let us know about the issue",
        });
        this.dialogRef.close();
      }
    }
    this.deleting = false;
  }
}
