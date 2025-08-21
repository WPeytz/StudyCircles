<template>
  <div class="container profile-page">
    <!-- Header -->
    <div class="card header">
      <div :class="['avatar', {clickable: isSelf}]" @click="isSelf && avatarFileEl && avatarFileEl.click()">
        <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
        <span v-else>{{ (username || (user && user.email) || 'U').substring(0,1).toUpperCase() }}</span>
      </div>
      <input ref="avatarFileEl" type="file" accept="image/*" @change="onPickAvatar" style="display:none" />
      <div class="title-area">
        {{ username }}
      </div>
    </div>
      <p v-if="uploadingAvatar" class="small muted" style="margin-left:auto;">Uploading photo…</p>
      <p v-if="avatarErr" class="small" style="margin-left:auto;color:#ff9a9a;">{{ avatarErr }}</p>

    <!-- Public profile content -->
    <div class="grid main-grid">

      <!-- Snapshot -->
      <div class="card snapshot">
        <h2>Your Snapshot</h2>
        <div class="row">
          <div class="label">University</div>
          <div class="value">{{ profileUni || uni || '—' }}</div>
        </div>
        <div class="row">
          <div class="label">Study line</div>
          <div class="value">{{ profileStudyLine || studyLine || '—' }}</div>
        </div>
        <div class="row">
          <div class="label">Courses</div>
          <div class="value">
            <template v-if="courses && courses.length">
              <div
                v-for="c in courses"
                :key="c"
                class="badge course-row"
              >
                {{ c }}<span v-if="courseTitles[c]"> — {{ courseTitles[c] }}</span>
              </div>
            </template>
            <span v-else class="muted">No courses saved yet.</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
