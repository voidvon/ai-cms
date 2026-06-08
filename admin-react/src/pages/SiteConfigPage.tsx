import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface SiteConfig {
  web_name: string
  web_url: string
  company_name: string
  company_address: string
  postal_code: string
  company_phone: string
  company_fax: string
  contact_person: string
  company_email: string
  icp_number: string
  web_qq: string
  web_mobile: string
  web_copyright: string
  web_author: string
}

export default function SiteConfigPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['site-config'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SiteConfig }>('/site-config')
      return response.data
    },
  })

  const [formData, setFormData] = useState<SiteConfig>({
    web_name: '',
    web_url: '',
    company_name: '',
    company_address: '',
    postal_code: '',
    company_phone: '',
    company_fax: '',
    contact_person: '',
    company_email: '',
    icp_number: '',
    web_qq: '',
    web_mobile: '',
    web_copyright: '',
    web_author: '',
  })

  useState(() => {
    if (data?.data) {
      setFormData(data.data)
    }
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.put('/site-config', formData)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      toast.success('更新成功')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '更新失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (data?.data && formData.web_name === '') {
    setFormData(data.data)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>网站配置</CardTitle>
          <CardDescription>修改网站基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="web_name">网站名称</Label>
              <Input
                id="web_name"
                value={formData.web_name}
                onChange={(e) => setFormData({ ...formData, web_name: e.target.value })}
                placeholder="请输入网站名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web_url">网站地址</Label>
              <Input
                id="web_url"
                value={formData.web_url}
                onChange={(e) => setFormData({ ...formData, web_url: e.target.value })}
                placeholder="请输入网站地址"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">公司名称</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="请输入公司名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_address">公司地址</Label>
              <Input
                id="company_address"
                value={formData.company_address}
                onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                placeholder="请输入公司地址"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">邮政编码</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="请输入邮政编码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_phone">公司电话</Label>
              <Input
                id="company_phone"
                value={formData.company_phone}
                onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                placeholder="请输入公司电话"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_fax">公司传真</Label>
              <Input
                id="company_fax"
                value={formData.company_fax}
                onChange={(e) => setFormData({ ...formData, company_fax: e.target.value })}
                placeholder="请输入公司传真"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">联系人</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="请输入联系人"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_email">公司邮箱</Label>
              <Input
                id="company_email"
                type="email"
                value={formData.company_email}
                onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                placeholder="请输入公司邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icp_number">ICP备案号</Label>
              <Input
                id="icp_number"
                value={formData.icp_number}
                onChange={(e) => setFormData({ ...formData, icp_number: e.target.value })}
                placeholder="请输入ICP备案号"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web_qq">QQ号</Label>
              <Input
                id="web_qq"
                value={formData.web_qq}
                onChange={(e) => setFormData({ ...formData, web_qq: e.target.value })}
                placeholder="请输入QQ号"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web_mobile">手机号</Label>
              <Input
                id="web_mobile"
                value={formData.web_mobile}
                onChange={(e) => setFormData({ ...formData, web_mobile: e.target.value })}
                placeholder="请输入手机号"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web_copyright">版权信息</Label>
              <Input
                id="web_copyright"
                value={formData.web_copyright}
                onChange={(e) => setFormData({ ...formData, web_copyright: e.target.value })}
                placeholder="请输入版权信息"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="web_author">网站作者</Label>
              <Input
                id="web_author"
                value={formData.web_author}
                onChange={(e) => setFormData({ ...formData, web_author: e.target.value })}
                placeholder="请输入网站作者"
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中...' : '保存配置'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
