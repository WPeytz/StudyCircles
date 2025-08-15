import { createRouter, createWebHistory } from 'vue-router'

import Home from './pages/Home.vue'
import Resources from './pages/Resources.vue'
import Groups from './pages/Groups.vue'
import Ask from './pages/Ask.vue'
import Profile from './pages/Profile.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/resources', component: Resources },
  { path: '/groups', component: Groups },
  { path: '/ask', component: Ask },
  { path: '/profile', component: Profile },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router