import { createBrowserRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Layout } from './Layout'
import { Landing } from '@/pages/Landing'
import { Library } from '@/pages/Library'
import { Academy } from '@/pages/Academy'
import { Analytics } from '@/pages/Analytics'
import { NotFound } from '@/pages/NotFound'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'library', element: <Library /> },
      { path: 'studio', lazy: async () => ({ Component: (await import('@/pages/Studio')).Studio }) },
      { path: 'academy', element: <Academy /> },
      { path: 'analytics', element: <Analytics /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export function App() {
  return <RouterProvider router={createBrowserRouter(routes)} />
}
