import type { Template } from '@/types'

type TemplateVariableReferenceProps = {
  type: Template['type']
  engine: Template['engine']
}

type VariableGroup = {
  title: string
  items: string[]
}

const htmlGroups: VariableGroup[] = [
  {
    title: '全局变量',
    items: ['{{site.web_name}}', '{{site.company_phone}}', '{{meta.1.title}}', '#component("top")#'],
  },
  {
    title: '当前上下文',
    items: [
      '{{currentPage.title}}',
      '{{currentSection.name}}',
      '#loop(currentCategory)#{{item.name}}#/loop#',
      '{{currentCategoryItem.name}}',
      '{{currentCategoryItem.url}}',
      '{{parentCategory.name}}',
      '{{currentContent.title}}',
    ],
  },
  {
    title: '面包屑',
    items: ['{{{breadcrumb.prefixHtml}}}', '{{{breadcrumb.html}}}'],
  },
]

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
      'currentCategory.map((item) => item.name)',
      'currentCategoryItem?.name',
      'currentCategoryItem?.url',
      'parentCategory?.name',
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

const listHtmlGroup: VariableGroup = {
  title: '列表模板',
  items: ['#loop(items)# ... #/loop#', '{{item.name}}', '{{item.url}}', '{{{pagerHtml}}}'],
}

const listTsxGroup: VariableGroup = {
  title: '列表模板',
  items: ['items.map((item) => ...)', 'item.name', 'item.url', 'pagerHtml'],
}

const contentHtmlGroup: VariableGroup = {
  title: '内容模板',
  items: ['{{title}}', '{{image}}', '{{code}}', '{{{bodyHtml}}}', '{{{previousHtml}}}', '{{{nextHtml}}}'],
}

const contentTsxGroup: VariableGroup = {
  title: '内容模板',
  items: ['title', 'image', 'code', 'bodyHtml', 'previousHtml', 'nextHtml'],
}

export function TemplateVariableReference({ type, engine }: TemplateVariableReferenceProps) {
  const groups = [...(engine === 'tsx' ? tsxGroups : htmlGroups)]
  if (type === 'list') {
    groups.push(engine === 'tsx' ? listTsxGroup : listHtmlGroup)
  }
  if (type === 'content') {
    groups.push(engine === 'tsx' ? contentTsxGroup : contentHtmlGroup)
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
