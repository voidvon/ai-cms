import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import axios from 'axios'

interface BuildResult {
  success: boolean
  totalFiles?: number
  totalRecords?: number
  message?: string
}

const buildClient = axios.create({
  withCredentials: true,
  timeout: 300000, // 5 minutes for build operations
})

export default function StaticGenerationPage() {
  const [building, setBuilding] = useState(false)

  const buildMutation = useMutation({
    mutationFn: async (section: string) => {
      const response = await buildClient.post<BuildResult>(`/admin/build/generate?section=${section}`, {})
      return response.data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`生成成功！文件数：${data.totalFiles}，记录数：${data.totalRecords}`)
      } else {
        toast.error(data.message || '生成失败')
      }
      setBuilding(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '生成失败')
      setBuilding(false)
    },
  })

  const handleBuild = (section: string) => {
    setBuilding(true)
    buildMutation.mutate(section)
  }

  const sections = [
    { title: '基础页面', items: [
      { label: '生成首页', value: 'index' },
      { label: '生成联系我们', value: 'contact' },
      { label: '生成留言页', value: 'message' },
      { label: '生成公司页面', value: 'corporation' },
    ]},
    { title: '产品相关', items: [
      { label: '生成产品分类列表', value: 'product-lists' },
      { label: '生成产品详情页', value: 'product-details' },
    ]},
    { title: '新闻相关', items: [
      { label: '生成新闻分类列表', value: 'news-lists' },
      { label: '生成新闻详情页', value: 'news-details' },
    ]},
    { title: '服务相关', items: [
      { label: '生成服务分类列表', value: 'service-lists' },
      { label: '生成服务详情页', value: 'service-details' },
    ]},
    { title: '招聘相关', items: [
      { label: '生成招聘列表', value: 'job-lists' },
      { label: '生成招聘详情页', value: 'job-details' },
    ]},
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>静态页面生成</CardTitle>
          <CardDescription>生成静态HTML文件到 `html/` 目录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="font-semibold">{section.title}</h3>
              <div className="flex flex-wrap gap-2">
                {section.items.map((item) => (
                  <Button
                    key={item.value}
                    variant="outline"
                    onClick={() => handleBuild(item.value)}
                    disabled={building}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">全站生成</h3>
            <Button
              onClick={() => handleBuild('all')}
              disabled={building}
            >
              {building ? '生成中...' : '生成全站'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
