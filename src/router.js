import { createRouter, createWebHistory } from 'vue-router'

const Home = () => import('./pages/Home.vue')
const Resources = () => import('./pages/Resources.vue')
const Ask = () => import('./pages/Ask.vue')
const Profile = () => import('./pages/Profile.vue')
const Friends = () => import('./pages/Friends.vue')
const AddCourse = () => import('./pages/AddCourse.vue')
const Settings = () => import('./pages/Settings.vue')
const Messages = () => import('./pages/Messages.vue')
const StudyLine = () => import('./pages/StudyLine.vue')
const AdminPage = () => import('./pages/AdminPage.vue')
const CoursePage = () => import('./pages/CoursePage.vue')

const routes = [
  { path: '/', name: 'home', component: Home },
  { path: '/resources', name: 'resources', component: Resources },
  { path: '/ask', name: 'ask', component: Ask },
  { path: '/profile', name: 'profile', component: Profile },
  { path: '/course/:code', name: 'course', component: CoursePage, props: true },
  { path: '/friends', name: 'friends', component: Friends },
  { path: '/add-course', name: 'add-course', component: AddCourse },
  { path: '/settings', name: 'settings', component: Settings },
  { path: '/messages', name: 'messages', component: Messages },
  { path: '/studyline', name: 'studyline', component: StudyLine },
  { path: '/admin', name: 'admin', component: AdminPage },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.onError((err) => {
  // Log the error so it doesn't fail silently
  console.error('[router] chunk error', err)
  const msg = String(err?.message || '')
  if (/Loading chunk|Importing a module script failed|Failed to fetch dynamically imported module/i.test(msg)) {
    // If a hot-reload/cached chunk failed, hard-reload to recover
    try { window.location.reload() } catch {}
  }
})

export default router