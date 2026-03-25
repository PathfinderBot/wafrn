import {
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnInit
} from "@angular/core";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { WafrnMedia } from "src/app/interfaces/wafrn-media";
import { EnvironmentService } from "src/app/services/environment.service";

@Component({
  selector: "app-media-preview",
  templateUrl: "./media-preview.component.html",
  styleUrls: ["./media-preview.component.scss"],
  imports: [MatProgressSpinnerModule],
})
export class MediaPreviewComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef)
  private sanitizer = inject(DomSanitizer)
  @Input() media!: WafrnMedia;
  baseMediaUrl = EnvironmentService.environment.baseMediaUrl;
  baseUrl = EnvironmentService.environment.baseUrl;
  success = false;
  error = false;
  elemUrl = "";
  safeElemUrl: SafeResourceUrl | undefined;
  contentType: 'image' | 'video' | 'pdf' | 'audio' | '' = '';

  ngOnInit(): void {
    this.updateMediaUrl();
    this.success = true;

    this.cdr.detectChanges()
  }

  imageLoadFailed(error: any) {
    this.success = false;
    this.error = true;
    setTimeout(() => {
      this.updateMediaUrl(true);
      this.success = true;
      this.error = false;
    }, 1000);
  }

  async updateMediaUrl(forceTimestamp = false) {
    this.elemUrl =
      EnvironmentService.environment.cacheDomain +
      "/api/v2/cache/media/" +
      this.media.id;
    
    if (forceTimestamp) {
      this.elemUrl = this.elemUrl + `?date=${new Date().getTime()}`;
    }

    const res = await fetch(this.elemUrl, {
      method: 'HEAD'
    })
    const type = res.headers.get('content-type')
    
    if (type?.startsWith('image')) {
      this.contentType = 'image'
    } else if (type?.startsWith('video')) {
      this.contentType = 'video'
    } else if (type?.endsWith('pdf')) {
      this.contentType = 'pdf'
    } else if (type?.startsWith('audio')) {
      this.contentType = 'audio'
    }

    this.safeElemUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.elemUrl)

    this.cdr.detectChanges()
  }
}
