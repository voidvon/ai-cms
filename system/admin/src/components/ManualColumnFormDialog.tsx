import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Column, Template } from '@/types'

export interface ManualColumnFormValue {
  name: string
  parent_id: number
  column_kind: 'link' | 'single'
  custom_url: string
  route_path: string
  open_in_new_tab: number
  content_html: string
  seo_title: string
  seo_keywords: string
  seo_description: string
  sort_order: number
}

interface ManualColumnFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  column?: Column | null
  initialKind?: 'link' | 'single'
  columns: Column[]
  templates: Template[]
  initialTemplateId: string
  submitting: boolean
  onSubmit: (value: ManualColumnFormValue, templateId: string) => void
}

const DEFAULT_TEMPLATE_VALUE = '__default__'

export default function ManualColumnFormDialog({
  open,
  onOpenChange,
  mode,
  column,
  initialKind = 'link',
  columns,
  templates,
  initialTemplateId,
  submitting,
  onSubmit
}: ManualColumnFormDialogProps) {
  const [formData, setFormData] = useState<ManualColumnFormValue>({
    name: '',
    parent_id: 0,
    column_kind: initialKind,
    custom_url: '',
    route_path: '',
    open_in_new_tab: 0,
    content_html: '',
    seo_title: '',
    seo_keywords: '',
    seo_description: '',
    sort_order: 0
  })
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  useEffect(() => {
    if (!open) {
      return
    }

    if (mode === 'edit' && column) {
      setFormData({
        name: column.name || '',
        parent_id: Number(column.parent_id || 0),
        column_kind: column.column_kind === 'single' ? 'single' : 'link',
        custom_url: column.custom_url || '',
        route_path: column.route_path || '',
        open_in_new_tab: Number(column.open_in_new_tab || 0),
        content_html: column.content_html || '',
        seo_title: column.seo_title || '',
        seo_keywords: column.seo_keywords || '',
        seo_description: column.seo_description || '',
        sort_order: Number(column.sort_order || 0)
      })
      setTemplateId(initialTemplateId || DEFAULT_TEMPLATE_VALUE)
      return
    }

    setFormData({
      name: '',
      parent_id: 0,
      column_kind: initialKind,
      custom_url: '',
      route_path: '',
      open_in_new_tab: 0,
      content_html: '',
      seo_title: '',
      seo_keywords: '',
      seo_description: '',
      sort_order: 0
    })
    setTemplateId(DEFAULT_TEMPLATE_VALUE)
  }, [open, mode, column, initialKind, initialTemplateId])

  const parentOptions = useMemo(() => {
    return columns.filter((item) => {
      if (mode === 'edit' && column && item.id === column.id) {
        return false
      }
      return String(item.column_kind || 'category') !== 'single'
    })
  }, [columns, mode, column])

  const contentTemplates = useMemo(
    () => templates.filter((item) => item.type === 'content'),
    [templates]
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onSubmit(formData, templateId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增栏目' : '编辑栏目'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '可创建链接栏目或单页栏目。' : '修改当前栏目的展示与页面信息。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>栏目类型</Label>
              <Select
                disabled={mode === 'edit'}
                value={formData.column_kind}
                onValueChange={(value: 'link' | 'single') => setFormData({ ...formData, column_kind: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">链接栏目</SelectItem>
                  <SelectItem value="single">单页栏目</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>父栏目</Label>
              <Select
                value={String(formData.parent_id)}
                onValueChange={(value) => setFormData({ ...formData, parent_id: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">顶级栏目</SelectItem>
                  {parentOptions.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manual-column-name">栏目名称</Label>
              <Input
                id="manual-column-name"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="请输入栏目名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-column-sort">排序</Label>
              <Input
                id="manual-column-sort"
                type="number"
                value={String(formData.sort_order)}
                onChange={(event) => setFormData({ ...formData, sort_order: Number.parseInt(event.target.value || '0', 10) || 0 })}
                placeholder="0"
              />
            </div>
          </div>

          {formData.column_kind === 'link' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="manual-column-url">链接地址</Label>
                <Input
                  id="manual-column-url"
                  value={formData.custom_url}
                  onChange={(event) => setFormData({ ...formData, custom_url: event.target.value })}
                  placeholder="/ 或 https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>打开方式</Label>
                <Select
                  value={String(formData.open_in_new_tab)}
                  onValueChange={(value) => setFormData({ ...formData, open_in_new_tab: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">当前窗口</SelectItem>
                    <SelectItem value="1">新窗口</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="manual-column-path">访问路径</Label>
                <Input
                  id="manual-column-path"
                  value={formData.route_path}
                  onChange={(event) => setFormData({ ...formData, route_path: event.target.value })}
                  placeholder="/contact/"
                />
              </div>
              <div className="space-y-2">
                <Label>内容模板</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
                    {contentTemplates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-column-content">页面内容</Label>
                <Textarea
                  id="manual-column-content"
                  className="min-h-[220px]"
                  value={formData.content_html}
                  onChange={(event) => setFormData({ ...formData, content_html: event.target.value })}
                  placeholder="请输入单页内容 HTML"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manual-column-seo-title">SEO 标题</Label>
                  <Input
                    id="manual-column-seo-title"
                    value={formData.seo_title}
                    onChange={(event) => setFormData({ ...formData, seo_title: event.target.value })}
                    placeholder="可选"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-column-seo-keywords">SEO 关键词</Label>
                  <Input
                    id="manual-column-seo-keywords"
                    value={formData.seo_keywords}
                    onChange={(event) => setFormData({ ...formData, seo_keywords: event.target.value })}
                    placeholder="可选"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-column-seo-description">SEO 描述</Label>
                <Textarea
                  id="manual-column-seo-description"
                  value={formData.seo_description}
                  onChange={(event) => setFormData({ ...formData, seo_description: event.target.value })}
                  placeholder="可选"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
