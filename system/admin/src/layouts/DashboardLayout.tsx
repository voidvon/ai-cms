import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
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
  SidebarSeparator,
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
  const { resolvedTheme, setTheme } = useTheme()

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

  const isDarkMode = resolvedTheme === 'dark'

  const handleToggleTheme = () => {
    setTheme(isDarkMode ? 'light' : 'dark')
  }

  const mainMenuItems = [
    { path: '/columns', label: '栏目' },
  ]

  const menuGroups = [
    {
      label: '高级设置',
      items: [
        { path: '/themes', label: '主题管理' },
        { path: '/content-models', label: '数据模型' },
        { path: '/languages', label: '多语言管理' },
        { path: '/media-assets', label: '附件管理' },
      ]
    },
    {
      label: '系统管理',
      items: [
        { path: '/admins', label: '管理员' },
        { path: '/static-gen', label: '静态生成' },
        { path: '/site-config', label: '网站配置' },
        { path: '/sitemap-diagnostics', label: 'Sitemap 诊断' },
        { path: '/llms-diagnostics', label: 'LLMS 诊断' },
      ]
    }
  ]

  const getCurrentPageTitle = () => {
    const mainCurrent = mainMenuItems.find(item => item.path === location.pathname)
    if (mainCurrent) return mainCurrent.label
    for (const group of menuGroups) {
      const current = group.items.find(item => item.path === location.pathname)
      if (current) return current.label
    }
    return '管理后台'
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
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
                {mainMenuItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.path)}
                      isActive={location.pathname === item.path}
                    >
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
        <SidebarFooter className="gap-0 p-0">
          <SidebarSeparator />
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 truncate text-sm text-muted-foreground">
              {user.data?.username}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <SidebarMenuButton
                onClick={handleToggleTheme}
                aria-label={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
                className="h-8 w-8 justify-center p-0"
              >
                {isDarkMode ? <Sun /> : <Moon />}
                <span className="sr-only">{isDarkMode ? '白天模式' : '黑夜模式'}</span>
              </SidebarMenuButton>
              <SidebarMenuButton
                onClick={handleLogout}
                aria-label="退出登录"
                className="h-8 w-8 justify-center p-0"
              >
                <LogOut />
                <span className="sr-only">退出登录</span>
              </SidebarMenuButton>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
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
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
