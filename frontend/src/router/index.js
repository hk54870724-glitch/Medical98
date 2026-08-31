import { createRouter, createWebHistory } from 'vue-router';
import { me } from '../api/auth';

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('../views/ChangePasswordView.vue'), meta: { roles: ['EMPLOYEE','HR','FINANCE','ADMIN'] } },
  { path: '/', component: () => import('../views/HomeView.vue') },
  { path: '/apply', component: () => import('../views/ApplyView.vue'), meta: { roles: ['EMPLOYEE', 'ADMIN'] } },
  { path: '/my-applications', component: () => import('../views/MyApplicationsView.vue'), meta: { roles: ['EMPLOYEE', 'ADMIN'] } },
  { path: '/approvals', component: () => import('../views/ApprovalView.vue'), meta: { roles: ['HR', 'FINANCE', 'ADMIN'] } },
  { path: '/admin/years', component: () => import('../views/AdminYearsView.vue'), meta: { roles: ['ADMIN'] } },
  { path: '/admin/rules', component: () => import('../views/AdminRulesView.vue'), meta: { roles: ['ADMIN'] } },
  { path: '/admin/employees', component: () => import('../views/AdminEmployeesView.vue'), meta: { roles: ['ADMIN'] } },
  { path: '/admin/users', component: () => import('../views/AdminUsersView.vue'), meta: { roles: ['ADMIN'] } }
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  try {
    const result = await me();
    const user = result?.data?.user ?? result?.data ?? null;
    if (!user) return '/login';
    window.__user = user;
    if (to.path !== '/change-password' && user.mustChangePassword) return '/change-password';
    if (to.path === '/') {
      if (user.role === 'EMPLOYEE') return '/apply';
      if (['HR','FINANCE'].includes(user.role)) return '/approvals';
      return '/admin/years';
    }
    if (Array.isArray(to.meta.roles) && !to.meta.roles.includes(user.role)) return user.role === 'EMPLOYEE' ? '/apply' : (user.role === 'ADMIN' ? '/admin/years' : '/approvals');
    return true;
  } catch {
    return '/login';
  }
});

export default router;
