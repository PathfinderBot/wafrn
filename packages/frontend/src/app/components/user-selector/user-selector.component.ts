import { Component, EventEmitter, Input, OnDestroy, Output, signal, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { debounceTime, Subscription, tap } from 'rxjs'
import { EditorService } from 'src/app/services/editor.service'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { SimplifiedUser } from 'src/app/interfaces/simplified-user'
import { AvatarSmallComponent } from '../avatar-small/avatar-small.component'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-user-selector',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    AvatarSmallComponent,
    MatProgressBarModule,
    TranslatePipe
  ],
  templateUrl: './user-selector.component.html',
  styleUrl: './user-selector.component.scss'
})
export class UserSelectorComponent implements OnDestroy {
  private editorService = inject(EditorService);

  form = new FormGroup({
    userSearcher: new FormControl('')
  })

  @Input() controlText = ''
  @Input() fediExclusive = true
  @Output() optionSelected: EventEmitter<{ remoteId: string; url: string }> = new EventEmitter()
  subscriptions: Array<Subscription> = []
  usersAutocompleteOptions: SimplifiedUser[] = []
  searching = signal(false)

  constructor() {
    this.subscriptions.push(
      this.form.controls['userSearcher'].valueChanges
        .pipe(
          tap(() => {
            this.usersAutocompleteOptions.length = 0
            this.searching.set(true)
          }),
          debounceTime(300)
        )
        .subscribe(() => {
          this.updateUserSearch()
        })
    )
  }

  updateUserSearch() {
    this.usersAutocompleteOptions.length = 0

    this.editorService.searchUser(this.form.controls['userSearcher'].value as string).then((result) => {
      // could (should) check the remoteid field, BUTT the type will get annoying so I rather do a quick and dirty thing.
      this.usersAutocompleteOptions = this.fediExclusive
        ? result.users.filter((usr) => usr.url.split('@').length == 3)
        : result.users
      this.searching.set(false)
    })
  }

  autoCompleteDisplay(option: { remoteId: string; url: string }) {
    return option.url
  }

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe()
    }
  }
}
