import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productCategoriesApi } from '@/api/product-categories'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import ProductCategoryFormDialog from '@/components/ProductCategoryFormDialog'
import { toast } from 'sonner'
import type { ProductCategory } from '@/types'

export default function ProductCategoriesPage() {
  const [page, setPage] = useState(1)
  const [parentId, setParentId] = useState(0)
  const limit = 50
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-categories', parentId, page, limit],
    queryFn: () => productCategoriesApi.listAdmin({ parentId, page, limit }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleAdd = () => {
    setEditingCategory(undefined)
    setFormOpen(true)
  }

  const handleEdit = (category: ProductCategory) => {
    setEditingCategory(category)
    setFormOpen(true)
  }

  const handleDelete = (id: number) => {
    setDeletingId(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId)
    }
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const categories = data?.items || []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>产品分类管理</CardTitle>
              <CardDescription>
                {parentId === 0 ? '顶级分类' : `子分类 (父分类ID: ${parentId})`} - 共 {pagination?.total || 0} 条记录
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {parentId !== 0 && (
                <Button variant="outline" onClick={() => setParentId(0)}>
                  返回顶级
                </Button>
              )}
              <Button onClick={handleAdd}>添加分类</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>分类名称</TableHead>
                <TableHead>父分类ID</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>子分类数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category: any) => (
                  <TableRow key={category.id}>
                    <TableCell>{category.id}</TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.parent_id}</TableCell>
                    <TableCell>{category.sort_order}</TableCell>
                    <TableCell>{category.child_count || 0}</TableCell>
                    <TableCell className="text-right">
                      {category.child_count > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setParentId(category.id)}
                        >
                          查看子分类
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(category)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(category.id)}>
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

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            第 {pagination.page} / {pagination.totalPages} 页
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => setPage(1)}
            >
              首页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => setPage(pagination.totalPages)}
            >
              末页
            </Button>
          </div>
        </div>
      )}

      <ProductCategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        currentParentId={parentId}
        mode={editingCategory ? 'edit' : 'create'}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这个分类吗？如果该分类下有子分类或产品，删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
