import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'
import ColumnsPage from '@/pages/ColumnsPage'
import MediaAssetsPage from '@/pages/MediaAssetsPage'
import TemplateVariantsPage from '@/pages/TemplateVariantsPage'
import ContentModelsPage from '@/pages/ContentModelsPage'
import AdminsPage from '@/pages/AdminsPage'
import StaticGenerationPage from '@/pages/StaticGenerationPage'
import SiteConfigPage from '@/pages/SiteConfigPage'
import SitemapDiagnosticsPage from '@/pages/SitemapDiagnosticsPage'
import LlmsDiagnosticsPage from '@/pages/LlmsDiagnosticsPage'
import LanguagesPage from '@/pages/LanguagesPage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/columns" replace />} />
          <Route path="dashboard" element={<Navigate to="/columns" replace />} />
          <Route path="columns" element={<ColumnsPage />} />
          <Route path="corporation-categories" element={<Navigate to="/columns" replace />} />
          <Route path="themes" element={<TemplateVariantsPage />} />
          <Route path="templates" element={<Navigate to="/themes" replace />} />
          <Route path="content-models" element={<ContentModelsPage />} />
          <Route path="media-assets" element={<MediaAssetsPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="template-variants" element={<Navigate to="/themes" replace />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="static-gen" element={<StaticGenerationPage />} />
          <Route path="site-config" element={<SiteConfigPage />} />
          <Route path="sitemap-diagnostics" element={<SitemapDiagnosticsPage />} />
          <Route path="llms-diagnostics" element={<LlmsDiagnosticsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App
