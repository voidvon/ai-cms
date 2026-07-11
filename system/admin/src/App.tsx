import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import DashboardLayout from '@/layouts/DashboardLayout'
import AdminLoginLogsPage from '@/pages/AdminLoginLogsPage'
import AdminsPage from '@/pages/AdminsPage'
import AiChatPage from '@/pages/AiChatPage'
import AiConversationPage from '@/pages/AiConversationPage'
import BulkReplacePage from '@/pages/BulkReplacePage'
import ColumnsPage from '@/pages/ColumnsPage'
import ContentModelDataPage from '@/pages/ContentModelDataPage'
import ContentModelsPage from '@/pages/ContentModelsPage'
import DashboardPage from '@/pages/DashboardPage'
import LanguagesPage from '@/pages/LanguagesPage'
import LlmsDiagnosticsPage from '@/pages/LlmsDiagnosticsPage'
import LoginPage from '@/pages/LoginPage'
import MediaAssetsPage from '@/pages/MediaAssetsPage'
import PriceManagementPage from '@/pages/PriceManagementPage'
import SiteConfigPage from '@/pages/SiteConfigPage'
import SitemapDiagnosticsPage from '@/pages/SitemapDiagnosticsPage'
import StaticGenerationPage from '@/pages/StaticGenerationPage'
import TemplateVariantsPage from '@/pages/TemplateVariantsPage'
import TopicManagementPage from '@/pages/TopicManagementPage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="columns" element={<ColumnsPage />} />
          <Route path="themes" element={<TemplateVariantsPage />} />
          <Route path="templates" element={<Navigate to="/themes" replace />} />
          <Route path="content-models" element={<ContentModelsPage />} />
          <Route path="content-model-data" element={<ContentModelDataPage />} />
          <Route path="topics" element={<TopicManagementPage />} />
          <Route path="price-management" element={<PriceManagementPage />} />
          <Route path="pdf-assets" element={<MediaAssetsPage mode="pdfs" />} />
          <Route path="media-assets" element={<MediaAssetsPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="template-variants" element={<Navigate to="/themes" replace />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="admin-login-logs" element={<AdminLoginLogsPage />} />
          <Route path="static-gen" element={<StaticGenerationPage />} />
          <Route path="site-config" element={<SiteConfigPage />} />
          <Route path="bulk-replace" element={<BulkReplacePage />} />
          <Route path="ai" element={<AiConversationPage />} />
          <Route path="ai-docs" element={<AiChatPage />} />
          <Route path="ai-assistant" element={<Navigate to="/ai" replace />} />
          <Route path="sitemap-diagnostics" element={<SitemapDiagnosticsPage />} />
          <Route path="llms-diagnostics" element={<LlmsDiagnosticsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App
