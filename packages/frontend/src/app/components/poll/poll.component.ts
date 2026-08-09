import { Component, input, OnInit, Signal, inject, ChangeDetectionStrategy } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule, UntypedFormGroup, Validators } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatButtonModule } from '@angular/material/button'
import { MatRadioModule } from '@angular/material/radio'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { TranslateModule } from '@ngx-translate/core'
import { QuestionPoll } from '../../interfaces/question-poll'
import { LoginService } from '../../services/login.service'
import { PostsService } from '../../services/posts.service'

@Component({
  selector: 'app-poll',
  imports: [
    MatProgressBarModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatRadioModule,
    MatCheckboxModule,
    TranslateModule
  ],
  templateUrl: './poll.component.html',
  styleUrls: ['./poll.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class PollComponent implements OnInit {
  protected loginService = inject(LoginService)
  private postsService = inject(PostsService)

  poll = input.required<QuestionPoll>()
  total = 0
  openPoll = false
  form = new UntypedFormGroup({})
  alreadyVoted = true

  ngOnInit(): void {
    this.openPoll = new Date().getTime() < this.poll().endDate.getTime()
    this.poll().questionPollQuestions.forEach((elem) => {
      this.total = this.total + elem.remoteReplies
    })
    this.alreadyVoted = this.poll().questionPollQuestions.some((question) => question.questionPollAnswers.length > 0)
    if (this.poll().questionPollQuestions && this.poll().questionPollQuestions.length > 0 && this.poll().multiChoice) {
      this.poll().questionPollQuestions.forEach((question) => {
        this.form.addControl(
          question.id.toString(),
          new FormControl(
            {
              value: question.questionPollAnswers.length > 0,
              disabled: this.alreadyVoted || !this.loginService.loggedIn.value || !this.openPoll
            },
            Validators.required
          )
        )
      })
    }
    if (!this.poll().multiChoice) {
      const existingReply = this.poll().questionPollQuestions.find((reply) => reply.questionPollAnswers.length > 0)
      this.form.addControl(
        'singleValue',
        new FormControl(
          {
            value: existingReply ? existingReply.id : '',
            disabled: this.alreadyVoted || !this.loginService.loggedIn.value || !this.openPoll
          },
          Validators.required
        )
      )
    }
  }

  async vote() {
    let votes: number[] = []
    const formValue = this.form.value
    if (this.poll().multiChoice) {
      Object.keys(formValue).forEach((key) => {
        if (formValue[key]) {
          votes.push(parseInt(key))
        }
      })
    } else {
      votes.push(parseInt(formValue.singleValue))
    }
    const voteSuccess = await this.postsService.voteInPoll(this.poll().id, votes)
    if (voteSuccess) {
      this.alreadyVoted = true
    }
  }
}
