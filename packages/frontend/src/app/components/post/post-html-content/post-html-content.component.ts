import { Component, input, ViewEncapsulation } from '@angular/core';
import { InjectHtmlModule } from "src/app/directives/inject-html/inject-html.module";
import { WafrnMedia } from 'src/app/interfaces/wafrn-media';

@Component({
  selector: 'app-post-html-content',
  imports: [InjectHtmlModule],
  templateUrl: './post-html-content.component.html',
  styleUrl: './post-html-content.component.scss',
  encapsulation: ViewEncapsulation.ShadowDom
})
export class PostHtmlContentComponent {

  fragment = input.required<string | WafrnMedia>()

}
