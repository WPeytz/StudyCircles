<template>
  <div class="container">
    <div class="card" style="display:grid; gap:12px;">
      <div v-if="!user" class="auth-shell">
        <h1>Welcome to StudyCircles👋</h1>
        <p class="small">Create an account or log in to see your personalized course feed.</p>
        <div class="card auth-card">
          <input v-model="email" class="input" placeholder="Email" type="email" />
          <input v-model="password" class="input" placeholder="Password" type="password" />
          <div style="display:flex; gap:8px;">
            <button class="button" @click="doSignUp" :disabled="authBusy">Sign up</button>
            <button class="button" @click="doSignIn" :disabled="authBusy">Log in</button>
          </div>
          <div class="small" style="opacity:.85">
            <a href="#" @click.prevent="doReset">Forgot your password?</a>
          </div>
          <div v-if="authErr" class="small">{{ authErr }}</div>
        </div>
        <div class="small">
          Already have an account? Enter your email &amp; password and press <strong>Log in</strong>.
        </div>
      </div>
      <div v-else>
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center;">
          <h1 style="margin:0; text-align:center;">StudyCircles feed</h1>
          <div class="feed-filter" style="display:flex; gap:8px; margin:4px 0 8px; justify-content:center;">
            <button class="badge" :class="{active: scope==='all'}" @click="scope='all'">All</button>
            <button class="badge" :class="{active: scope==='files'}" @click="scope='files'">Files</button>
            <button class="badge" :class="{active: scope==='questions'}" @click="scope='questions'">Posts</button>
            <button class="badge" :class="{active: scope==='groups'}" @click="scope='groups'">Groups</button>
          </div>
        </div>
        <p class="small" v-if="!courses.length">Add some courses to your profile to populate your feed.</p>

        <div v-if="loading" class="small">Loading feed…</div>
        <div v-else-if="!feed.length" class="small">No activity yet.</div>

        <div v-else class="card feed-grid">
          <div v-for="item in filteredFeed" :key="item.kind + ':' + item.id" class="card feed-item" :class="courseClass(item.course)">
            <div style="display:grid; gap:4px;">
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <span class="badge" :class="item.kind">{{ label(item.kind) }}</span>
                <RouterLink class="badge" :class="'course-'+item.course" :to="{ path: '/course/'+item.course }">{{ item.course }}</RouterLink>
                <span v-if="courseTitles[item.course]" class="course-title">— {{ courseTitles[item.course] }}</span>
              </div>
              <div style="font-weight:600;">
                <RouterLink v-if="item.kind!=='files'" :to="item.action.to">{{ item.title }}</RouterLink>
                <a v-else :href="item.action.href" target="_blank" rel="noopener">{{ item.title }}</a>
              </div>
              <div class="small" style="opacity:0.8;">{{ pretty(item.created_at) }} — {{ item.by || 'Anonymous' }}</div>
            </div>
            <div class="feed-actions">
              <div class="left-actions">
                <a v-if="item.kind==='files' && item.action.href" :href="item.action.href" class="button" target="_blank" rel="noopener">Open</a>
                <RouterLink v-else-if="item.kind==='files'" :to="{ path: '/course/'+item.course, query: { tab: 'files' } }" class="button">Open</RouterLink>
                <button v-else-if="item.kind==='groups'" class="button" @click="openApply(item)">Apply</button>
                <RouterLink v-else-if="item.kind!=='questions'" :to="{ path: '/course/'+item.course }" class="button">Open</RouterLink>
              </div>
              <div class="right-actions">
                <button
                  v-if="item.kind==='questions'"
                  class="button subtle"
                  :class="{ active: voted[item.id] }"
                  :disabled="voteBusy[item.id] || voted[item.id] || !user"
                  @click="doUpvote(item)"
                >
                  ▲ {{ item.upvotes || 0 }}
                </button>
                <button v-if="item.kind==='questions'" class="button subtle icon-btn" @click="toggleReplies(item)">
                  <span class="icon">💬</span><span class="count">{{ replyCounts[item.id] ?? 0 }}</span>
                </button>
              </div>
            </div>
            <div v-if="voteErr" class="small" style="color:#f79; opacity:.9; margin-top:4px;">
              {{ voteErr }}
            </div>
            <div v-if="item.kind==='questions' && expanded[item.id]" class="replies">
              <div v-if="!replies[item.id]" class="small muted">Loading replies…</div>
              <div v-else>
                <div v-if="(replies[item.id]||[]).length === 0" class="small muted">No replies yet.</div>
                <div v-else class="reply-list">
                  <div v-for="r in replies[item.id]" :key="r.id" class="reply">
                    <div class="small" style="opacity:.85">{{ new Date(r.created_at).toLocaleString() }} — {{ r.display_name || 'Anonymous' }}</div>
                    <div>{{ r.body }}</div>
                  </div>
                </div>
                <div class="reply-composer">
                  <textarea class="input" rows="3" v-model="replyDrafts[item.id]" placeholder="Write a reply…"></textarea>
                  <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="button" @click="sendReply(item)" :disabled="!(replyDrafts[item.id]||'').trim()">Send</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showApply" class="modal-backdrop" @click.self="closeApply">
          <div class="modal">
            <h3 style="margin:0 0 8px;">Apply to study group</h3>
            <div class="small" style="opacity:0.8; margin-bottom:10px;">
              Course <strong>#{{ applying?.course }}</strong>
              <span v-if="applying?.title"> · {{ applying.title }}</span>
            </div>

            <label class="small" for="apply-message">Your message</label>
            <textarea id="apply-message" v-model="applyMessage" class="input" rows="4" placeholder="Say hi, share availability, goals, and why you’d be a good fit…"></textarea>

            <div class="small" v-if="applyErr" style="color:#f18; margin-top:6px;">{{ applyErr }}</div>
            <div class="small" v-if="applySuccess" style="color:#7fda89; margin-top:6px;">Application sent!</div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
              <button class="button" @click="closeApply" :disabled="applyBusy">Cancel</button>
              <button class="button" @click="submitApplication" :disabled="applyBusy || !applyMessage.trim()">
                {{ applyBusy ? 'Sending…' : 'Send application' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '../services/supabase'

const router = useRouter()

const user = ref(null)
const courses = ref([])          // array of course codes from profile
const loading = ref(false)
const feed = ref([])
const scope = ref('all')
const courseTitles = ref({})

// Auth state
const email = ref('')
const password = ref('')
const authErr = ref('')
const authBusy = ref(false)

const showApply = ref(false)
const applying = ref(null) // the feed item for the group
const applyMessage = ref('')
const applyBusy = ref(false)
const applyErr = ref('')
const applySuccess = ref(false)

// Replies / upvotes state
const expanded = ref({})         // { [questionId]: true }
const replies = ref({})          // { [questionId]: Array }
const replyDrafts = ref({})      // { [questionId]: string }
const replyCounts = ref({}) // { [questionId]: number }
const voted = ref({})       // { [questionId]: true } – prevents double taps
const voteBusy = ref({})    // { [questionId]: true }
const voteErr = ref('')     // last error message

let authSub;

function openApply(item) {
  applying.value = item
  applyMessage.value = ''
  applyErr.value = ''
  applySuccess.value = false
  showApply.value = true
}
function closeApply() {
  showApply.value = false
}

async function submitApplication() {
  if (!user.value || !applying.value) return
  applyErr.value = ''
  applySuccess.value = false
  applyBusy.value = true
  try {
    // group_applications: id, group_id, course, applicant_id, message, created_at, status, notify_user_id
    const payload = {
      group_id: applying.value.id,
      course: applying.value.course,
      applicant_id: user.value.id,
      message: applyMessage.value.trim(),
      status: 'pending',
      notify_user_id: applying.value.by || null
    }
    const { error } = await supabase.from('group_applications').insert(payload)
    if (error) throw error
    applySuccess.value = true
    // Optional: auto-close after a short delay
    setTimeout(() => { showApply.value = false }, 900)
  } catch (e) {
    applyErr.value = e.message || 'Could not send application.'
  } finally {
    applyBusy.value = false
  }
}

function themeIndexFor(course) {
  if (!course) return 0
  const i = courses.value ? courses.value.indexOf(course) : -1
  if (i >= 0) return i % 6
  // fallback hash if course not in profile list
  let h = 0
  for (let c of String(course)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 6
}
function courseClass(course) {
  return 'course-theme-' + themeIndexFor(course)
}

onMounted(async () => {
  // Keep Home in sync with auth changes (logout elsewhere, token expiry, etc.)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user || null
    user.value = u
    if (u) {
      // Re-load profile + feed when logging in
      loadProfileAndFeed()
    } else {
      // Immediately clear UI when logged out
      loading.value = false
      feed.value = []
      courses.value = []
    }
  })
  authSub = subscription

  // Initial load on page open
  await bootstrap()
})

onBeforeUnmount(() => {
  authSub?.unsubscribe?.()
})

async function bootstrap() {
  const { data: { user: u } } = await supabase.auth.getUser()
  user.value = u
  if (u) {
    await loadProfileAndFeed()
  }
}

async function loadProfileAndFeed() {
  // load profile courses
  const { data: profile } = await supabase.from('profiles')
    .select('courses')
    .eq('id', user.value.id)
    .maybeSingle()
  courses.value = Array.isArray(profile?.courses) ? profile.courses : []
  await loadCourseTitles()
  await loadFeed()
}

async function loadCourseTitles() {
  courseTitles.value = {}
  if (!courses.value?.length) return
  const { data, error } = await supabase
    .from('courses')
    .select('code, title')
    .in('code', courses.value)
  if (!error && Array.isArray(data)) {
    const map = {}
    for (const r of data) {
      if (r?.code) map[r.code] = r.title || r.name || ''
    }
    courseTitles.value = map
  }
}

async function loadFeed() {
  feed.value = []
  if (!courses.value.length) return
  loading.value = true

  // QUESTIONS
  const { data: qs, error: qErr } = await supabase
    .from('questions')
    .select('id, body, display_name, course, created_at, upvotes')
    .in('course', courses.value)
    .order('created_at', { ascending: false })
    .limit(200)

  if (qErr) console.warn('[feed] questions error', qErr)

  // Preload reply counts for questions (fetch IDs and count in JS for broad compatibility)
  let countMap = {}
  const qIds = (qs || []).map(q => q.id).filter(Boolean)
  if (qIds.length) {
    const { data: ans, error: aErr } = await supabase
      .from('answers')
      .select('question_id')
      .in('question_id', qIds)
    if (!aErr && Array.isArray(ans)) {
      for (const row of ans) {
        if (!row?.question_id) continue
        countMap[row.question_id] = (countMap[row.question_id] || 0) + 1
      }
    }
  }
  replyCounts.value = countMap

  // FILES / RESOURCES (be flexible with columns)
  const { data: rs, error: rErr } = await supabase
    .from('resources')
    .select('*')
    .in('course', courses.value)
    .order('created_at', { ascending: false })
    .limit(200)

  if (rErr) console.warn('[feed] resources error', rErr)

  // STUDY GROUPS (be flexible with columns)
  const { data: gs, error: gErr } = await supabase
    .from('study_groups')
    .select('*')
    .in('course', courses.value)
    .order('created_at', { ascending: false })
    .limit(200)

  if (gErr) console.warn('[feed] study_groups error', gErr)

  // Catch-all warning for single-object coercion errors
  if (qErr?.message?.includes('coerce the result to a single JSON object') ||
      rErr?.message?.includes('coerce the result to a single JSON object') ||
      gErr?.message?.includes('coerce the result to a single JSON object')) {
    console.warn('[feed] note: single-object coercion error detected', { qErr, rErr, gErr })
  }

  const qItems = (qs || []).map(q => ({
    kind: 'questions',
    id: q.id,
    title: q.body?.slice(0, 140) || '(no text)',
    by: q.display_name,
    course: q.course,
    created_at: q.created_at,
    upvotes: q.upvotes || 0,
    action: { to: { path: '/course/'+q.course, query: { scroll: 'feed', focus: `question:${q.id}` } } }
  }))

  const rItems = (rs || []).map(r => {
    const title = r.title || r.name || r.filename || r.file_name || '(file)'
    const url = r.public_url || r.url || r.file_url || r.download_url || null
    const created = r.created_at || r.inserted_at || r.uploaded_at || r.createdat
    const by = r.uploader || r.uploaded_by || r.display_name || r.owner
    return {
      kind: 'files',
      id: r.id,
      title,
      by,
      course: r.course,
      created_at: created,
      action: url ? { href: url } : { to: { path: '/course/'+r.course, query: { tab: 'files' } } }
    }
  })

  const gItems = (gs || []).map(g => {
    const title = g.name || g.title || '(study group)'
    const link = g.link || g.url || g.invite_url || null
    const created = g.created_at || g.inserted_at || g.createdat
    const by = g.created_by || g.owner || g.host || g.display_name
    return {
      kind: 'groups',
      id: g.id,
      title,
      by,
      course: g.course,
      created_at: created,
      action: link ? { href: link } : { to: { path: '/course/'+g.course, query: { tab: 'groups' } } }
    }
  })

  feed.value = [...qItems, ...rItems, ...gItems]
    .filter(it => it.course) // keep only items with a course code
    .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 200)

  // Helpful visibility while debugging
  if (rErr || gErr) {
    console.warn('[feed] summary', { courses: courses.value, q: qItems.length, r: rItems.length, g: gItems.length })
  }

  loading.value = false
}

