import axios from 'axios';
import { setRuntimeAssetsBaseUrl } from '@/lib/assets';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
});

let isRedirectingToLogin = false;

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
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export function redirectToLogin() {
  const currentPath = window.location.pathname;
  const isLoginPath = currentPath === '/admin/login' || currentPath === '/admin/login/';
  if (isRedirectingToLogin || isLoginPath) {
    return;
  }

  isRedirectingToLogin = true;

  const loginUrl = new URL('/admin/login', window.location.origin);
  loginUrl.searchParams.set('reason', 'session-expired');

  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    const appPath = currentPath.slice('/admin'.length) || '/';
    const returnTo = `${appPath}${window.location.search}${window.location.hash}`;
    if (returnTo !== '/' && returnTo !== '/login') {
      loginUrl.searchParams.set('redirect', returnTo);
    }
  }

  window.location.replace(`${loginUrl.pathname}${loginUrl.search}`);
}

export default apiClient;
