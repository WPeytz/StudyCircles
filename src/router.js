import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Resources from './pages/Resources.vue'
import Groups from './pages/Groups.vue'
import Ask from './pages/Ask.vue'
import Profile from './pages/Profile.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/resources', name: 'resources', component: Resources },
  { path: '/groups', name: 'groups', component: Groups },
  { path: '/ask', name: 'ask', component: Ask },
  { path: '/profile', name: 'profile', component: Profile },
  { path: '/course/:code', name: 'course', component: () => import('./pages/CoursePage.vue'), props: true },
  { path: '/friends', name: 'friends', component: () => import('./pages/Friends.vue')
}
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router