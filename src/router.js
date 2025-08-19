import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Resources from './pages/Resources.vue'
import Groups from './pages/Groups.vue'
import Ask from './pages/Ask.vue'
import Profile from './pages/Profile.vue'
import Friends from './pages/Friends.vue'
import AddCourse from './pages/AddCourse.vue'
import Settings from './pages/Settings.vue'

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/resources', name: 'resources', component: Resources },
  { path: '/groups', name: 'groups', component: Groups },
  { path: '/ask', name: 'ask', component: Ask },
  { path: '/profile', name: 'profile', component: Profile },
  { path: '/course/:code', name: 'course', component: () => import('./pages/CoursePage.vue'), props: true },
  { path: '/friends', name: 'friends', component: Friends },
  { path: '/add-course', name: 'add-course', component: AddCourse },
  { path: '/settings', name: 'settings', component: Settings }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router