const filteredFeed = computed(() => {
  if (scope.value === 'all') return feed.value
  return feed.value.filter(f => f.kind === scope.value)
})

function label(kind) {
  if (kind === 'files') return 'file'
  if (kind === 'groups') return 'group'
  return 'question'
}

function pretty(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

async function doUpvote(item) {
  try {
    if (item.kind !== 'questions') return
    if (!user.value) { authErr.value = 'Please log in to upvote.'; return }
    if (voted.value[item.id] || voteBusy.value[item.id]) return

    // optimistic UI
    voteErr.value = ''
    voteBusy.value = { ...voteBusy.value, [item.id]: true }
    const prev = item.upvotes || 0
    item.upvotes = prev + 1

    const { data, error } = await supabase
      .from('questions')
      .update({ upvotes: prev + 1 })
      .eq('id', item.id)
      .select('upvotes')
      .maybeSingle()

    if (error) throw error

    // success → lock this question to 1 vote locally
    voted.value = { ...voted.value, [item.id]: true }
    item.upvotes = data?.upvotes ?? (prev + 1)
  } catch (e) {
    // revert optimistic change
    if (typeof item.upvotes === 'number') item.upvotes = Math.max(0, (item.upvotes || 1) - 1)
    voteErr.value = e?.message || 'Could not upvote. Your permissions may not allow updating this post.'
    console.warn('upvote failed', e)
  } finally {
    voteBusy.value = { ...voteBusy.value, [item.id]: false }
  }
}

async function toggleReplies(item) {
  if (item.kind !== 'questions') return
  expanded.value[item.id] = !expanded.value[item.id]

  // If opening for the first time, load replies
  if (expanded.value[item.id] && !replies.value[item.id]) {
    try {
      const { data, error } = await supabase
        .from('answers')
        .select('id, body, display_name, created_at')
        .eq('question_id', item.id)
        .order('created_at', { ascending: true })

      if (!error) replies.value[item.id] = data || []
      if (replyCounts.value[item.id] == null) {
        replyCounts.value = { ...replyCounts.value, [item.id]: (data || []).length }
      }
    } catch (e) {
      console.warn('load replies failed', e)
    }
  }

  // Always ensure reply box is ready when expanded
  if (expanded.value[item.id] && !replyDrafts.value[item.id]) {
    replyDrafts.value[item.id] = ''
  }
}


async function sendReply(item) {
  if (item.kind !== 'questions') return
  const text = (replyDrafts.value[item.id] || '').trim()
  if (!text || !user.value) return
  try {
    const payload = { question_id: item.id, body: text, display_name: user.value.email || 'Me' }
    const { data, error } = await supabase
      .from('answers')
      .insert(payload)
      .select('id, body, display_name, created_at')
      .maybeSingle()
    if (!error) {
      replyCounts.value = { ...replyCounts.value, [item.id]: (replyCounts.value[item.id] || 0) + 1 }
      replyDrafts.value[item.id] = ''
    }
  } catch (e) { console.warn('send reply failed', e) }
}

// Auth handlers
async function doSignUp() {
  authErr.value = ''
  authBusy.value = true
  const { error } = await supabase.auth.signUp({ email: email.value, password: password.value })
  authBusy.value = false
  if (error) { authErr.value = error.message; return }
  await bootstrap()
  try { router.replace('/settings') } catch {}
}

async function doSignIn() {
  authErr.value = ''
  authBusy.value = true
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  authBusy.value = false
  if (error) { authErr.value = error.message; return }
  await bootstrap()
}

async function doReset() {
  authErr.value = ''
  if (!email.value) { authErr.value = 'Enter your email first.'; return }
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: window.location.origin + '/profile'
  })
  if (error) authErr.value = error.message
}

