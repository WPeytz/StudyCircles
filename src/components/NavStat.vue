<template>
  <nav class="navbar">
    <RouterLink class="brand" to="/" @click="closeMenus">StudyCircles</RouterLink>

    <!-- Course tabs (visible when signed in) -->
    <div v-if="courses.length" class="courses-strip">
      <RouterLink
        v-for="c in courses"
        :key="c"
        class="course-tab"
        :title="courseTitles[c] ? `${c} — ${courseTitles[c]}` : c"
        :to="`/course/${c}`"
        :class="{ active: isActiveCourse(c) }"
        @click="closeMenus"
      >
        <span class="code" :title="courseTitles[c] || ''">{{ c }}</span>
      </RouterLink>
    </div>

    <div v-if="signedIn" class="right">
      <RouterLink class="nav-link" to="/add-course" @click="closeMenus">Add Course</RouterLink>
      <RouterLink class="nav-link" to="/friends" @click="closeMenus">Friends</RouterLink>
      <RouterLink class="icon-link" to="/messages" aria-label="Messages" @click="closeMenus">
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
          <div class="nm-head">Friend requests</div>
          <div v-if="!friendReqs.length" class="nm-empty">No new requests</div>
          <div v-for="fr in friendReqs" :key="fr.id" class="nm-item">
            <div class="nm-line">
              <span class="nm-course">{{ fr.sender_name || fr.sender_id }}</span>
              <span class="nm-time">{{ new Date(fr.created_at).toLocaleString() }}</span>
            </div>
            <div class="nm-actions">
              <button class="icon-mini accept" @click="acceptFriend(fr)" title="Accept">✔</button>
              <button class="icon-mini decline" @click="declineFriend(fr)" title="Decline">✖</button>
            </div>
          </div>
          <div class="nm-head">Applications</div>
          <div v-if="!applications.length" class="nm-empty">No new study group applications</div>
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
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { supabase, currentUser, authReady, ensureAuthInit } from '../services/supabase'
import { useRouter } from 'vue-router'

// Listen for course updates from AddCourse
function handleCoursesUpdated(e) {
  // 1) Optimistic UI: trust payload if provided
  if (Array.isArray(e?.detail)) {
    courses.value = e.detail
  }
  // 2) Authoritative refresh from DB
  const uid = currentUser.value?.id
  if (uid) {
    loadCoursesFor({ id: uid })
  }
}

onMounted(() => {
  window.addEventListener('studycircles:courses-updated', handleCoursesUpdated)
})

onBeforeUnmount(() => {
  window.removeEventListener('studycircles:courses-updated', handleCoursesUpdated)
})

// Make sure global auth is initialized (idempotent)
ensureAuthInit?.()


const user = currentUser
const courses = ref([])            // array of course codes from profile
const courseTitles = ref({})       // code -> title map
const router = useRouter()
const menuOpen = ref(false)
const closeMenus = () => { menuOpen.value = false; notifOpen.value = false }
async function logout () {
  await supabase.auth.signOut()
  router.push('/')
}

const notifOpen = ref(false)
const applications = ref([]) // pending applications assigned to me
const friendReqs = ref([]) // pending friend requests for me
const notifCount = computed(() => (applications.value.length + friendReqs.value.length))
let notifChannel = null
let friendReqChannel = null

async function enrichSenderNames(reqs) {
  const ids = Array.from(new Set((reqs || []).map(r => r.sender_id).filter(Boolean)))
  if (!ids.length) return reqs
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email')
    .in('id', ids)
  if (!error && Array.isArray(data)) {
    const byId = Object.fromEntries(data.map(p => [p.id, (p.username || p.email || '').trim()]))
    for (const r of reqs) r.sender_name = byId[r.sender_id] || r.sender_name || ''
  }
  return reqs
}

async function loadFriendRequests(u) {
  friendReqs.value = []
  if (!u) return
  const { data, error } = await supabase
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', u.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)
  const list = error ? [] : (data || [])
  friendReqs.value = await enrichSenderNames(list)
}

function subscribeFriendRequests(u) {
  if (friendReqChannel) supabase.removeChannel(friendReqChannel)
  if (!u) return
  friendReqChannel = supabase
    .channel('friend_requests_notif')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'friend_requests',
      filter: `receiver_id=eq.${u.id}`
    }, async (payload) => {
      const row = payload.new
      if (row.status === 'pending') {
        const item = { id: row.id, sender_id: row.sender_id, receiver_id: row.receiver_id, status: row.status, created_at: row.created_at }
        await enrichSenderNames([item])
        friendReqs.value = [item, ...friendReqs.value]
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'friend_requests',
      filter: `receiver_id=eq.${u.id}`
    }, (payload) => {
      const row = payload.new
      if (row.status !== 'pending') {
        friendReqs.value = friendReqs.value.filter(r => r.id !== row.id)
      }
    })
    .subscribe()
}

async function acceptFriend(fr) {
  if (!fr?.id) return
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', fr.id)
  if (!error) {
    friendReqs.value = friendReqs.value.filter(r => r.id !== fr.id)
  }
}

async function declineFriend(fr) {
  if (!fr?.id) return
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined' })
    .eq('id', fr.id)
  if (!error) {
    friendReqs.value = friendReqs.value.filter(r => r.id !== fr.id)
  }
}

const signedIn = computed(() => !!currentUser.value)

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

    // Prefer profile avatar_url; fallback to auth metadata
    let raw = data?.avatar_url
      || currentUser.value?.user_metadata?.avatar_url
      || currentUser.value?.user_metadata?.picture
      || ''

    if (raw && !/^https?:\/\//i.test(raw)) {
      // If it's a storage path, ensure it's relative to the 'avatars' bucket
      const path = String(raw).replace(/^avatars\//, '')
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      raw = pub?.publicUrl || ''
    }

    avatarSrc.value = raw || DEFAULT_AVATAR
  } catch (e) {
    avatarSrc.value = DEFAULT_AVATAR
  }
}

const route = useRoute()
function isActiveCourse(code) {
  return route.name === 'course' && String(route.params.code || '') === String(code)
}

watch(() => route.fullPath, () => { closeMenus() })

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

// React when auth is ready and user changes
watch(
  () => ({ ready: authReady.value, uid: currentUser.value?.id }),
  async ({ ready, uid }) => {
    // Clean any previous channels if logging out or not ready
    if (!ready || !uid) {
      courses.value = []
      courseTitles.value = {}
      avatarSrc.value = DEFAULT_AVATAR
      applications.value = []
      friendReqs.value = []
      notifOpen.value = false
      if (notifChannel) { supabase.removeChannel(notifChannel); notifChannel = null }
      if (friendReqChannel) { supabase.removeChannel(friendReqChannel); friendReqChannel = null }
      return
    }

    // We have a user; load everything and (re)subscribe
    const u = { id: uid }
    await loadCoursesFor(u)
    await loadAvatar(u)
    await loadApplications(u)
    subscribeApplications(u)
    await loadFriendRequests(u)
    subscribeFriendRequests(u)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (notifChannel) { supabase.removeChannel(notifChannel); notifChannel = null }
  if (friendReqChannel) { supabase.removeChannel(friendReqChannel); friendReqChannel = null }
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

.icon-mini {
  width: 28px; height: 28px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.06);
  color: #fff;
}
.icon-mini:hover { background: rgba(255,255,255,0.10); }
.icon-mini.accept { border-color: rgba(80,200,120,0.45); background: rgba(80,200,120,0.15); }
.icon-mini.decline { border-color: rgba(227,93,106,0.45); background: rgba(227,93,106,0.15); }

</style>
