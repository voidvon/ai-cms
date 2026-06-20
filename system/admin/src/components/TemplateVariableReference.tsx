import type { Template } from '@/types'

type TemplateVariableReferenceProps = {
  type: Template['type']
}

type VariableGroup = {
  title: string
  items: string[]
}

const tsxGroups: VariableGroup[] = [
  {
    title: '全局变量',
    items: ['site.web_name', 'site.company_phone', 'meta?.[1]?.title', "component('top')"],
  },
  {
    title: '当前上下文',
    items: [
      'currentPage?.title',
      'currentSection?.name',
      'currentColumn.map((item) => item.name)',
      'currentColumnItem?.name',
      'currentColumnItem?.url',
      'parentColumn?.name',
      'currentContent?.title',
    ],
  },
  {
    title: '面包屑',
    items: ['breadcrumb?.prefixHtml', 'breadcrumb?.html', 'breadcrumb?.items'],
  },
  {
    title: '组件与插槽',
    items: [
      "component('layout_shell', { children: <div />, slots: { header: <div /> } })",
      'children',
      'slots?.header',
      'slots?.aside',
    ],
  },
]

const listTsxGroup: VariableGroup = {
  title: '列表模板',
  items: ['items.map((item) => ...)', 'item.name', 'item.url', 'pagerHtml'],
}

const contentTsxGroup: VariableGroup = {
  title: '内容模板',
  items: ['title', 'image', 'code', 'bodyHtml', 'previousHtml', 'nextHtml'],
}

const singleTsxGroup: VariableGroup = {
  title: '单页模板',
  items: ['title', 'contentHtml', 'currentPage?.url', 'breadcrumb?.items'],
}

export function TemplateVariableReference({ type }: TemplateVariableReferenceProps) {
  const groups = [...tsxGroups]
  if (type === 'list') {
    groups.push(listTsxGroup)
  }
  if (type === 'content') {
    groups.push(contentTsxGroup)
  }
  if (type === 'single') {
    groups.push(singleTsxGroup)
  }

  return (
    <aside className="rounded-md border bg-muted/20 p-3">
      <div className="text-sm font-medium">可用变量</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        组件模板会在生成时自动获得当前页面、栏目、分类、内容和面包屑上下文。
      </p>
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{group.title}</div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <code
                  key={item}
                  className="block overflow-x-auto rounded border bg-background px-2 py-1 font-mono text-[11px] leading-5 text-foreground"
                >
                  {item}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