async function doSignOut() {
  await supabase.auth.signOut()
  user.value = null
  feed.value = []
  courses.value = []
}
</script>

<style scoped>
.badge.active { background: rgba(255,255,255,0.15); }
.badge.questions { background: rgba(0,120,255,0.2); }
.badge.files { background: rgba(0,200,140,0.2); }
.badge.groups { background: rgba(255,160,0,0.2); }

/* Six accessible course themes (dark-friendly, readable) */
.feed-item { padding: 12px; border-radius: 10px; border: 1px solid transparent; }
.feed-item a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

/* Updated course themes for better contrast */
.course-theme-0 { background: #223053; border-color: #314471; color: #edf2ff; }
.course-theme-1 { background: #2d4228; border-color: #3e5c38; color: #eefdea; }
.course-theme-2 { background: #412b41; border-color: #5a3b5a; color: #fff2fd; }
.course-theme-3 { background: #2b3446; border-color: #3b4a61; color: #eef4ff; }
.course-theme-4 { background: #433229; border-color: #5b453a; color: #fff2ec; }
.course-theme-5 { background: #274343; border-color: #3a5f5f; color: #ecfeff; }

/* Ensure nested meta/badges remain legible on themed cards */
.feed-item .small { opacity: 0.9; }
.feed-item .badge { background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.28); color: inherit; }
.feed-item .button { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: inherit; }
.feed-item .button:hover { background: rgba(255,255,255,0.18); }

.feed-item, .feed-item * { text-shadow: none; }

/* Center the auth box vertically & horizontally when logged out */
.auth-shell {
  min-height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  text-align: center;
  padding-top: 64px;
}
.auth-shell > .auth-card {
  margin-inline: auto; /* ensure the form card is centered */
  max-width: 800px;
}

.auth-card {
  position: relative;
  display: grid;
  gap: 8px;
  width: clamp(360px, 44vw, 620px);
  padding: 18px;
}
.auth-card::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(84vmin, 760px);
  height: min(84vmin, 760px);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background:
    radial-gradient(closest-side, rgba(255,255,255,0.08), rgba(255,255,255,0.025) 70%, transparent),
    radial-gradient(70% 70% at 50% 30%, rgba(120,160,255,0.08), transparent 60%);
  border: 1px solid rgba(255,255,255,0.07);
  z-index: 0;
  pointer-events: none;
}
.auth-card > * { position: relative; z-index: 1; }

.input:focus,
.button:focus {
  outline: 2px solid rgba(140,180,255,0.8);
  outline-offset: 2px;
  box-shadow: 0 0 0 2px rgba(140,180,255,0.25) inset;
}
/* Add breathing room above the action buttons row */
.auth-card > div[style*="display:flex"] {
  margin-top: 6px;
}
@media (max-width: 520px) {
  .auth-card { width: 92vw; }
  .auth-card::before { width: 92vmin; height: 92vmin; }
}

.auth-shell h1 {
  margin: 0;
}



/* Feed filters: clearer active state and hover */
.feed-filter .badge {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  transition: background .15s ease, border-color .15s ease, transform .1s ease;
}
.feed-filter .badge:hover { background: rgba(255,255,255,0.14); }
.feed-filter .badge.active {
  background: rgba(120,160,255,0.22);
  border-color: rgba(140,180,255,0.55);
}

/* Feed grid spacing */
.feed-grid {
  display: grid;
  gap: 14px;
}

/* Card depth & hover polish */
.feed-item {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 8px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03);
  transition: transform .08s ease, box-shadow .18s ease, border-color .15s ease, background .15s ease;
}
.feed-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.12);
}

/* Feed card button enhancements */
.feed-item .button {
  padding-inline: 14px;
  height: 34px;
  border-radius: 9px;
}
.feed-item .button:focus-visible {
  outline: 2px solid rgba(140,180,255,0.8);
  outline-offset: 2px;
}

/* Metadata subtlety and title legibility */
.feed-item .course-title { opacity: .92; filter: saturate(110%); }
.feed-item .small { opacity: .85; }
.feed-item a { text-decoration-thickness: 1.25px; }

.feed-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}
.feed-actions .left-actions { display:flex; gap:8px; }
.feed-actions .right-actions { margin-left:auto; display:flex; gap:8px; }
.button.subtle { background: rgba(255,255,255,0.10); }
.button.subtle.active {
  background: rgba(140,180,255,0.20);
  border-color: rgba(140,180,255,0.55);
}

.replies { margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.18); display:grid; gap:8px; }
.reply-list { display:grid; gap:8px; }
.reply { padding: 8px; border-radius: 8px; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.10); }
.reply-composer { display:grid; gap:8px; }
.muted { opacity:.75; }

  /* Icon button spacing and alignment */
  .button.icon-btn { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
  .button.icon-btn .icon { line-height: 1; display: inline-block; }
</style>

