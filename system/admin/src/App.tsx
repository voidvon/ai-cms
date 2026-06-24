import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardLayout = lazy(() => import('@/layouts/DashboardLayout'))
const ColumnsPage = lazy(() => import('@/pages/ColumnsPage'))
const MediaAssetsPage = lazy(() => import('@/pages/MediaAssetsPage'))
const TemplateVariantsPage = lazy(() => import('@/pages/TemplateVariantsPage'))
const ContentModelsPage = lazy(() => import('@/pages/ContentModelsPage'))
const AdminsPage = lazy(() => import('@/pages/AdminsPage'))
const StaticGenerationPage = lazy(() => import('@/pages/StaticGenerationPage'))
const SiteConfigPage = lazy(() => import('@/pages/SiteConfigPage'))
const SitemapDiagnosticsPage = lazy(() => import('@/pages/SitemapDiagnosticsPage'))
const LlmsDiagnosticsPage = lazy(() => import('@/pages/LlmsDiagnosticsPage'))
const LanguagesPage = lazy(() => import('@/pages/LanguagesPage'))
const BulkReplacePage = lazy(() => import('@/pages/BulkReplacePage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      页面加载中...
    </div>
  )
}

function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/columns" replace />} />
            <Route path="dashboard" element={<Navigate to="/columns" replace />} />
            <Route path="columns" element={<ColumnsPage />} />
            <Route path="themes" element={<TemplateVariantsPage />} />
            <Route path="templates" element={<Navigate to="/themes" replace />} />
            <Route path="content-models" element={<ContentModelsPage />} />
            <Route path="media-assets" element={<MediaAssetsPage />} />
            <Route path="languages" element={<LanguagesPage />} />
            <Route path="template-variants" element={<Navigate to="/themes" replace />} />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="static-gen" element={<StaticGenerationPage />} />
            <Route path="site-config" element={<SiteConfigPage />} />
            <Route path="bulk-replace" element={<BulkReplacePage />} />
            <Route path="sitemap-diagnostics" element={<SitemapDiagnosticsPage />} />
            <Route path="llms-diagnostics" element={<LlmsDiagnosticsPage />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}

export default App
