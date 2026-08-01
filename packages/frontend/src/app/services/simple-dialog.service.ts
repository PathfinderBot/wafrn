import { Injectable, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import {
  PromptDialogComponent,
  PromptDialogData,
  PromptDialogResult
} from '../components/dialog/prompt-dialog.component'
import { lastValueFrom } from 'rxjs'
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
  ConfirmDialogResult
} from '../components/dialog/confirm-dialog.component'
import { CustomDialogComponent, CustomDialogData } from '../components/dialog/custom-dialog.component'

@Injectable({
  providedIn: 'root'
})
export class SimpleDialogService {
  private dialog = inject(MatDialog)

  public async createPromptDialog(data: PromptDialogData): Promise<PromptDialogResult | undefined> {
    const ref = this.dialog.open<PromptDialogComponent, PromptDialogData, PromptDialogResult>(PromptDialogComponent, {
      width: '600px',
      data
    })

    // Can possibly return undefined if some massive error happens I guess
    const res = await lastValueFrom(ref.afterClosed())
    return res
  }

  public async createConfirmDialog(data: ConfirmDialogData): Promise<ConfirmDialogResult | undefined> {
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, ConfirmDialogResult>(
      ConfirmDialogComponent,
      {
        width: '600px',
        data
      }
    )

    // Can possibly return undefined if some massive error happens I guess
    const res = await lastValueFrom(ref.afterClosed())
    return res
  }

  public async createCustomOptionDialog<T extends string>(data: CustomDialogData<T>): Promise<T | undefined> {
    const ref = this.dialog.open<CustomDialogComponent<T>, CustomDialogData<T>, T | undefined>(CustomDialogComponent, {
      width: '600px',
      data
    })

    const res = await lastValueFrom(ref.afterClosed())
    return res
  }
}
