import type { ReactElement } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { RequireAuth, RequireCapability } from '@/auth/guards'
import type { CapabilityCode } from '@/types/access'
import { AppShell } from '@/shell/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DishListPage } from '@/features/dishes/DishListPage'
import { DishEditorPage } from '@/features/dishes/DishEditorPage'
import { DishDetailPage } from '@/features/dishes/DishDetailPage'
import { PlatingEditorPage } from '@/features/dishes/PlatingEditorPage'
import { ProductionListPage } from '@/features/production/ProductionListPage'
import { ProductionEditorPage } from '@/features/production/ProductionEditorPage'
import { ProductionDetailPage } from '@/features/production/ProductionDetailPage'
import { StandardsListPage } from '@/features/standards/StandardsListPage'
import { StandardDetailPage } from '@/features/standards/StandardDetailPage'
import { StandardEditorPage } from '@/features/standards/StandardEditorPage'
import { ActivityPage } from '@/features/activity/ActivityPage'
import { MenuListPage } from '@/features/menus/MenuListPage'
import { MenuDetailPage } from '@/features/menus/MenuDetailPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { RolesPage } from '@/features/admin/RolesPage'
import { MorePage } from '@/features/more/MorePage'
import { InventoryListPage } from '@/features/inventory/InventoryListPage'
import { LabelSheetPage } from '@/features/labels/LabelSheetPage'
import { ComingSoonPage } from '@/features/placeholder/ComingSoonPage'
import { RouteError } from '@/app/RouteError'

const cap = (c: CapabilityCode, element: ReactElement) => ({
  element: <RequireCapability cap={c}>{element}</RequireCapability>,
})

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', ...cap('dashboard.view', <DashboardPage />) },

          { path: '/recipes/dishes', ...cap('dish.view', <DishListPage />) },
          { path: '/recipes/dishes/new', ...cap('dish.edit', <DishEditorPage />) },
          { path: '/recipes/dishes/:id', ...cap('dish.view', <DishDetailPage />) },
          { path: '/recipes/dishes/:id/edit', ...cap('dish.edit', <DishEditorPage />) },
          { path: '/recipes/dishes/:id/plating', ...cap('standard.edit', <PlatingEditorPage />) },

          { path: '/menus', ...cap('menu.view', <MenuListPage />) },
          { path: '/menus/:branchId', ...cap('menu.view', <MenuDetailPage />) },

          { path: '/admin/users', ...cap('admin.users', <UsersPage />) },
          { path: '/admin/roles', ...cap('admin.roles', <RolesPage />) },

          { path: '/more', element: <MorePage /> },

          { path: '/recipes/production', ...cap('production.view', <ProductionListPage />) },
          { path: '/recipes/production/new', ...cap('production.edit', <ProductionEditorPage />) },
          { path: '/recipes/production/:id', ...cap('production.view', <ProductionDetailPage />) },
          { path: '/recipes/production/:id/edit', ...cap('production.edit', <ProductionEditorPage />) },
          { path: '/standards', ...cap('standard.view', <StandardsListPage />) },
          { path: '/standards/:dishId', ...cap('standard.view', <StandardDetailPage />) },
          { path: '/standards/:dishId/edit', ...cap('standard.edit', <StandardEditorPage />) },
          { path: '/inventory', ...cap('inventory.view', <InventoryListPage />) },
          { path: '/labels/:itemId', ...cap('inventory.view', <LabelSheetPage />) },
          { path: '/activity', ...cap('activity.view', <ActivityPage />) },
          { path: '/documents', element: <ComingSoonPage titleKey="nav.documents" icon="documents" /> },
          { path: '/pos', element: <ComingSoonPage titleKey="nav.pos" icon="pos" /> },

          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
