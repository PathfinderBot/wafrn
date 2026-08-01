import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { InviteCodesComponent } from './invite-codes.component'
import { Route, RouterModule } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { MatCardModule } from '@angular/material/card'
import { MatPaginatorModule } from '@angular/material/paginator'
import { MatTableModule } from '@angular/material/table'
import { MatInputModule } from '@angular/material/input'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatButtonModule } from '@angular/material/button'
import { TranslateModule } from '@ngx-translate/core'

const routes: Route[] = [
  {
    path: '',
    component: InviteCodesComponent
  }
]

@NgModule({
  declarations: [InviteCodesComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    MatTableModule,
    MatCardModule,
    MatPaginatorModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslateModule
  ]
})
export class InviteCodesModule {}
