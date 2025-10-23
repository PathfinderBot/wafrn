import { Injectable, signal, WritableSignal } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class GlobalData {
  public static appDefaultTitle: string
  public mobile: WritableSignal<boolean>

  constructor() {
    this.mobile = signal(window.innerWidth <= 992)
  }
}
