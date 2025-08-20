<template>
  <nav class="navbar">
    <RouterLink class="brand" to="/">StudyCircles</RouterLink>

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

    <div v-if="signedIn" class="right">
      <RouterLink class="nav-link" to="/add-course">Add Course</RouterLink>
      <RouterLink class="nav-link" to="/friends">Friends</RouterLink>
      <RouterLink class="icon-link" to="/messages" aria-label="Messages">
        <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 6.5C4 5.12 5.12 4 6.5 4h11c1.38 0 2.5 1.12 2.5 2.5v7c0 1.38-1.12 2.5-2.5 2.5H9.8l-3.9 3.12c-.74.59-1.9.07-1.9-.88V16H6.5C5.12 16 4 14.88 4 13.5v-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </RouterLink>

      <div class="notif-wrap">
        <button class="icon-link" aria-label="Notifications" @click="notifOpen = !notifOpen">
          <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span v-if="notifCount" class="notif-badge">{{ notifCount }}</span>
        </button>

        <div v-if="notifOpen" class="notif-menu">
          <div class="nm-head">Applications</div>
          <div v-if="!applications.length" class="nm-empty">No new applications</div>
          <div v-for="app in applications" :key="app.id" class="nm-item">
            <div class="nm-line">
              <span class="nm-course">#{{ app.course }}</span>
              <span class="nm-time">{{ new Date(app.created_at).toLocaleString() }}</span>
            </div>
            <div class="nm-msg">{{ app.message }}</div>
            <div class="nm-actions">
              <button class="button small" @click="acceptApplication(app)">Accept</button>
              <button class="button small danger" @click="rejectApplication(app)">Reject</button>
            </div>
          </div>
        </div>
      </div>

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

const notifOpen = ref(false)
const applications = ref([]) // pending applications assigned to me
const notifCount = computed(() => applications.value.length)
let notifChannel = null

const signedIn = ref(false)

async function loadApplications(u) {
  if (!u) { applications.value = []; return }
  const { data, error } = await supabase
    .from('group_applications')
    .select('id, course, message, created_at, status')
    .eq('notify_user_id', u.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)
  applications.value = error ? [] : (data || [])
}

async function acceptApplication(app) {
  const { error } = await supabase
    .from('group_applications')
    .update({ status: 'accepted' })
    .eq('id', app.id)
  if (!error) {
    applications.value = applications.value.filter(a => a.id !== app.id)
  }
}

async function rejectApplication(app) {
  const { error } = await supabase
    .from('group_applications')
    .update({ status: 'rejected' })
    .eq('id', app.id)
  if (!error) {
    applications.value = applications.value.filter(a => a.id !== app.id)
  }
}

function subscribeApplications(u) {
  if (notifChannel) supabase.removeChannel(notifChannel)
  if (!u) return
  notifChannel = supabase
    .channel('group_applications_notif')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'group_applications',
      filter: `notify_user_id=eq.${u.id}`
    }, (payload) => {
      const row = payload.new
      if (row.status === 'pending') {
        applications.value = [{
          id: row.id,
          course: row.course,
          message: row.message,
          created_at: row.created_at,
          status: row.status
        }, ...applications.value]
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'group_applications',
      filter: `notify_user_id=eq.${u.id}`
    }, (payload) => {
      const row = payload.new
      if (row.status !== 'pending') {
        applications.value = applications.value.filter(a => a.id !== row.id)
      }
    })
    .subscribe()
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
  signedIn.value = !!u
  loadCoursesFor(u)
  loadAvatar(u)
  loadApplications(u)
  subscribeApplications(u)
}, { immediate: true })

onMounted(async () => {
  // Use getSession to restore persisted login immediately
  const { data: { session } } = await supabase.auth.getSession()
  const u = session?.user || null
  signedIn.value = !!u
  if (u) {
    await loadCoursesFor(u)
    await loadAvatar(u)
    await loadApplications(u)
    subscribeApplications(u)
  }

  // Also react to future auth changes (e.g., after refresh)
  supabase.auth.onAuthStateChange((_event, newSession) => {
    const usr = newSession?.user || null
    signedIn.value = !!usr
    if (usr) {
      loadCoursesFor(usr)
      loadAvatar(usr)
      loadApplications(usr)
      subscribeApplications(usr)
    } else {
      courses.value = []
      courseTitles.value = {}
      avatarSrc.value = DEFAULT_AVATAR
      applications.value = []
      notifOpen.value = false
      if (notifChannel) {
        supabase.removeChannel(notifChannel)
        notifChannel = null
      }
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
  flex-wrap: nowrap;
}

.right {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

/* .spacer { flex: 1; }  removed as per instructions */

.brand { flex: 0 0 auto; text-decoration: none; color: #8fb1ff; font-weight: 700; }

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
  overflow-y: visible;
  padding: 4px 6px;
  max-width: 60vw;
  flex: 1 1 auto;
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
  top: 140%;
  bottom: auto;
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

.icon-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  color: #fff;
  text-decoration: none;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
}
.icon-link:hover { background: rgba(255,255,255,0.10); }
.icon-link .icon { width: 18px; height: 18px; }

.notif-wrap { position: relative; }
.notif-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #e35d6a;
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0,0,0,0.35);
}
.notif-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 60vh;
  overflow: auto;
  background: rgba(0,0,0,0.9);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 8px;
  z-index: 1000;
  box-shadow: 0 10px 24px rgba(0,0,0,0.35);
}
.nm-head { font-weight: 600; margin: 2px 4px 8px; opacity: .9; }
.nm-empty { opacity: .7; font-size: 13px; padding: 8px; }
.nm-item { display: grid; gap: 6px; padding: 8px; border-radius: 8px; }
.nm-item:hover { background: rgba(255,255,255,0.06); }
.nm-line { display: flex; justify-content: space-between; gap: 8px; }
.nm-course { font-weight: 600; }
.nm-time { opacity: .7; font-size: 12px; }
.nm-msg { font-size: 14px; opacity: .9; }
.nm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.button.small { padding: 6px 10px; font-size: 13px; }
.button.small.danger { background: rgba(227,93,106,0.15); border: 1px solid rgba(227,93,106,0.45); }

</style>
