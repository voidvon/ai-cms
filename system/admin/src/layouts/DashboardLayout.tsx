import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import {
  ArrowLeft,
  Bot,
  Boxes,
  BrainCircuit,
  Cpu,
  Database,
  FilePenLine,
  FileType2,
  FolderTree,
  Globe,
  History,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  Network,
  Paintbrush,
  Palette,
  PanelsTopLeft,
  Paperclip,
  RefreshCw,
  Replace,
  Settings2,
  Shield,
  Sun,
  TableProperties,
  Tags,
  UserCog,
  Wrench,
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
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarTreeMenu, type SidebarTreeMenuItem } from '@/components/SidebarTreeMenu'
import SystemVersionControl from '@/components/SystemVersionControl'

const SIDEBAR_OPEN_STORAGE_KEY = 'admin.sidebar.open'

function getInitialSidebarOpen() {
  try {
    return window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function clearLegacySidebarCookie() {
  document.cookie = 'sidebar_state=; path=/; max-age=0; SameSite=Lax'
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const [headerSlotElement, setHeaderSlotElement] = useState<HTMLDivElement | null>(null)
  const [documentTitleOverride, setDocumentTitleOverride] = useState<string>('')
  const [hasMainContentPadding, setHasMainContentPadding] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen)

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
    { path: '/ai-docs', label: 'AI 文档', icon: FilePenLine },
    { path: '/multidimensional-tables', label: '多维表格', icon: TableProperties },
    { path: '/content-model-data', label: '信息管理', icon: Database },
    { path: '/topics', label: '专题管理', icon: Tags },
    { path: '/columns', label: '栏目管理', icon: FolderTree },
    { path: '/pdf-assets', label: 'PDF', icon: FileType2 },
    { path: '/media-assets', label: '附件', icon: Paperclip },
  ] satisfies MenuItem[]

  const menuGroups = [
    {
      label: '模板',
      icon: Palette,
      items: [
        { path: '/themes', label: '主题管理', icon: Paintbrush },
        { path: '/content-models', label: '数据模型', icon: Boxes },
      ]
    },
    {
      label: '站点',
      icon: Globe,
      items: [
        { path: '/languages', label: '多语言', icon: Languages },
        { path: '/site-config', label: '全站配置', icon: Settings2 },
        { path: '/static-gen', label: '静态生成', icon: RefreshCw },
      ]
    },
    {
      label: '工具',
      icon: Wrench,
      items: [
        { path: '/bulk-replace', label: '批量替换', icon: Replace },
        { path: '/sitemap-diagnostics', label: 'Sitemap', icon: Network },
        { path: '/llms-diagnostics', label: 'LLMS', icon: BrainCircuit },
      ]
    },
    {
      label: '系统',
      icon: Shield,
      items: [
        { path: '/ai-models', label: '模型管理', icon: Cpu },
        { path: '/admins', label: '管理员', icon: UserCog },
        { path: '/admin-login-logs', label: '登录日志', icon: History },
      ]
    }
  ] satisfies Array<{
    label: string
    icon: LucideIcon
    items: MenuItem[]
  }>

  const sidebarTreeItems: SidebarTreeMenuItem[] = [
    ...topLevelItems.map((item) => ({
      id: item.path,
      label: item.label,
      icon: item.icon,
      active: location.pathname === item.path,
      onSelect: () => navigate(item.path),
      closeOnMobileClick: true,
      tooltip: item.label,
    })),
    ...menuGroups.map((group) => ({
      id: `group:${group.label}`,
      label: group.label,
      icon: group.icon,
      defaultOpen: true,
      tooltip: group.label,
      children: group.items.map((item) => ({
        id: item.path,
        label: item.label,
        icon: item.icon,
        active: location.pathname === item.path,
        onSelect: () => navigate(item.path),
        closeOnMobileClick: true,
      })),
    })),
  ]

  const getCurrentPageTitle = () => {
    if (location.pathname === '/price-management') return '多维表格'
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
  const hideRouteBreadcrumb = location.pathname === '/ai-docs'
  const isAiDocumentEditor = location.pathname === '/ai-docs'
    && new URLSearchParams(location.search).has('draft')

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

  useEffect(() => {
    clearLegacySidebarCookie()
  }, [])

  const handleSidebarOpenChange = (open: boolean) => {
    setIsSidebarOpen(open)

    try {
      window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(open))
    } catch {
      // Keep the in-memory state when browser storage is unavailable.
    }

    // SidebarProvider still writes its upstream compatibility cookie after this callback.
    queueMicrotask(clearLegacySidebarCookie)
  }

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
    <SidebarProvider
      open={isSidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      className="h-svh overflow-hidden [&_[data-slot=sidebar-container]]:ease-in-out [&_[data-slot=sidebar-gap]]:ease-in-out"
    >
      <TooltipProvider delay={0}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="overflow-hidden">
          <div className="flex w-[calc(var(--sidebar-width)-1rem)] items-center gap-2 px-2 py-2 transition-[padding] duration-200 ease-in-out group-data-[collapsible=icon]:px-0">
            <SidebarMenuButton
              onClick={() => navigate('/dashboard')}
              aria-label="管理后台"
              tooltip="管理后台"
              className="w-8 shrink-0 justify-center"
            >
              <PanelsTopLeft className="size-4" />
            </SidebarMenuButton>
            <div className="min-w-0 whitespace-nowrap opacity-100 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-lg font-semibold">管理后台</h1>
                <SystemVersionControl />
              </div>
              <p className="truncate text-sm text-muted-foreground">欢迎, {user.data?.username}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarTreeMenu items={sidebarTreeItems} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-0 p-0">
          <SidebarSeparator />
          <div className="relative h-14 shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out group-data-[collapsible=icon]:h-[5.5rem]">
            <div className="absolute inset-y-0 left-4 flex max-w-[calc(100%-6.5rem)] items-center truncate text-sm text-muted-foreground opacity-100 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
              {user.data?.username}
            </div>
            <SidebarMenuButton
              onClick={handleToggleTheme}
              aria-label={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
              className="absolute right-12 top-3 h-8 w-8 justify-center p-0 transition-[right,top] duration-200 ease-in-out group-data-[collapsible=icon]:right-2"
              tooltip={isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
            >
              {isDarkMode ? <Sun /> : <Moon />}
              <span className="sr-only">{isDarkMode ? '白天模式' : '黑夜模式'}</span>
            </SidebarMenuButton>
            <SidebarMenuButton
              onClick={handleLogout}
              aria-label="退出登录"
              className="absolute right-2 top-3 h-8 w-8 justify-center p-0 transition-[right,top] duration-200 ease-in-out group-data-[collapsible=icon]:top-12"
              tooltip="退出登录"
            >
              <LogOut />
              <span className="sr-only">退出登录</span>
            </SidebarMenuButton>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-[42px] shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          {isAiDocumentEditor ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate('/ai-docs')}
              aria-label="返回文档列表"
              title="返回文档列表"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : null}
          {!hideRouteBreadcrumb ? (
            <>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{routeTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </>
          ) : null}
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
      </TooltipProvider>
    </SidebarProvider>
  )
}
