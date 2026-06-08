import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productPhotosApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { toast } from 'sonner'
import type { ProductPhoto } from '@/types'

export default function ProductPhotosPage() {
  const queryClient = useQueryClient()
  const [productId, setProductId] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState<ProductPhoto | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({ product_id: '', name: '', image_path: '' })

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-photos', productId],
    queryFn: () => productPhotosApi.list(productId ? parseInt(productId) : undefined),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productPhotosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-photos'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingPhoto) {
        return productPhotosApi.update(editingPhoto.id, formData)
      }
      return productPhotosApi.create(formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-photos'] })
      toast.success(editingPhoto ? '更新成功' : '创建成功')
      setFormOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleAdd = () => {
    setEditingPhoto(undefined)
    setFormData({ product_id: productId, name: '', image_path: '' })
    setFormOpen(true)
  }

  const handleEdit = (photo: ProductPhoto) => {
    setEditingPhoto(photo)
    setFormData({
      product_id: photo.product_id?.toString() || '',
      name: photo.name || '',
      image_path: photo.image_path
    })
    setFormOpen(true)
  }

  const handleDelete = (id: number) => {
    setDeletingId(id)
    setDeleteDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.image_path) {
      toast.error('请输入图片路径')
      return
    }
    saveMutation.mutate()
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const photos = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle>产品相册管理</CardTitle>
              <CardDescription>管理产品的多图展示，共 {photos.length} 张图片</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="按产品ID筛选"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-40"
              />
              <Button onClick={handleAdd}>添加图片</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>产品ID</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>图片路径</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {photos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                photos.map((photo: ProductPhoto) => (
                  <TableRow key={photo.id}>
                    <TableCell>{photo.id}</TableCell>
                    <TableCell>{photo.product_id || '-'}</TableCell>
                    <TableCell>{photo.name || '-'}</TableCell>
                    <TableCell className="max-w-md truncate">{photo.image_path}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(photo)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(photo.id)}>
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPhoto ? '编辑图片' : '添加图片'}</DialogTitle>
            <DialogDescription>
              {editingPhoto ? '修改产品相册图片' : '添加新的产品相册图片'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product_id">产品ID</Label>
              <Input
                id="product_id"
                type="number"
                value={formData.product_id}
                onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                placeholder="请输入产品ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">图片名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入图片名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image_path">图片路径 *</Label>
              <Input
                id="image_path"
                value={formData.image_path}
                onChange={(e) => setFormData({ ...formData, image_path: e.target.value })}
                placeholder="/uploads/..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这张图片吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMutation.mutate(deletingId)}>
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
