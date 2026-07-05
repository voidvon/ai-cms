import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import {
  Bot,
  ChevronDown,
  Folder,
  FileText,
  Globe,
  Image,
  Languages,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  LogOut,
  Map,
  Moon,
  Palette,
  RefreshCw,
  Replace,
  Settings2,
  Shield,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
  const [headerSlotElement, setHeaderSlotElement] = useState<HTMLDivElement | null>(null)
  const [documentTitleOverride, setDocumentTitleOverride] = useState<string>('')
  const [hasMainContentPadding, setHasMainContentPadding] = useState(true)

  const { data: user, isLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: authApi.getCurrentUser,
    retry: false,
  })

  const handleLogout = async () => {
    await authApi.logout()
    navigate('/login')
  }

  const isDarkMode = resolvedTheme === 'dark'

  const handleToggleTheme = () => {
    setTheme(isDarkMode ? 'light' : 'dark')
  }

  type MenuItem = {
    path: string
    label: string
    icon: LucideIcon
  }

  const topLevelItems = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    { path: '/ai', label: 'AI 对话', icon: Bot },
    { path: '/ai-docs', label: 'AI 文档', icon: FileText },
    { path: '/price-management', label: '价格管理', icon: ListOrdered },
    { path: '/content-model-data', label: '信息管理', icon: FileText },
    { path: '/topics', label: '专题管理', icon: FileText },
    { path: '/columns', label: '栏目管理', icon: Folder },
    { path: '/media-assets', label: '附件管理', icon: Image },
  ] satisfies MenuItem[]

  const menuGroups = [
    {
      label: '模板',
      icon: Palette,
      items: [
        { path: '/themes', label: '主题管理', icon: Palette },
        { path: '/content-models', label: '数据模型', icon: Settings2 },
      ]
    },
    {
      label: '站点',
      icon: Globe,
      items: [
        { path: '/languages', label: '多语言', icon: Languages },
        { path: '/site-config', label: '网站配置', icon: Globe },
        { path: '/static-gen', label: '静态生成', icon: RefreshCw },
      ]
    },
    {
      label: '工具',
      icon: Bot,
      items: [
        { path: '/bulk-replace', label: '批量替换', icon: Replace },
        { path: '/sitemap-diagnostics', label: 'Sitemap', icon: Map },
        { path: '/llms-diagnostics', label: 'LLMS', icon: Bot },
      ]
    },
    {
      label: '系统',
      icon: Shield,
      items: [
        { path: '/admins', label: '管理员', icon: Shield },
        { path: '/admin-login-logs', label: '登录日志', icon: ListChecks },
      ]
    }
  ] satisfies Array<{
    label: string
    icon: LucideIcon
    items: MenuItem[]
  }>

  const getCurrentPageTitle = () => {
    const topLevelCurrent = topLevelItems.find(item => item.path === location.pathname)
    if (topLevelCurrent) return topLevelCurrent.label
    for (const group of menuGroups) {
      const current = group.items.find(item => item.path === location.pathname)
      if (current) return current.label
    }
    return '管理后台'
  }

  const routeTitle = useMemo(() => {
    return String(getCurrentPageTitle()).trim() || '管理后台'
  }, [location.pathname])

  const isMainPaddingDisabledByRoute = location.pathname === '/ai'

  const currentDocumentTitle = useMemo(() => {
    return String(documentTitleOverride || routeTitle).trim() || '管理后台'
  }, [documentTitleOverride, routeTitle])

  useEffect(() => {
    setDocumentTitleOverride('')
    setHasMainContentPadding(true)
  }, [location.pathname])

  useEffect(() => {
    document.title = currentDocumentTitle
  }, [currentDocumentTitle])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>加载中...</div>
      </div>
    )
  }

  if (!user?.success) {
    return <Navigate to="/login" replace />
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
            <SidebarGroupContent>
              <SidebarMenu>
                {topLevelItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.path)}
                      isActive={location.pathname === item.path}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {menuGroups.map((group) => (
                  <Collapsible key={group.label} defaultOpen className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="w-full">
                          <group.icon />
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
                                <item.icon />
                                <span>{item.label}</span>
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
                <BreadcrumbPage>{routeTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div ref={setHeaderSlotElement} className="min-w-0 flex-1" />
        </header>
        <main
          className={`flex min-h-0 flex-1 flex-col ${
            isMainPaddingDisabledByRoute ? 'overflow-hidden' : 'overflow-y-auto'
          } ${
            !isMainPaddingDisabledByRoute && hasMainContentPadding ? 'p-4' : 'p-0'
          }`}
        >
          <Outlet
            context={{
              headerSlotElement,
              setDocumentTitle: setDocumentTitleOverride,
              setMainContentPadding: setHasMainContentPadding,
            }}
          />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
