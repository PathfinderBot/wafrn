import { Component, Input, ChangeDetectionStrategy } from '@angular/core'
import { MatCardModule } from '@angular/material/card'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'

@Component({
  selector: 'app-loader',
  imports: [MatCardModule, MatProgressSpinnerModule],
  templateUrl: './loader.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './loader.component.scss'
})
export class LoaderComponent {
  @Input() text = 'Loading'
}
