import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '@/api/jobs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import JobFormDialog from '@/components/JobFormDialog'
import { toast } from 'sonner'
import type { Job } from '@/types'

export default function JobsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => jobsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleAdd = () => {
    setEditingJob(undefined)
    setFormOpen(true)
  }

  const handleEdit = (job: Job) => {
    setEditingJob(job)
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

  const jobs = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>招聘管理</CardTitle>
              <CardDescription>共 {jobs.length} 条记录</CardDescription>
            </div>
            <Button onClick={handleAdd}>添加职位</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>职位名称</TableHead>
                <TableHead>工作地点</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{job.id}</TableCell>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell>{job.location || '-'}</TableCell>
                    <TableCell>
                      {job.visible === 1 ? (
                        <Badge>显示</Badge>
                      ) : (
                        <Badge variant="secondary">隐藏</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(job.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(job)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(job.id)}>
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

      <JobFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        job={editingJob}
        mode={editingJob ? 'edit' : 'create'}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这个职位吗？
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
