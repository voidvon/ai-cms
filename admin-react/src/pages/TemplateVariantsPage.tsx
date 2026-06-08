import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templateVariantsApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function TemplateVariantsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['template-variants'],
    queryFn: () => templateVariantsApi.list(),
  })

  const selectMutation = useMutation({
    mutationFn: (id: number) => templateVariantsApi.select(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-variants'] })
      toast.success('模板已切换')
    },
    onError: () => {
      toast.error('切换失败')
    },
  })

  if (isLoading) {
    return <div>加载中...</div>
  }

  const variants = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>网站模板管理</CardTitle>
          <CardDescription>
            管理网站主题模板，当前共 {variants.length} 个模板可选
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {variants.map((variant: any) => (
              <div key={variant.id} className="border rounded p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-medium">{variant.template_name}</h3>
                      {variant.is_selected === 1 && (
                        <Badge>当前使用</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mt-3">
                      <div>首页: {variant.home_index || '默认'}</div>
                      <div>公司页: {variant.co_index || '默认'}</div>
                      <div>产品首页: {variant.produts_index || '默认'}</div>
                      <div>产品分类: {variant.produts_sort1 || '默认'}</div>
                      <div>产品详情: {variant.produts_detail || '默认'}</div>
                      <div>新闻首页: {variant.news_index || '默认'}</div>
                      <div>新闻列表: {variant.news_sort1 || '默认'}</div>
                      <div>新闻详情: {variant.news_detail || '默认'}</div>
                      <div>招聘首页: {variant.job_index || '默认'}</div>
                      <div>联系我们: {variant.contact || '默认'}</div>
                    </div>
                  </div>
                  <div className="ml-4">
                    {variant.is_selected === 1 ? (
                      <Button variant="outline" disabled>
                        使用中
                      </Button>
                    ) : (
                      <Button
                        onClick={() => selectMutation.mutate(variant.id)}
                        disabled={selectMutation.isPending}
                      >
                        切换到此模板
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {variants.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              暂无可用模板
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模板说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• 模板定义了网站各个页面的布局和样式</p>
          <p>• 切换模板后需要重新生成静态文件才会生效</p>
          <p>• 每个模板可以为不同页面类型指定不同的模板文件</p>
          <p>• 模板文件位于 views 目录下</p>
        </CardContent>
      </Card>
    </div>
  )
}
