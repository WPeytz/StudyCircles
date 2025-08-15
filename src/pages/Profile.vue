<template>
  <div class="container profile-page">
    <!-- Header -->
    <div class="card header">
      <div class="avatar" v-if="user">{{ (username || user.email || 'U').substring(0,1).toUpperCase() }}</div>
      <div class="title-area">
        <h1>Profile</h1>
        <p class="subtitle">Choose a username and manage your account.</p>
        <div v-if="user" class="login-row">
          <span class="muted">Signed in as</span>
          <span class="strong">{{ username || user.email }}</span>
          <span class="dot">•</span>
          <a href="#" @click.prevent="logout">Logout</a>
        </div>
      </div>
    </div>

    <!-- Auth panel when logged out -->
    <div v-if="!user" class="grid auth-grid">
      <div class="card form-card">
        <h2>Create account</h2>
        <div class="field">
          <label>Email</label>
          <input class="input" v-model="email" type="email" placeholder="you@uni.dk" />
        </div>
        <div class="field">
          <label>Password</label>
          <input class="input" v-model="password" type="password" placeholder="••••••••" />
        </div>
        <div class="actions">
          <button class="button primary" @click="signUp">Sign Up</button>
          <button class="button" @click="signIn">Log In</button>
        </div>
      </div>
      <div class="card tips">
        <h2>Why create an account?</h2>
        <ul class="small">
          <li>Save your university and courses</li>
          <li>Upload resources and ask questions</li>
          <li>Earn points for helpful answers</li>
        </ul>
      </div>
    </div>

    <!-- Main content when logged in -->
    <div v-else class="grid main-grid">
      <!-- Basics -->
      <div class="card form-card">
        <div class="section-head">
          <h2>Basics</h2>
          <span class="muted">Stats: {{ points }} points</span>
        </div>
        <div class="field">
          <label>Username</label>
          <input class="input" placeholder="Choose a public name" v-model="username" />
        </div>
        <div class="field">
          <label>University</label>
          <input class="input" placeholder="e.g. DTU" v-model="uni" />
        </div>
        <div class="field">
          <label>Study line</label>
          <input class="input" placeholder="e.g. AI and Data" v-model="studyLine" />
        </div>
        <div class="actions">
          <button class="button primary" :disabled="isSaving" @click="saveBasics">
            {{ isSaving ? 'Saving…' : 'Save Basics' }}
          </button>
          <span v-if="notice" class="notice">{{ notice }}</span>
        </div>
      </div>

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
              <span v-for="c in courses" :key="c" class="badge">{{ c }}</span>
            </template>
            <span v-else class="muted">No courses saved yet.</span>
          </div>
        </div>
      </div>

      <!-- Contributions -->
      <div class="card contrib">
        <h2>Top Contributions</h2>
        <ul class="small">
          <li>02465 Exam 2023 (Exam)</li>
          <li>DP Notes</li>
        </ul>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { onMounted } from 'vue'
import { supabase } from '../services/supabase'

const username = ref('')
const name = username // backward-compat alias if referenced elsewhere
const uni = ref('')
const points = ref(0)
const user = ref(null)
const email = ref('')
const password = ref('')

const profileUni = ref('')
const profileStudyLine = ref('')
const studyLine = ref('')
const courses = ref([])
const notice = ref('')
const isSaving = ref(false)

onMounted(async () => {
  if (!supabase) return
  const { data: { user: u } } = await supabase.auth.getUser()
  if (u) {
    user.value = u
    username.value = u.user_metadata?.full_name || u.email
    uni.value = u.user_metadata?.university || ''
    // fetch profile details
    const { data: profile } = await supabase
      .from('profiles')
      .select('points, university, courses, username, study_line')
      .eq('id', u.id)
      .single()
    points.value = profile?.points || 0
    profileUni.value = profile?.university || ''
    profileStudyLine.value = profile?.study_line || ''
    studyLine.value = profile?.study_line || ''
    username.value = profile?.username || u.user_metadata?.full_name || u.email
    courses.value = Array.isArray(profile?.courses) ? profile.courses : []
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
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: { data: { full_name: name.value, university: uni.value } }
  })
  if (error) console.error('Sign-up error:', error)
}

async function signIn() {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })
  if (error) console.error('Sign-in error:', error)
}

async function logout() {
  if (!supabase) return
  await supabase.auth.signOut()
  user.value = null
}

if (supabase) {
  supabase.auth.onAuthStateChange(async (_event, session) => {
    const u = session?.user || null
    user.value = u
    if (u) {
      username.value = u.user_metadata?.full_name || u.email
      uni.value = u.user_metadata?.university || ''
      const { data: profile } = await supabase
        .from('profiles')
        .select('points, university, courses, username, study_line')
        .eq('id', u.id)
        .single()
      points.value = profile?.points || 0
      profileUni.value = profile?.university || ''
      profileStudyLine.value = profile?.study_line || ''
      studyLine.value = profile?.study_line || ''
      username.value = profile?.username || u.user_metadata?.full_name || u.email
      courses.value = Array.isArray(profile?.courses) ? profile.courses : []
    } else {
      username.value = ''
      uni.value = ''
      points.value = 0
      profileUni.value = ''
      profileStudyLine.value = ''
      studyLine.value = ''
      courses.value = []
    }
  })
}
</script>
<style scoped>
.profile-page { max-width: 980px; }
.card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; }
.header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.avatar { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); }
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

.contrib ul { margin: 6px 0 0; }
</style>