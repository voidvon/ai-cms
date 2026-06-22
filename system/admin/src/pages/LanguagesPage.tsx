import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import LanguageFormDialog from '@/components/LanguageFormDialog'
import { toast } from 'sonner'
import type { Language } from '@/types'

export default function LanguagesPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingLanguage, setEditingLanguage] = useState<Language | undefined>()
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingLanguage, setDeletingLanguage] = useState<Language | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => languagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] })
      setDeleteDialogOpen(false)
      setDeletingLanguage(null)
      toast.success('语言已删除')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleAdd = () => {
    setEditingLanguage(undefined)
    setFormMode('create')
    setFormOpen(true)
  }

  const handleEdit = (language: Language) => {
    setEditingLanguage(language)
    setFormMode('edit')
    setFormOpen(true)
  }

  const handleDelete = (language: Language) => {
    setDeletingLanguage(language)
    setDeleteDialogOpen(true)
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const languages = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>多语言管理</CardTitle>
              <CardDescription>维护语言、默认语言和部署路径。</CardDescription>
            </div>
            <Button onClick={handleAdd}>新增语言</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>语言</TableHead>
                <TableHead>代码</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>输出目录</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {languages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">暂无语言配置</TableCell>
                </TableRow>
              ) : (
                languages.map((language) => (
                  <TableRow key={language.id}>
                    <TableCell>
                      <div className="font-medium">{language.name}</div>
                      <div className="text-xs text-muted-foreground">{language.native_name || '-'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{language.code}</TableCell>
                    <TableCell>
                      {language.is_default ? '默认' : '普通'} / {language.is_enabled ? '启用' : '停用'}
                    </TableCell>
                    <TableCell>
                      <div>{language.site.site_mode === 'standalone' ? '独立站点' : '子目录站点'}</div>
                      <div className="text-xs text-muted-foreground">
                        {language.site.site_mode === 'standalone'
                          ? `${language.site.bind_host || '127.0.0.1'}:${language.site.access_port || '-'}`
                          : (language.site.host ? language.site.host : language.site.path_prefix)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{language.site.output_dir}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(language)}>编辑</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={language.is_default === 1}
                        onClick={() => handleDelete(language)}
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LanguageFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        language={editingLanguage}
        mode={formMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除语言 {deletingLanguage?.name} 吗？此操作不会删除现有内容主表，但会影响后续多语言发布。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingLanguage && deleteMutation.mutate(deletingLanguage.id)}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
