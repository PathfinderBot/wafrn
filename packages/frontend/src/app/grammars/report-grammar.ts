import * as ohm from 'ohm-js'

// Uses ohm for parsing
// https://ohmjs.org/docs/syntax-reference
const searchGrammar = ohm.grammar(`
Search {
  Query
    = Filter+

  Filter
    = filterModifier? #filterLabeled #selectSeparator #filterSelectValue -- select
    | filterModifier #filterFlag -- flag

  filterLabeled
    = "reporter"
    | "r"
    | "target"
    | "t"

  filterFlag
    = "resolved"
    | "d"

  filterSelectValue
    = alnum+

  filterModifier
    = "+"
    | "-"

  selectSeparator
    = "="
    | ":"
}
`)

const searchSemantic = searchGrammar.createSemantics().addOperation('eval', {
  _iter(...e) {
    return e.map((e) => e['eval']())
  },
  Query(e) {
    return e['eval']()
  },
  Filter_select(mod, label, _sep, value) {
    return [mod['eval'](), label['eval'](), value['eval']()]
  },
  Filter_flag(mod, label) {
    return [mod['eval'](), label['eval']()]
  },
  filterModifier(_) {
    return this.sourceString
  },
  filterFlag(_) {
    return this.sourceString
  },
  filterLabeled(_) {
    return this.sourceString
  },
  filterSelectValue(_) {
    return this.sourceString
  }
})

type ReportFilterEntry =
  | {
      type: 'flag'
      mode: FilterMode
      value: string
    }
  | {
      type: 'select'
      mode: FilterMode
      key: string
      value: string
    }
export type ReportFilter = ReportFilterEntry[]
type FilterMode = '+' | '-'

export function parseReportFilter(query: string): { succeeded: false } | { succeeded: true; filter: ReportFilter } {
  const match = searchGrammar.match(query)
  if (match.failed()) {
    return {
      succeeded: false
    }
  }

  // Parse search into a more useful form
  const parsedFilter: ReportFilter = []
  const res = searchSemantic(match)['eval']() as string[][]
  res.forEach((filter) => {
    const entry: ReportFilterEntry =
      filter.length === 3
        ? {
            type: 'select',
            mode: (Array.isArray(filter[0]) ? '+' : filter[0]) as FilterMode,
            key: filter[1],
            value: filter[2]
          }
        : {
            type: 'flag',
            mode: filter[0] as FilterMode,
            value: filter[1]
          }

    if (filter[0] === '+') {
      parsedFilter.push(entry)
    } else {
      parsedFilter.push(entry)
    }
  })

  return {
    succeeded: true,
    filter: parsedFilter
  }
}
