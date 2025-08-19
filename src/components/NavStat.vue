<template>
  <nav class="navbar">
    <RouterLink class="nav-link" to="/">Home</RouterLink>

    <!-- Course tabs (visible when signed in) -->
    <div v-if="courses.length" class="courses-strip">
      <RouterLink
        v-for="c in courses"
        :key="c"
        class="course-tab"
        :title="courseTitles[c] ? `${c} — ${courseTitles[c]}` : c"
        :to="`/course/${c}`"
        :class="{ active: isActiveCourse(c) }"
      >
        <span class="code" :title="courseTitles[c] || ''">{{ c }}</span>
      </RouterLink>
    </div>

    <div class="spacer"></div>
    <RouterLink class="nav-link" to="/add-course">Add Course</RouterLink>
    <RouterLink class="nav-link" to="/friends">Friends</RouterLink>
    <div class="profile-wrap">
      <button class="profile-btn" @click="menuOpen = !menuOpen" aria-label="Profile menu">
        <img :src="avatarSrc" alt="Profile" class="avatar" @error="onAvatarError" />
      </button>
      <div v-if="menuOpen" class="profile-menu">
        <RouterLink class="pm-row" to="/profile" @click="menuOpen = false">Profile</RouterLink>
        <RouterLink class="pm-row" to="/settings" @click="menuOpen = false">Settings</RouterLink>
        <div class="pm-sep"></div>
        <button class="pm-row pm-logout" @click="logout">Logout</button>
      </div>
    </div>
  </nav>

</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'
import { useRouter } from 'vue-router'


const user = currentUser
const courses = ref([])            // array of course codes from profile
const courseTitles = ref({})       // code -> title map
const router = useRouter()
const menuOpen = ref(false)
async function logout () {
  await supabase.auth.signOut()
  router.push('/')
}

const DEFAULT_AVATAR = '/default-avatar.png'
const avatarSrc = ref(DEFAULT_AVATAR)
function onAvatarError() { avatarSrc.value = DEFAULT_AVATAR }

async function loadAvatar(u) {
  if (!u || !supabase) { avatarSrc.value = DEFAULT_AVATAR; return }
  try {
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', u.id)
      .maybeSingle()
    const url = data?.avatar_url || u.user_metadata?.avatar_url || DEFAULT_AVATAR
    avatarSrc.value = url
  } catch {
    avatarSrc.value = DEFAULT_AVATAR
  }
}

const route = useRoute()
function isActiveCourse(code) {
  return route.name === 'course' && String(route.params.code || '') === String(code)
}

async function loadCoursesFor(u) {
  if (!u || !supabase) { courses.value = []; courseTitles.value = {}; return }
  const { data, error } = await supabase
    .from('profiles')
    .select('courses')
    .eq('id', u.id)
    .single()
  if (!error && data?.courses) {
    courses.value = data.courses
    await hydrateTitles(data.courses)
  } else {
    courses.value = []
  }
}

async function hydrateTitles(codes) {
  const missing = (codes || []).filter(c => c && !courseTitles.value[c])
  if (!missing.length) return
  const { data, error } = await supabase
    .from('courses')
    .select('code,title')
    .in('code', missing)
  if (!error && Array.isArray(data)) {
    const map = { ...courseTitles.value }
    for (const row of data) if (row?.code) map[row.code] = row.title
    courseTitles.value = map
  }
}

// Load right away and whenever auth state changes
watch(user, (u) => {
  loadCoursesFor(u)
  loadAvatar(u)
}, { immediate: true })

onMounted(async () => {
  // Use getSession to restore persisted login immediately
  const { data: { session } } = await supabase.auth.getSession()
  const u = session?.user || null
  if (u) {
    await loadCoursesFor(u)
    await loadAvatar(u)
  }

  // Also react to future auth changes (e.g., after refresh)
  supabase.auth.onAuthStateChange((_event, newSession) => {
    const usr = newSession?.user || null
    if (usr) {
      loadCoursesFor(usr)
      loadAvatar(usr)
    } else {
      courses.value = []
      courseTitles.value = {}
      avatarSrc.value = DEFAULT_AVATAR
    }
  })
})
</script>

<style scoped>

.profile-wrap { position: relative; }
.profile-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 260px;
  background: rgba(0,0,0,0.9);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 8px;
  z-index: 1000;
  box-shadow: 0 10px 24px rgba(0,0,0,0.35);
}
.pm-logout { color: #ffb3b3; }

.profile-btn {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  cursor: pointer;
}
.pm-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  color: #fff;
  text-align: left;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
}
.pm-row:hover { background: rgba(255,255,255,0.06); }
.pm-sep { height: 1px; margin: 6px 0; background: rgba(255,255,255,0.12); }

/* Center the navbar at the top */
.navbar {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.18);
  border-radius: 12px;
  margin: 8px auto 16px;
  max-width: 980px;
  z-index: 1500;
}
.spacer {
  flex: 1;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  border: 1px solid rgba(255,255,255,0.18);
}
.nav-link {
  text-decoration: none;
  color: #fff;
  padding: 6px 8px;
  border-radius: 8px;
}
.nav-link:hover { background: rgba(255,255,255,0.08); }

/* Course tabs strip */
.courses-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 6px;
  max-width: 60vw;
}
.course-tab {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: #fff;
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  white-space: nowrap;
}
.course-tab:hover { background: rgba(255,255,255,0.10); }
.course-tab.active { background: rgba(100,149,255,0.25); border-color: rgba(100,149,255,0.6); }
.course-tab .code {
  font-weight: 600;
  position: relative;
}
.course-tab .code:hover::after {
  content: attr(title);
  position: absolute;
  bottom: 120%;   /* show ABOVE the tab */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.92);
  color: #fff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  white-space: nowrap;
  z-index: 2000;  /* above page content */
  pointer-events: none; /* prevent flicker */
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
}
</style>
