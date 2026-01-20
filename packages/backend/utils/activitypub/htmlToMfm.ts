import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import postcss from 'postcss'
import safeParser from 'postcss-safe-parser'
import Color from 'color'

function parseInlineStyle(style: string) {
  if (!style) return {}
  // @ts-ignore
  const root = postcss.parse(`*{${style}}`, { parser: safeParser })
  const types: Record<string, string> = {}
  root.walkDecls(d => { types[d.prop] = d.value })
  return types
}

export async function htmlToMfm(input: string): Promise<string> {
  const file = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeToMfm)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(input)

  return file.toString().replace('&#x3C;', '<')
}

function cssToMfm(child: string, types: Record<string, string>): string {
  let mfm = child
  if (types['text-align'] === 'center') mfm = `<center>${mfm}</center>`
  if (types['color']) {
    try {
      const c = Color(types['color'])
      mfm = `$[fg.color=${c.hex().replace('#', '')} ${mfm}]`
    } catch {
      mfm = `$[fg.color=${types['color'].replace('#', '')} ${mfm}]`
    }
  }
  if (types['background-color']) {
    try {
      const c = Color(types['background-color'])
      mfm = `$[bg.color=${c.hex().replace('#', '')} ${mfm}]`
    } catch {
      mfm = `$[bg.color=${types['background-color'].replace('#', '')} ${mfm}]`
    }
  }
  if (types['background']) {
    try {
      const c = Color(types['background'])
      mfm = `$[bg.color=${c.hex().replace('#', '')} ${mfm}]`
    } catch {
      mfm = `$[bg.color=${types['background'].replace('#', '')} ${mfm}]`
    }
  }

  if (types['font-weight'] === 'bold') mfm = `**${mfm}**`
  if (types['font-style'] === 'italic') mfm = `*${mfm}*`
  if (types['text-decoration']?.includes('line-through')) mfm = `~~${mfm}~~`
  if (types['filter']?.includes('blur')) mfm = `$[blur ${mfm}]`

  return mfm
}

function rehypeToMfm() {
  return (tree: any) => {
    function nodeToMfm(node: any): string {
      if (node.type === 'text') return node.value
      if (node.type === 'element') {
        const child = (node.children || []).map(nodeToMfm).join('')
        const style = node.properties?.style || ''
        const href = node.properties?.href || ''
        const types = parseInlineStyle(style)
        const schild = cssToMfm(child, types)

        switch (node.tagName.toLowerCase()) {
          case 'strong':
          case 'b': return `**${schild}**`
          case 'em':
          case 'i': return `*${schild}*`
          case 'center': return `<center>${schild}</center>`
          case 'del': return `~~${schild}~~`
          case 'code': return (schild.includes('\n')) ? `\`\`\`\n${schild}\n\`\`\`` : `\`${schild}\``
          case 'p': return `${schild}\n\n`
          case 'br': return '\n'
          case 'h1': return `$[x2 ${schild}]\n\n`
          case 'h2': return `**${schild}**\n\n`
          case 'h3': return `${schild}\n\n`
          case 'blockquote': return `> ${schild}`
          case 'ul':
          case 'ol': return Array.from(node.children || []).map(nodeToMfm).join('')
          case 'li': return `- ${schild}\n`
          case 'a': {
            if (schild.startsWith('@')) {
              const mfmMention = new URL(href).hostname;
              return `${schild}@${mfmMention}`
            }
            return `[${schild}](${href})`
          }
          default:
            return schild
        }
      }
      return node.value
    }

    const mfm = (tree.children || []).map(nodeToMfm).join('').trim()
    tree.type = 'text'
    tree.value = mfm
    tree.child = []
  }
}