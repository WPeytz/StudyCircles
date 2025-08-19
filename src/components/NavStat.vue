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

    <RouterLink class="nav-link" to="/friends">Friends</RouterLink>
    <RouterLink class="nav-link" to="/profile">Profile</RouterLink>
  </nav>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const user = currentUser
const courses = ref([])            // array of course codes from profile
const courseTitles = ref({})       // code -> title map

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
watch(user, (u) => { loadCoursesFor(u) }, { immediate: true })

onMounted(async () => {
  // Use getSession to restore persisted login immediately
  const { data: { session } } = await supabase.auth.getSession()
  const u = session?.user || null
  if (u) await loadCoursesFor(u)

  // Also react to future auth changes (e.g., after refresh)
  supabase.auth.onAuthStateChange((_event, newSession) => {
    const usr = newSession?.user || null
    if (usr) {
      loadCoursesFor(usr)
    } else {
      courses.value = []
      courseTitles.value = {}
    }
  })
})
</script>

<style scoped>
/* Center the navbar at the top */
.navbar {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 18px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.18);
  border-radius: 12px;
  margin: 8px auto 16px;
  max-width: 980px;
  z-index: 1500;
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
