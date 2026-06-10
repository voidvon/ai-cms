import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import type { Template } from '@/types'

type TemplateCodeEditorProps = {
  id?: string
  value: string
  engine: Template['engine']
  onChange: (value: string) => void
  className?: string
  height?: string
}

const editorTheme = EditorView.theme({
  '&': {
    borderRadius: '0.375rem',
    backgroundColor: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    fontSize: '12px',
  },
  '&.cm-focused': {
    outline: '2px solid hsl(var(--ring))',
    outlineOffset: '2px',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '12px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-gutters': {
    backgroundColor: 'hsl(var(--muted))',
    borderRight: '1px solid hsl(var(--border))',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'hsl(var(--accent))',
  },
})

export function TemplateCodeEditor({ id, value, engine, onChange, className, height = '520px' }: TemplateCodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const extensions = useMemo(() => {
    const language = engine === 'tsx' ? javascript({ jsx: true, typescript: true }) : html()
    return [language, EditorView.lineWrapping, editorTheme]
  }, [engine])

  return (
    <div id={id} className={cn('overflow-hidden rounded-md border border-input bg-background', className)}>
      <CodeMirror
        value={value}
        height={height}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          searchKeymap: true,
        }}
        extensions={extensions}
        onChange={onChange}
      />
    </div>
  )
}
