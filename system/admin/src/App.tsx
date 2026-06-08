import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import LoginPage from '@/pages/LoginPage'
import DashboardLayout from '@/layouts/DashboardLayout'
import ProductsPage from '@/pages/ProductsPage'
import ProductCategoriesPage from '@/pages/ProductCategoriesPage'
import ProductPhotosPage from '@/pages/ProductPhotosPage'
import NewsPage from '@/pages/NewsPage'
import NewsCategoriesPage from '@/pages/NewsCategoriesPage'
import CorporationCategoriesPage from '@/pages/CorporationCategoriesPage'
import JobsPage from '@/pages/JobsPage'
import MessagesPage from '@/pages/MessagesPage'
import ContactsPage from '@/pages/ContactsPage'
import CustomLabelsPage from '@/pages/CustomLabelsPage'
import MetaTypesPage from '@/pages/MetaTypesPage'
import TemplateVariantsPage from '@/pages/TemplateVariantsPage'
import AdminsPage from '@/pages/AdminsPage'
import StaticGenerationPage from '@/pages/StaticGenerationPage'
import SiteConfigPage from '@/pages/SiteConfigPage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="dashboard" element={<Navigate to="/products" replace />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="product-categories" element={<ProductCategoriesPage />} />
          <Route path="product-photos" element={<ProductPhotosPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="news-categories" element={<NewsCategoriesPage />} />
          <Route path="corporation-categories" element={<CorporationCategoriesPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="custom-labels" element={<CustomLabelsPage />} />
          <Route path="meta-types" element={<MetaTypesPage />} />
          <Route path="template-variants" element={<TemplateVariantsPage />} />
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
