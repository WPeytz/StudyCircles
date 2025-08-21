// src/main.js
import './assets/base.css'      // <- must be first so CSS variables/classes exist
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
createApp(App).use(router).mount('#app')

;(async () => {
  await ensureAuthInit()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
})()