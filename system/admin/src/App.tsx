import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'
import ColumnsPage from '@/pages/ColumnsPage'
import MessagesPage from '@/pages/MessagesPage'
import TemplateVariantsPage from '@/pages/TemplateVariantsPage'
import ContentModelsPage from '@/pages/ContentModelsPage'
import AdminsPage from '@/pages/AdminsPage'
import StaticGenerationPage from '@/pages/StaticGenerationPage'
import SiteConfigPage from '@/pages/SiteConfigPage'

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
          <Route path="messages" element={<MessagesPage />} />
          <Route path="templates" element={<TemplateVariantsPage />} />
          <Route path="content-models" element={<ContentModelsPage />} />
          <Route path="template-variants" element={<Navigate to="/templates" replace />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="static-gen" element={<StaticGenerationPage />} />
          <Route path="site-config" element={<SiteConfigPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

export default App
