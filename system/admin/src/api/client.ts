import axios from 'axios';
import { setRuntimeAssetsBaseUrl } from '@/lib/assets';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => {
    const url = String(response.config?.url || '');
    const siteConfig = response.data?.data;
    if (url.includes('/site-config') && siteConfig && typeof siteConfig === 'object') {
      setRuntimeAssetsBaseUrl(siteConfig.runtime_assets_base_url || siteConfig.assets_public_base_url || '');
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
