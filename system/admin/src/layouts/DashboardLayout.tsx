import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { ChevronDown } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: authApi.getCurrentUser,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>加载中...</div>
      </div>
    )
  }

  if (!user?.success) {
    navigate('/login')
    return null
  }

  const handleLogout = async () => {
    await authApi.logout()
    navigate('/login')
  }

  const menuGroups = [
    {
      label: '产品管理',
      items: [
        { path: '/products', label: '产品列表' },
        { path: '/product-categories', label: '产品分类' },
        { path: '/product-photos', label: '产品相册' },
      ]
    },
    {
      label: '新闻管理',
      items: [
        { path: '/news', label: '新闻列表' },
        { path: '/news-categories', label: '新闻分类' },
      ]
    },
    {
      label: '其他模块',
      items: [
        { path: '/corporation-categories', label: '公司分类' },
        { path: '/jobs', label: '招聘管理' },
        { path: '/messages', label: '留言管理' },
        { path: '/contacts', label: '联系方式' },
      ]
    },
    {
      label: '高级设置',
      items: [
        { path: '/custom-labels', label: '自定义标签' },
        { path: '/meta-types', label: 'SEO元数据' },
        { path: '/templates', label: '模板管理' },
        { path: '/content-models', label: '数据模型' },
      ]
    },
    {
      label: '系统管理',
      items: [
        { path: '/admins', label: '管理员' },
        { path: '/static-gen', label: '静态生成' },
        { path: '/site-config', label: '网站配置' },
      ]
    }
  ]

  const getCurrentPageTitle = () => {
    for (const group of menuGroups) {
      const current = group.items.find(item => item.path === location.pathname)
      if (current) return current.label
    }
    return '管理后台'
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-2">
            <h1 className="text-lg font-semibold">管理后台</h1>
            <p className="text-sm text-muted-foreground">欢迎, {user.data?.username}</p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>菜单</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuGroups.map((group) => (
                  <Collapsible key={group.label} defaultOpen className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="w-full">
                          <span>{group.label}</span>
                          <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.path}>
                              <SidebarMenuSubButton
                                onClick={() => navigate(item.path)}
                                isActive={location.pathname === item.path}
                              >
                                {item.label}
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                退出登录
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{getCurrentPageTitle()}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