<script setup>
import { ref, watch, onMounted, reactive, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
const route = useRoute()
const viewingId = ref('')
const isSelf = computed(() => viewingId.value && user.value && viewingId.value === user.value.id)
async function hydrateById(id) {
  if (!id) return
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, points, university, courses, username, study_line, avatar_url')
    .eq('id', id)
    .maybeSingle()

  if (!profile) return
  points.value = profile.points || 0
  profileUni.value = profile.university || ''
  profileStudyLine.value = profile.study_line || ''
  studyLine.value = profile.study_line || ''
  username.value = profile.username || ''
  courses.value = Array.isArray(profile.courses) ? profile.courses : []

  if (profile.avatar_url) {
    if (/^https?:\/\//i.test(profile.avatar_url)) {
      avatarUrl.value = profile.avatar_url
    } else {
      const key = String(profile.avatar_url).replace(/^avatars\//, '')
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(key)
      avatarUrl.value = pub?.publicUrl || ''
    }
  } else {
    avatarUrl.value = ''
  }

  await ensureAllCourseTitles()
}
import { supabase, currentUser, getSession } from '../services/supabase'

const username = ref('')
const name = username // backward-compat alias if referenced elsewhere
const uni = ref('')
const points = ref(0)
const user = currentUser
const email = ref('')
const password = ref('')

const profileUni = ref('')
const profileStudyLine = ref('')
const studyLine = ref('')
const courses = ref([])
const courseTitles = reactive({})
const notice = ref('')
const isSaving = ref(false)

const friendQuery = ref('')
const friends = ref([])
const friendNotice = ref('')
const isAddingFriend = ref(false)
const incomingRequests = ref([])
const outgoingRequests = ref([])
const requestNotice = ref('')
const isProcessingRequest = ref(false)
const router = useRouter()
const isAuthing = ref(false)

const avatarUrl = ref('')
const uploadingAvatar = ref(false)
const avatarErr = ref('')
const avatarFileEl = ref(null)

async function onPickAvatar(e) {
  const file = e?.target?.files?.[0]
  if (!file || !supabase || !user.value) return
  uploadingAvatar.value = true
  avatarErr.value = ''
  try {
    // Store under avatars bucket with user folder, keep only the key in DB
    const key = `${user.value.id}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(key, file, { upsert: true })
    if (upErr) { avatarErr.value = upErr.message; return }

    // Save the storage key in profiles.avatar_url
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: key })
      .eq('id', user.value.id)
    if (updErr) { avatarErr.value = updErr.message; return }

    // Resolve public URL for display
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(key)
    avatarUrl.value = pub?.publicUrl || ''
  } catch (err) {
    avatarErr.value = String(err?.message || err)
  } finally {
    uploadingAvatar.value = false
    if (avatarFileEl?.value) avatarFileEl.value.value = ''
  }
}

async function hydrateFromUser(u) {
  if (!u) return
  username.value = u.user_metadata?.full_name || u.email
  uni.value = u.user_metadata?.university || ''
  const { data: profile } = await supabase
    .from('profiles')
    .select('points, university, courses, username, study_line, avatar_url')
    .eq('id', u.id)
    .maybeSingle()
  points.value = profile?.points || 0
  profileUni.value = profile?.university || ''
  profileStudyLine.value = profile?.study_line || ''
  studyLine.value = profile?.study_line || ''
  username.value = profile?.username || u.user_metadata?.full_name || u.email
  courses.value = Array.isArray(profile?.courses) ? profile.courses : []
  // avatar_url holds a storage key or full URL; resolve if it's a key
  if (profile?.avatar_url) {
    if (/^https?:\/\//i.test(profile.avatar_url)) {
      avatarUrl.value = profile.avatar_url
    } else {
      const key = String(profile.avatar_url).replace(/^avatars\//, '')
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(key)
      avatarUrl.value = pub?.publicUrl || ''
    }
  } else {
    avatarUrl.value = ''
  }
  await ensureAllCourseTitles()
  await fetchFriends()
  await fetchRequests()
}

onMounted(async () => {
  if (!supabase) return
  const session = await getSession()
  if (session?.user) {
    user.value = session.user
  }
  const routeId = String(route.query.user || route.query.u || '').trim()
  viewingId.value = routeId || (user.value && user.value.id) || ''
  if (viewingId.value) {
    if (isSelf.value) await hydrateFromUser(user.value)
    else await hydrateById(viewingId.value)
  }
})

watch(currentUser, async (u) => {
  if (!supabase) return
  // If self, hydrate; otherwise, hydrateById
  if (isSelf.value) {
    await hydrateFromUser(u)
  } else if (viewingId.value) {
    await hydrateById(viewingId.value)
  }
})

watch(() => route.query.user || route.query.u, async (nv) => {
  const routeId = String(nv || '').trim()
  viewingId.value = routeId || (user.value && user.value.id) || ''
  if (viewingId.value) {
    if (isSelf.value) await hydrateFromUser(user.value)
    else await hydrateById(viewingId.value)
  }
})

async function saveBasics() {
  if (!supabase || !user.value) {
    notice.value = 'Not signed in.'
    return
  }
  isSaving.value = true
  try {
    notice.value = 'Saving…'

    const payload = {
      id: user.value.id,
      username: (username.value || '').trim() || null,
      university: (uni.value || '').trim() || null,
      study_line: (studyLine.value || '').trim() || null,
      updated_at: new Date().toISOString(),
    }

    // Add a 10s timeout guard so UI never stalls if a network call hangs
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    // 1) UPSERT and request a return row (maybe none if newly inserted)
    const up = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .abortSignal(controller.signal)
      .select('id, username, university, courses, points, study_line')
      .maybeSingle()

    clearTimeout(timeout)

    if (up.error) {
      console.error('[profiles.upsert] error:', up.error)
      notice.value = `Could not save: ${up.error.message}`
      return
    }

    let data = up.data

    // 2) If upsert didn't return data (e.g., due to RLS), fetch fresh row
    if (!data) {
      const sel = await supabase
        .from('profiles')
        .select('id, username, university, courses, points, study_line')
        .eq('id', user.value.id)
        .single()

      if (sel.error) {
        console.error('[profiles.select] error:', sel.error)
        notice.value = 'Saved (could not refresh view).'
        setTimeout(() => (notice.value = ''), 1500)
        return
      }
      data = sel.data
    }

    console.debug('[profiles] saved data:', data)

    username.value = data?.username || username.value
    profileUni.value = data?.university || ''
    profileStudyLine.value = data?.study_line || ''
    points.value = data?.points ?? points.value
    courses.value = Array.isArray(data?.courses) ? data.courses : courses.value

    notice.value = 'Saved!'
    setTimeout(() => (notice.value = ''), 1500)
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.error('[profiles] request timed out')
      notice.value = 'Network is slow. Please try again.'
    } else {
      console.error('SaveBasics unexpected error:', e)
      notice.value = 'Unexpected error while saving.'
    }
  } finally {
    isSaving.value = false
  }
}

async function signUp() {
  if (!supabase) return
  isAuthing.value = true
  try {
    const { error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: { data: { full_name: name.value, university: uni.value } }
    })
    if (error) { console.error('Sign-up error:', error); return }
    const session = await getSession()
    if (session?.user) {
      user.value = session.user
      await hydrateFromUser(session.user)
      if (router.currentRoute.value.path !== '/profile') {
        router.replace('/profile')
      }
    }
  } finally {
    isAuthing.value = false
  }
}

async function signIn() {
  if (!supabase) return
  isAuthing.value = true
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })
    if (error) { console.error('Sign-in error:', error); return }
    const session = await getSession()
    if (session?.user) {
      user.value = session.user
      await hydrateFromUser(session.user)
      if (router.currentRoute.value.path !== '/profile') {
        router.replace('/profile')
      }
    }
  } finally {
    isAuthing.value = false
  }
}

async function logout() {
  if (!supabase) return
  await supabase.auth.signOut()
  user.value = null
}

async function fetchFriends() {
  if (!supabase || !user.value) return
  // Get all rows where I am the requester
  const { data, error } = await supabase
    .from('friends')
    .select(`friend_id, created_at,
             friend:friend_id (username, email)`)
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[friends.select] error:', error)
    return
  }

  friends.value = (data || []).map(r => ({
    friend_id: r.friend_id,
    friend_username: r.friend?.username || null,
    friend_email: r.friend?.email || null,
    created_at: r.created_at,
  }))
}

async function addFriend() {
  if (!supabase || !user.value) { friendNotice.value = 'Not signed in.'; return }
  const query = (friendQuery.value || '').trim()
  if (!query) return
  isAddingFriend.value = true
  friendNotice.value = ''
  try {
    // lookup by username first, then email view
    let target = null
    const byUsername = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', query)
      .maybeSingle()
    if (byUsername.data?.id) {
      target = { id: byUsername.data.id }
    } else {
      const { data: viaView } = await supabase
        .from('user_emails')
        .select('id, email')
        .ilike('email', query)
        .maybeSingle()
      if (viaView?.id) target = { id: viaView.id }
    }

    if (!target) { friendNotice.value = 'User not found.'; return }
    if (target.id === user.value.id) { friendNotice.value = "You can't add yourself."; return }

    // create or ignore duplicate pending request
    const { error: reqErr } = await supabase
      .from('friend_requests')
      .upsert({ sender_id: user.value.id, receiver_id: target.id, status: 'pending' }, { onConflict: 'sender_id,receiver_id' })

    if (reqErr) {
      friendNotice.value = `Could not request: ${reqErr.message}`
      return
    }

    friendNotice.value = 'Request sent!'
    friendQuery.value = ''
    await fetchRequests()
    setTimeout(() => (friendNotice.value = ''), 1500)
  } finally {
    isAddingFriend.value = false
  }
}

async function fetchRequests() {
  if (!supabase || !user.value) return
  // incoming
  const incoming = await supabase
    .from('friend_requests')
    .select(`id, sender_id, receiver_id, status, created_at, sender:sender_id(username, email)`) 
    .eq('receiver_id', user.value.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (!incoming.error) {
    incomingRequests.value = (incoming.data || []).map(r => ({
      id: r.id,
      sender_id: r.sender_id,
      receiver_id: r.receiver_id,
      sender_username: r.sender?.username || null,
      sender_email: r.sender?.email || null,
      created_at: r.created_at,
    }))
  }
  // outgoing
  const outgoing = await supabase
    .from('friend_requests')
    .select(`id, sender_id, receiver_id, status, created_at, receiver:receiver_id(username, email)`) 
    .eq('sender_id', user.value.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (!outgoing.error) {
    outgoingRequests.value = (outgoing.data || []).map(r => ({
      id: r.id,
      sender_id: r.sender_id,
      receiver_id: r.receiver_id,
      receiver_username: r.receiver?.username || null,
      receiver_email: r.receiver?.email || null,
      created_at: r.created_at,
    }))
  }
}

async function acceptRequest(r) {
  if (!supabase || !user.value) return
  isProcessingRequest.value = true
  try {
    // mark accepted
    const { error: upErr } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', r.id)
      .eq('receiver_id', user.value.id)
    if (upErr) { requestNotice.value = `Could not accept: ${upErr.message}`; return }
    // create mutual friendship rows
    await supabase.from('friends').upsert([
      { user_id: user.value.id, friend_id: r.sender_id },
      { user_id: r.sender_id, friend_id: user.value.id },
    ], { onConflict: 'user_id,friend_id' })
    await fetchFriends()
    await fetchRequests()
  } finally { isProcessingRequest.value = false }
}

async function declineRequest(r) {
  if (!supabase || !user.value) return
  isProcessingRequest.value = true
  try {
    await supabase
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', r.id)
      .eq('receiver_id', user.value.id)
    await fetchRequests()
  } finally { isProcessingRequest.value = false }
}

async function cancelRequest(r) {
  if (!supabase || !user.value) return
  isProcessingRequest.value = true
  try {
    await supabase
      .from('friend_requests')
      .delete()
      .eq('id', r.id)
      .eq('sender_id', user.value.id)
    await fetchRequests()
  } finally { isProcessingRequest.value = false }
}

async function removeFriend(friendId) {
  if (!supabase || !user.value) return
  const { error } = await supabase
    .from('friends')
    .delete()
    .or(`and(user_id.eq.${user.value.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.value.id})`)

  if (error) {
    console.error('[friends.delete] error:', error)
    friendNotice.value = 'Could not remove.'
  } else {
    friends.value = friends.value.filter(f => f.friend_id !== friendId)
  }
}


async function ensureCourseTitle(code) {
  try {
    if (!code || courseTitles[code] || !supabase) return
    const { data, error } = await supabase
      .from('courses')
      .select('title')
      .eq('code', code)
      .single()
    if (!error && data?.title) {
      courseTitles[code] = data.title
    }
  } catch (e) {
    // ignore tooltip failures silently
  }
}

async function ensureAllCourseTitles() {
  try {
    if (!supabase || !Array.isArray(courses.value) || courses.value.length === 0) return
    const missing = courses.value.filter(code => code && !courseTitles[code])
    if (!missing.length) return
    const { data, error } = await supabase
      .from('courses')
      .select('code, title')
      .in('code', missing)
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row?.code && row?.title) courseTitles[row.code] = row.title
      }
    }
  } catch (_) { /* silent */ }
}

/*
NOTE:
- Create a public storage bucket named "avatars" in Supabase Storage.
- Ensure profiles table has column: avatar_url text.
- (RLS) profiles already allows users to update their own row per existing policy.
*/
</script>
<style scoped>
.profile-page { max-width: 980px; }
.card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; }
.header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.avatar { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); overflow: hidden; }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatar.clickable { cursor: pointer; }
.avatar.clickable:hover { outline: 2px solid rgba(100,149,255,0.45); outline-offset: 2px; }
.title-area h1 { margin: 0 0 4px; }
.subtitle { margin: 0; opacity: 0.8; }
.login-row { margin-top: 6px; display: flex; gap: 8px; align-items: center; }
.muted { opacity: 0.75; }
.strong { font-weight: 600; }
.dot { opacity: 0.5; }

.grid { display: grid; gap: 14px; }
.auth-grid { grid-template-columns: 1.1fr 0.9fr; }
.main-grid { grid-template-columns: 1fr 1fr; }
@media (max-width: 860px) { .auth-grid, .main-grid { grid-template-columns: 1fr; } }

.form-card .field { display: grid; gap: 6px; margin-bottom: 10px; }
label { font-size: 0.9rem; opacity: 0.85; }
.input { width: 100%; padding: 10px 12px; border-radius: 10px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); }
.actions { display: flex; gap: 10px; align-items: center; }
.button { padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08); cursor: pointer; }
.button.primary { background: #6495ff; color: #0b1220; border-color: transparent; font-weight: 600; }
.button:disabled { opacity: 0.6; cursor: not-allowed; }
.notice { font-size: .9rem; opacity: .8; }

.snapshot .row { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; padding: 6px 0; }
.snapshot .label { opacity: .8; }
.badge { background: rgba(255,255,255,0.08); padding: 6px 10px; border-radius: 999px; margin-right: 6px; display: inline-flex; }


.course-row { display: block; margin: 4px 0; }

.contrib ul { margin: 6px 0 0; }

.friend-list { display: grid; gap: 8px; }
.friend-row { display: flex; gap: 10px; align-items: center; padding: 8px; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; }
.avatar.small { width: 32px; height: 32px; font-size: 0.9rem; }
.col { display: grid; }
.spacer { flex: 1; }

.form-card h2 { margin-top: 0; }
.form-card .actions { margin-top: 8px; }
.snapshot h2 { margin-top: 0; }
.header { margin-bottom: 18px; }
.main-grid { align-items: start; }
</style>