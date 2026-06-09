import 'react'

declare module 'react' {
  interface HtmlHTMLAttributes<T> {
    xmlns?: string
  }

  interface ScriptHTMLAttributes<T> {
    language?: string
  }
}
