import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'

const preservedNodeTypes = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'image',
]

const PdfDocumentAttributes = Extension.create({
  name: 'pdfDocumentAttributes',

  addGlobalAttributes() {
    return [
      {
        types: preservedNodeTypes,
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class'),
          },
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('id'),
          },
        },
      },
    ]
  },
})

const HtmlBlockContainer = Node.create({
  name: 'htmlBlockContainer',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tag: {
        default: 'div',
        rendered: false,
        parseHTML: (element) => element.tagName.toLowerCase(),
      },
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
      },
      ariaLabel: {
        default: null,
        parseHTML: (element) => element.getAttribute('aria-label'),
        renderHTML: (attributes) => attributes.ariaLabel
          ? { 'aria-label': attributes.ariaLabel }
          : {},
      },
    }
  },

  parseHTML() {
    return ['section', 'div', 'main', 'article', 'nav', 'figure'].map((tag) => ({
      tag,
      priority: 60,
    }))
  },

  renderHTML({ node, HTMLAttributes }) {
    return [node.attrs.tag || 'div', mergeAttributes(HTMLAttributes), 0]
  },
})

const HtmlFigcaption = Node.create({
  name: 'htmlFigcaption',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figcaption', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figcaption', mergeAttributes(HTMLAttributes), 0]
  },
})

const HtmlClassSpan = Mark.create({
  name: 'htmlClassSpan',

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[class], span[id]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

export const PdfDocumentKit = Extension.create({
  name: 'pdfDocumentKit',

  addExtensions() {
    return [PdfDocumentAttributes, HtmlBlockContainer, HtmlFigcaption, HtmlClassSpan]
  },
})

export function sanitizePdfDocumentEditorHtml(value: string) {
  if (!/\bclass\s*=\s*["'][^"']*\bpdf-document(?:\s|--|["'])/i.test(value)) {
    return value
  }

  const template = document.createElement('template')
  template.innerHTML = value
  template.content.querySelectorAll('style, link, colgroup').forEach((element) => element.remove())
  template.content.querySelectorAll<HTMLElement>('[style]').forEach((element) => element.removeAttribute('style'))
  return template.innerHTML
}
