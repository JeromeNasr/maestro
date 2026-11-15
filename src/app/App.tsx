import { createBrowserRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Layout } from './Layout'
import { Landing } from '@/pages/Landing'
import { NotFound } from '@/pages/NotFound'
import { PageLoading, RouteError } from './RouteFallbacks'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    HydrateFallback: PageLoading,
    ErrorBoundary: RouteError,
    children: [
      { index: true, element: <Landing /> },
      { path: 'library', lazy: async () => ({ Component: (await import('@/pages/Library')).Library }) },
      { path: 'studio', lazy: async () => ({ Component: (await import('@/pages/Studio')).Studio }) },
      { path: 'academy', lazy: async () => ({ Component: (await import('@/pages/Academy')).Academy }) },
      { path: 'orchestra', lazy: async () => ({ Component: (await import('@/pages/Orchestra')).Orchestra }) },
      { path: 'analytics', lazy: async () => ({ Component: (await import('@/pages/Analytics')).Analytics }) },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export function App() {
  return <RouterProvider router={createBrowserRouter(routes)} />
}
