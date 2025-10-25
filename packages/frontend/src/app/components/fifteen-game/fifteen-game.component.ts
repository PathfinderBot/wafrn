import { Component, input, output } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { TranslatePipe } from '@ngx-translate/core'

type Coordinate = [number, number]

export type FifteenOptions = {
  width: number
  height: number
  scrambleCount: number
}

@Component({
  selector: 'app-fifteen-game',
  imports: [MatButtonModule, TranslatePipe],
  templateUrl: './fifteen-game.component.html',
  styleUrl: './fifteen-game.component.scss'
})
export class FifteenGameComponent {
  won = output()
  options = input<Partial<FifteenOptions>>() // make the input name nicer

  // just in case we make this not fifteen but w*h-1
  opts: FifteenOptions
  defaultOptions = {
    width: 3,
    height: 3,
    scrambleCount: 101
  }

  moves = 0

  wonBoard: number[] = []
  board: number[] = []
  blankIndex: number = 0
  initialBoard: number[] = []
  initialBlankIndex: number = 0

  constructor() {
    this.opts = this.defaultOptions
  }

  ngOnInit() {
    this.opts = Object.assign(this.defaultOptions, this.options())
    this.wonBoard = [...[...Array(this.opts.width * this.opts.height).keys()].slice(1), 0]

    this.newBoard()
    this.initialBoard = [...this.board]
    this.initialBlankIndex = this.blankIndex
  }

  win() {
    this.won.emit()
  }

  handleTile(index: number) {
    this.swapTiles(this.indexToCoord(index), this.indexToCoord(this.blankIndex))
    this.blankIndex = index

    this.moves += 1

    // Check if we won I guess
    if (this.boardWon()) this.win()
  }

  //
  // Game functionality
  //
  newBoard() {
    this.moves = 0

    // Try up to 20 boards to find one that isn't auto-solved already
    let checkCount = 0
    do {
      this.board = [...[...Array(this.opts.width * this.opts.height).keys()].slice(1), 0] // [1...n-1,0]
      this.blankIndex = this.opts.width * this.opts.height - 1 // Last time is 0 (blank)
      for (let i = 0; i < this.opts.scrambleCount; i++) {
        this.randomSwap(this.blankIndex)
      }
    } while (this.boardWon() && checkCount++ < 20)
  }

  resetBoard() {
    this.board = [...this.initialBoard]
    this.blankIndex = this.initialBlankIndex
    this.moves = 0
  }

  tileClickable(index: number): boolean {
    // Can't click the blank tile also
    if (index === this.blankIndex) return false

    // Ensure index is adjacent
    const adjacentIndices = this.getAdjacentIndices(this.blankIndex)
    return adjacentIndices.includes(index)
  }

  // start: tile to swap with an adjacent tile
  private randomSwap(startIndex: number) {
    const adjacentTiles: number[] = this.getAdjacentIndices(startIndex)

    const nextIndex = adjacentTiles.at(Math.floor(Math.random() * adjacentTiles.length))
    if (nextIndex === undefined) return

    this.swapTiles(this.indexToCoord(startIndex), this.indexToCoord(nextIndex))
    this.blankIndex = nextIndex
  }

  // Helpers

  // Converts index to coordinate if valid or null if invalid
  private indexToCoord(index: number): Coordinate | null {
    if (index >= this.opts.width * this.opts.height) return null
    return [index % this.opts.width, Math.floor(index / this.opts.width)]
  }

  // Converts coordinate to index if valid or null if invalid
  private coordToIndex(pos: Coordinate): number | null {
    const [x, y] = pos
    if (x < 0 || y < 0 || x >= this.opts.width || y >= this.opts.width) return null
    return x + y * this.opts.height
  }

  // Swaps two tiles as longs as they are both valid
  private swapTiles(from: Coordinate | null, to: Coordinate | null) {
    if (from === null || to === null) return

    const fromIndex = this.coordToIndex(from)
    const toIndex = this.coordToIndex(to)
    if (fromIndex === null || toIndex === null) return

    const temp = this.board[toIndex]
    this.board[toIndex] = this.board[fromIndex]
    this.board[fromIndex] = temp
  }

  // Result of adding two coordinates or null if off the edge
  private coordAdd(a: Coordinate, b: Coordinate): Coordinate | null {
    const res: Coordinate = [a[0] + b[0], a[1] + b[1]]
    if (res[0] < 0 || res[1] < 0 || res[0] >= this.opts.width || res[1] >= this.opts.height) return null
    return res
  }

  private getAdjacentIndices(index: number): number[] {
    const startCoord = this.indexToCoord(index)
    if (startCoord === null) return []

    // Evil way to filter to tiles that can be picked
    return (
      [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0]
      ] as Coordinate[]
    )
      .map((c) => this.coordAdd(c, startCoord))
      .filter((v) => v !== null)
      .map((c) => this.coordToIndex(c))
      .filter((v) => v !== null)
  }

  // If the board is won
  private boardWon(): boolean {
    return this.board.every((tile, i) => tile === this.wonBoard[i])
  }
}
