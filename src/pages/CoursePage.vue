<template>
  <div class="course-page">
    <header class="course-header">
      <h1>{{ code }} <span v-if="title">— {{ title }}</span></h1>
      <div class="subtle">Everything for this course: uploads, questions, and study groups.</div>
    </header>

    <div class="tabs">
      <button :class="{active: tab==='feed'}" @click="tab='feed'">Feed</button>
      <button :class="{active: tab==='files'}" @click="tab='files'">Files</button>
      <button :class="{active: tab==='groups'}" @click="tab='groups'">Study Groups</button>
      <button :class="{active: tab==='users'}" @click="tab='users'">Users</button>
    </div>

    <!-- USERS (inline list) -->
    <section v-if="tab==='users'" class="card">
      <h2>People in {{ code }}</h2>
      <div v-if="loadingUsers" class="muted">Loading…</div>
      <div v-else-if="!courseUsers.length" class="muted">No one has added this course yet.</div>
      <div v-else class="user-list">
        <div v-for="u in courseUsers" :key="u.id" class="user-row">
          <div class="left" @click="goProfile(u.id)">
            <div class="avatar large">
              <img v-if="avatarFor(u)" :src="avatarFor(u)" alt="" />
              <span v-else>{{ (u.username || 'U').slice(0,1).toUpperCase() }}</span>
            </div>
            <div class="col">
              <div class="strong">{{ u.username || 'Student' }}</div>
              <div class="small muted">{{ u.university || '—' }}<template v-if="u.study_line"> — {{ u.study_line }}</template></div>
            </div>
          </div>
          <button class="button pill message-wide" @click.stop="messageUser(u.id)">Message</button>
        </div>
      </div>
    </section>

    <!-- FEED -->
    <section v-if="tab==='feed'" class="card">
      <h2>Latest activity</h2>

      <!-- Composer -->
      <div class="composer">
        <div class="avatar large">
          <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" />
          <span v-else>{{ (displayName || 'U').slice(0,1).toUpperCase() }}</span>
        </div>
        <div class="composer-col">
          <textarea
            class="input composer-input"
            rows="2"
            v-model="postBody"
            :placeholder="`What\'s on your mind, ${displayName || 'student'}?`"
          />
          <div class="composer-actions">
            <div class="muted small" v-if="postErr">{{ postErr }}</div>
            <div class="spacer"></div>
            <button class="button primary" :disabled="posting || !postBody.trim()" @click="createPost">
              {{ posting ? 'Posting…' : 'Post' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="!filteredFeed.length" class="muted">No activity yet.</div>
      <div v-else class="feed-list" @click="closeAllMenus">
        <div v-for="item in filteredFeed" :key="item.kind + ':' + item.id">
          <div class="feed-row">
            <!-- overflow menu trigger -->
            <button class="more-btn" @click.stop="toggleItemMenu(item)" title="More">⋯</button>
            <!-- dropdown -->
            <div v-if="item._menuOpen" class="more-menu" @click.stop>
              <button v-if="isMyItem(item)" class="menu-item danger" @click="deleteItem(item)">Delete post</button>
              <button v-else class="menu-item" @click="reportItem(item)">Report post</button>
            </div>
            <span class="badge" :class="'k-' + item.kind">{{ item.kind }}</span>
            <div class="col clickable" @click="openItem(item)">
              <div class="strong">
                <template v-if="item.kind==='file'">
                  {{ item.title }}
                </template>
                <template v-else-if="item.kind==='question'">
                  {{ item.body }}
                </template>
                <template v-else>
                  {{ item.title }}
                </template>
              </div>
            </div>
            <div class="spacer"></div>
            <div class="actions">
              <button class="iconbtn vote" @click="toggleVote(item)" :title="(item._voted ? 'Remove upvote' : 'Upvote') + ' (▲ ' + (item.upvotes ?? 0) + ')'">
                <span class="tri">▲</span>
                <span class="count">{{ item.upvotes ?? 0 }}</span>
              </button>
              <template v-if="item.kind==='file'">
                <a class="iconbtn ghost" :href="item.public_url" target="_blank" rel="noopener" title="Open file">Open</a>
              </template>
              <template v-else-if="item.kind==='question'">
                <button class="iconbtn ghost" @click="toggleComment(item)" :title="item._showReplies ? 'Hide replies' : 'Show replies'">
                  <span class="icon">💬</span>
                  <span class="count">{{ item.answers?.length || 0 }}</span>
                </button>
              </template>
              <template v-else>
                <button class="iconbtn ghost" @click="tab='groups'" title="View group">View</button>
              </template>
            </div>
            <div class="meta meta-bottom small muted">
              {{ prettyDate(item.created_at) }}
              <template v-if="item.kind==='question' && item.display_name"> — {{ item.display_name }}</template>
              <template v-if="item.kind==='group' && (item.place || item.time)"> — {{ item.place || '—' }} {{ item.time ? ' · ' + item.time : '' }}</template>
            </div>
          </div>
          <div v-if="item.kind==='question' && item.answers?.length && item._showReplies" class="answers under">
            <div v-for="ans in item.answers" :key="ans.id" class="answer-row">
              <div class="avatar xsmall">{{ (ans.display_name || 'U').slice(0,1).toUpperCase() }}</div>
              <div class="col">
                <div>{{ ans.body }}</div>
                <div class="small muted">{{ prettyDate(ans.created_at) }} — {{ ans.display_name || 'Anonymous' }}</div>
              </div>
            </div>
          </div>
          <div v-if="item.kind==='question' && item._replying" class="reply under">
            <textarea class="input" rows="2" v-model="item._reply" placeholder="Write a reply..."></textarea>
            <button class="button primary" @click.stop="replyTo(item)">Send</button>
          </div>
        </div>
      </div>
      <div v-if="hasMore" style="margin-top:10px; display:flex; justify-content:center;">
        <button class="button" @click="loadMore" :disabled="loadingFeed">{{ loadingFeed ? 'Loading…' : 'Load more' }}</button>
      </div>
    </section>

    <!-- FILES -->
    <section v-if="tab==='files'" class="card">
      <h2>Upload a file</h2>
      <div class="grid">
        <input class="input readonly" :value="code" readonly />
        <input class="input" v-model="uploadTitle" placeholder="Title (e.g., 2024 Winter Exam)" />
        <select class="input" v-model="uploadType">
          <option>Notes</option>
          <option>Exam</option>
          <option>Assignment</option>
          <option>Misc</option>
        </select>
        <input type="file" class="input" @change="onPickFile"/>
      </div>
      <button class="button primary" :disabled="upLoading" @click="doUpload">
        {{ upLoading ? 'Uploading…' : 'Upload' }}
      </button>
      <div class="hint" v-if="upErr">{{ upErr }}</div>

      <h3 style="margin-top:18px;">Files for {{ code }}</h3>
      <div v-if="courseFiles.length===0" class="muted">No files yet. Be the first to upload!</div>
      <div v-else class="file-list">
        <div v-for="f in courseFiles" :key="f.id" class="file-row">
          <span class="badge">{{ f.type?.toLowerCase() || 'file' }}</span>
          <div class="col">
            <div class="strong">{{ f.title }}</div>
            <div class="small muted">{{ prettyDate(f.created_at) }}</div>
          </div>
          <div class="spacer"></div>
          <a class="button" :href="f.public_url" target="_blank" rel="noopener">View / Download</a>
        </div>
      </div>
    </section>


    <!-- STUDY GROUPS -->
    <section v-if="tab==='groups'" class="card">
      <h2>Study groups</h2>
      <div class="grid">
        <input class="input" v-model="groupTitle" placeholder="Group name (e.g., Project team A)" />
        <input class="input" v-model="groupWhere" placeholder="Where/Link (e.g., Library / Zoom)" />
        <input class="input" v-model="groupDescription" placeholder="Description of Study Group" />
      </div>
      <button class="button primary" :disabled="creatingGroup" @click="createGroup">
        {{ creatingGroup ? 'Creating…' : 'Create group' }}
      </button>
      <div class="hint" v-if="groupErr">{{ groupErr }}</div>

      <h3 style="margin-top:18px;">Groups for {{ code }}</h3>
      <div v-if="groups.length===0" class="muted">No groups yet.</div>
      <div v-else class="group-list">
        <div v-for="g in groups" :key="g.id" :id="'g-' + g.id" class="group-row">
          <div class="col">
            <div class="strong">{{ g.title }}</div>
            <div class="small muted">{{ g.place || '—' }} — {{ g.time || '—' }}</div>
          </div>
          <div class="spacer"></div>
          <button class="button" @click="joinGroup(g)">Join</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const route = useRoute()
const code = computed(() => String(route.params.code || ''))
const title = ref('')

// tabs
const tab = ref('feed')

// files
const uploadTitle = ref('')
const uploadType = ref('Notes')
const upFile = ref(null)
const upLoading = ref(false)
const upErr = ref('')
const courseFiles = ref([])

// questions
const questionBody = ref('')
const asking = ref(false)
const askErr = ref('')
const questions = ref([])

// groups
const groupTitle = ref('')
const groupWhere = ref('')
const groupDescription = ref('')
const creatingGroup = ref(false)
const groupErr = ref('')
const groups = ref([])

const feed = ref([])
const FEED_PAGE = 30
const feedLimit = ref(FEED_PAGE)
const hasMore = ref(false)
const loadingFeed = ref(false)
// post composer (uses questions table as generic posts)
const postBody = ref('')
const posting = ref(false)
const postErr = ref('')
const myProfile = ref(null)
const displayName = computed(() => {
  const u = currentUser.value
  return myProfile.value?.username || u?.user_metadata?.full_name || u?.email || ''
})

// Resolved public avatar URL (handles both direct URLs and storage paths)
const avatarSrc = ref('')
const avatarUrl = computed(() => avatarSrc.value)

async function loadMyProfile() {
  const uid = currentUser.value?.id
  if (!uid) { myProfile.value = null; avatarSrc.value = ''; return }
  const { data } = await supabase
    .from('profiles')
    .select('username, avatar_url, university, study_line, courses')
    .eq('id', uid)
    .maybeSingle()
  myProfile.value = data || null

  // Resolve avatar source
  const u = currentUser.value
  let raw = data?.avatar_url || u?.user_metadata?.avatar_url || u?.user_metadata?.picture || ''

  // If it's a Supabase Storage path (not an absolute URL), turn it into a public URL
  if (raw && !/^https?:\/\//i.test(raw)) {
    try {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(raw)
      raw = pub?.publicUrl || ''
    } catch (e) {
      // ignore
    }
  }
  avatarSrc.value = raw || ''
}
onMounted(loadMyProfile)
watch(currentUser, () => loadMyProfile())


import { useRouter } from 'vue-router'
const router = useRouter()

// --- Mentions (@username) helpers ---
function extractMentions(text) {
  if (!text) return []
  const matches = Array.from(text.matchAll(/@([A-Za-z0-9_]{2,32})/g)).map(m => m[1])
  // unique, case-insensitive compare but keep original case for lookup consistency
  const lowerSeen = new Set()
  const uniq = []
  for (const u of matches) {
    const k = u.toLowerCase()
    if (!lowerSeen.has(k)) { lowerSeen.add(k); uniq.push(u) }
  }
  return uniq
}

async function notifyMentions({ text, kind, postId }) {
  try {
    const usernames = extractMentions(text)
    if (!usernames.length) return

    // Load mentioned users' ids
    const { data: users, error: uerr } = await supabase
      .from('profiles')
      .select('id, username')
      .in('username', usernames)

    if (uerr || !Array.isArray(users) || users.length === 0) return

    const me = currentUser.value?.id || null
    const courseCode = code.value
    const now = new Date().toISOString()

    const mentionsRows = []
    const notifRows = []

    for (const u of users) {
      if (!u?.id || u.id === me) continue
      mentionsRows.push({ post_kind: kind, post_id: postId, mentioned_user_id: u.id, by_user_id: me, course: courseCode, created_at: now })
      notifRows.push({ user_id: u.id, type: 'mention', payload: { kind, post_id: postId, course: courseCode }, created_at: now })
    }

    if (mentionsRows.length) {
      await supabase.from('mentions').insert(mentionsRows)
    }
    if (notifRows.length) {
      await supabase.from('notifications').insert(notifRows)
    }
  } catch (e) {
    // Non-fatal: if tables/policies aren’t ready, just skip silently
    console.warn('[mentions] notifyMentions skipped:', e?.message || e)
  }
}

const courseUsers = ref([])
const loadingUsers = ref(false)

async function loadCourseUsers(){
  loadingUsers.value = true
  try {
    const target = String(code.value)
    const alt = String(parseInt(target, 10)) // non‑padded variant

    let data = []

    // 1) Try RPC (security definer) to bypass strict RLS while returning only safe columns
    try {
      const r = await supabase.rpc('get_course_members', { p_course: target })
      if (!r.error && Array.isArray(r.data)) {
        data = r.data
      }
      // If nothing with padded code, try non‑padded
      if (!data.length) {
        const r2 = await supabase.rpc('get_course_members', { p_course: alt })
        if (!r2.error && Array.isArray(r2.data)) data = r2.data
      }
    } catch (e) {
      // ignore and fall back
    }

    // 2) Fallback to direct query against profiles (works if RLS allows it)
    if (!data.length) {
      let q = await supabase
        .from('profiles')
        .select('id, username, university, study_line, avatar_url, courses')
        .contains('courses', [target])
      if (!q.error && Array.isArray(q.data)) data = q.data

      if (!data.length) {
        q = await supabase
          .from('profiles')
          .select('id, username, university, study_line, avatar_url, courses')
          .contains('courses', [alt])
        if (!q.error && Array.isArray(q.data)) data = q.data
      }
    }

    // 3) Last‑resort: fetch a small set and filter client‑side
    if (!data.length) {
      const r3 = await supabase
        .from('profiles')
        .select('id, username, university, study_line, avatar_url, courses')
        .limit(500)
      const rows = r3.data || []
      data = rows.filter(u => {
        const arr = Array.isArray(u.courses) ? u.courses : []
        return arr.some(c => {
          const s = String(c)
          return s === target || s === alt || s.padStart(5, '0') === target
        })
      })
    }

    // 4) Always include self if they have this course
    const me = myProfile.value
    const meId = currentUser.value?.id
    if (me && meId) {
      const arr = Array.isArray(me.courses) ? me.courses : []
      const has = arr.some(c => {
        const s = String(c)
        return s === target || s === alt || s.padStart(5, '0') === target
      })
      if (has && !(data || []).some(u => u.id === meId)) {
        data = [
          ...(data || []),
          { id: meId, username: me.username, university: me.university, study_line: me.study_line, avatar_url: me.avatar_url, courses: me.courses }
        ]
      }
    }

    courseUsers.value = data || []
  } finally {
    loadingUsers.value = false
  }
}
function goProfile(id){
  // Navigate to public profile page for that user
  try {
    router.push(`/profile/${id}`)
  } catch {
    window.location.href = `/profile/${id}`
  }
}

function messageUser(id){
  try { router.push(`/messages?to=${id}`) } catch { window.location.href = `/messages?to=${id}` }
}

// reset users list when course changes
watch(code, () => { courseUsers.value = [] })

// Load users when tab is 'users' or course changes while on users tab
watch([tab, code], async ([t]) => {
  if (t === 'users' && !loadingUsers.value) {
    await loadCourseUsers()
  }
})

// active kinds filter
const feedKinds = ref(new Set(['file','question','group']))
function isKindOn(k){ return feedKinds.value.has(k) }
function toggleKind(k){
  const s = new Set(feedKinds.value)
  if (s.has(k)) s.delete(k); else s.add(k)
  // never allow empty set -> toggle back on all
  if (s.size === 0) { s.add('file'); s.add('question'); s.add('group') }
  feedKinds.value = s
}

const filteredFeed = computed(() => feed.value.filter(i => feedKinds.value.has(i.kind)))

function loadMore(){ feedLimit.value += FEED_PAGE; loadFeed() }

// NOTE: This feed expects integer column `upvotes` default 0
// in tables: resources, questions, study_groups. Example SQL to add:
// alter table public.resources add column if not exists upvotes int default 0;
// alter table public.questions add column if not exists upvotes int default 0;
// alter table public.study_groups add column if not exists upvotes int default 0;

async function loadFeed() {
  loadingFeed.value = true
  try {
    const lim = feedLimit.value + 1
    const [resR, qR, gR] = await Promise.all([
      supabase.from('resources')
        .select('id, title, type, public_url, created_at, course, upvotes')
        .eq('course', code.value)
        .order('created_at', { ascending: false })
        .limit(lim),
      supabase.from('questions')
        .select('id, body, display_name, created_at, course, upvotes')
        .eq('course', code.value)
        .order('created_at', { ascending: false })
        .limit(lim),
      supabase.from('study_groups')
        .select('id, title, place, description, created_at, course, upvotes')
        .eq('course', code.value)
        .order('created_at', { ascending: false })
        .limit(lim)
    ])

    const files = (resR.data || []).map(r => ({ kind: 'file', ...r }))
    const qs    = (qR.data   || []).map(r => ({ kind: 'question', ...r }))
    const grps  = (gR.data   || []).map(r => ({ kind: 'group', ...r }))

    // Attach answers to each question
    if (qs.length) {
      const ids = qs.map(q => q.id)
      const { data: ans } = await supabase
        .from('answers')
        .select('id, question_id, body, display_name, created_at')
        .in('question_id', ids)
        .order('created_at', { ascending: true })
      const byQ = {}
      ;(ans || []).forEach(a => {
        byQ[a.question_id] = byQ[a.question_id] || []
        byQ[a.question_id].push(a)
      })
      qs.forEach(q => { q.answers = byQ[q.id] || []; if (q._showReplies === undefined) q._showReplies = false })
    }

    const merged = [...files, ...qs, ...grps]
    merged.sort((a,b) => (new Date(b.created_at) - new Date(a.created_at)))

    hasMore.value = merged.length > feedLimit.value
    feed.value = hasMore.value ? merged.slice(0, feedLimit.value) : merged
  } finally {
    loadingFeed.value = false
  }
}

async function loadAll() {
  await Promise.all([loadTitle(), loadFiles(), loadQuestions(), loadGroups(), loadFeed()])
}

function prettyDate(d) {
  try { return new Date(d).toLocaleString() } catch { return '' }
}

let feedChannel = null
async function subscribeFeed(){
  if (!supabase) return
  if (feedChannel) { try { await supabase.removeChannel(feedChannel) } catch {} }
  const ch = supabase.channel(`course-feed-${code.value}`)
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resources', filter: `course=eq.${code.value}` }, (payload) => {
    const r = payload.new
    feed.value = [{ kind: 'file', ...r }, ...feed.value].sort((a,b) => (new Date(b.created_at) - new Date(a.created_at)))
  })
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions', filter: `course=eq.${code.value}` }, (payload) => {
    const r = payload.new
    feed.value = [{ kind: 'question', ...r }, ...feed.value].sort((a,b) => (new Date(b.created_at) - new Date(a.created_at)))
  })
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_groups', filter: `course=eq.${code.value}` }, (payload) => {
    const r = payload.new
    feed.value = [{ kind: 'group', ...r }, ...feed.value].sort((a,b) => (new Date(b.created_at) - new Date(a.created_at)))
  })
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' }, (payload) => {
    const a = payload.new
    const idx = feed.value.findIndex(x => x.kind === 'question' && x.id === a.question_id)
    if (idx !== -1) {
      const item = feed.value[idx]
      item.answers = item.answers || []
      item.answers.push(a)
      feed.value = [...feed.value]
    }
  })
  feedChannel = ch.subscribe()
}

function tableFor(kind){
  if (kind==='file') return 'resources'
  if (kind==='question') return 'questions'
  if (kind==='group') return 'study_groups'
  return null
}

async function openItem(item){
  if (!item) return
  if (item.kind === 'file') {
    if (item.public_url) window.open(item.public_url, '_blank', 'noopener')
    return
  }
  if (item.kind === 'question') {
    // Questions live in the feed; no tab switch.
    return
  }
  if (item.kind === 'group') {
    tab.value = 'groups'
    await Promise.resolve()
    const el = document.getElementById('g-' + item.id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
}

async function toggleVote(item){
  const table = tableFor(item.kind)
  if (!table) return
  const u = currentUser.value
  if (!u?.id) { alert('Please log in to vote.'); return }

  const votesTable = 'course_votes'
  const key = { user_id: u.id, kind: item.kind, item_id: item.id }

  try {
    // Check if user already voted
    const { data: existing, error: selErr } = await supabase
      .from(votesTable)
      .select('user_id')
      .match(key)
      .maybeSingle()

    if (selErr) throw selErr

    if (existing) {
      // User has a vote -> unvote (delete)
      const { error: delErr } = await supabase.from(votesTable).delete().match(key)
      if (delErr) throw delErr
    } else {
      // Add vote (one per user enforced by PK/unique at DB)
      const { error: insErr } = await supabase.from(votesTable).insert({ ...key, course: code.value })
      if (insErr) throw insErr
    }

    // Re-count votes (authoritative)
    const { count, error: cntErr } = await supabase
      .from(votesTable)
      .select('*', { count: 'exact', head: true })
      .eq('kind', item.kind)
      .eq('item_id', item.id)

    if (cntErr) throw cntErr

    const newCount = count ?? 0
    item.upvotes = newCount
    item._voted = !existing

    // Persist denormalized counter for fast listing
    await supabase.from(table).update({ upvotes: newCount }).eq('id', item.id)
  } catch (e) {
    console.error('[toggleVote] failed', e)
    alert('Could not update vote. Please try again.')
  }
}


// ===== Files =====
function onPickFile(e) { upFile.value = e.target.files?.[0] || null }

async function doUpload() {
  if (!supabase || !upFile.value) return
  upErr.value = ''
  upLoading.value = true
  try {
    const file = upFile.value
    const name = `${Date.now()}_${file.name}`
    // upload to storage
    const { error: stErr } = await supabase.storage.from('resources').upload(`${code.value}/${name}`, file)
    if (stErr) { upErr.value = stErr.message; return }

    // get public URL
    const { data: pub } = supabase.storage.from('resources').getPublicUrl(`${code.value}/${name}`)
    const public_url = pub?.publicUrl

    // insert metadata (assumes a table public.resources exists)
    await supabase.from('resources').insert({
      course: code.value,
      title: uploadTitle.value || file.name,
      type: uploadType.value,
      public_url: public_url
    })

    uploadTitle.value = ''
    uploadType.value = 'Notes'
    upFile.value = null
    await loadFiles()
    await loadFeed()
  } catch (e) {
    upErr.value = String(e?.message || e)
  } finally {
    upLoading.value = false
  }
}

async function loadFiles() {
  const { data } = await supabase
    .from('resources')
    .select('id, title, type, public_url, created_at')
    .eq('course', code.value)
    .order('created_at', { ascending: false })
  courseFiles.value = data || []
}

// ===== Questions =====
async function askQuestion() {
  if (!questionBody.value.trim()) return
  askErr.value = ''
  asking.value = true
  try {
    await supabase.from('questions').insert({
      body: questionBody.value.trim(),
      course: code.value,
      display_name: (displayName.value || 'Anonymous')
    })
    questionBody.value = ''
    await loadQuestions()
    await loadFeed()
  } catch (e) {
    askErr.value = String(e?.message || e)
  } finally {
    asking.value = false
  }
}

async function createPost(){
  const body = postBody.value.trim()
  if (!body) return
  postErr.value = ''
  posting.value = true
  try {
    const { data: ins, error: qErr } = await supabase
      .from('questions')
      .insert({ body, course: code.value, display_name: (displayName.value || 'Anonymous') })
      .select('id')
      .single()
    if (qErr) throw qErr

    // Fire mentions (non-blocking)
    notifyMentions({ text: body, kind: 'question', postId: ins.id })

    postBody.value = ''
    // feed will update via realtime; also refresh lists
    await loadQuestions()
    await loadFeed()
  } catch (e) {
    postErr.value = String(e?.message || e)
  } finally {
    posting.value = false
  }
}

async function replyTo(q) {
  const text = (q._reply || '').trim()
  if (!text) return
  const { data, error } = await supabase.from('answers').insert({
    question_id: q.id,
    body: text,
    display_name: (displayName.value || 'Anonymous')
  }).select('id, question_id, body, display_name, created_at').single()
  if (!error) {
    // attach to feed item if present
    const idx = feed.value.findIndex(x => x.kind==='question' && x.id===q.id)
    if (idx !== -1) {
      const item = feed.value[idx]
      item.answers = item.answers || []
      item.answers.push(data)
      feed.value = [...feed.value]
    }
  }
  notifyMentions({ text, kind: 'answer', postId: data?.id || null })
  q._showReplies = true
  q._reply = ''
}

async function loadQuestions() {
  const { data } = await supabase
    .from('questions')
    .select('id, body, display_name, created_at')
    .eq('course', code.value)
    .order('created_at', { ascending: false })
  const rows = data || []
  // fetch answers
  const ids = rows.map(r => r.id)
  if (ids.length) {
    const { data: ans } = await supabase
      .from('answers')
      .select('id, question_id, body, display_name, created_at')
      .in('question_id', ids)
      .order('created_at', { ascending: true })
    const byQ = {}
    ;(ans || []).forEach(a => {
      byQ[a.question_id] = byQ[a.question_id] || []
      byQ[a.question_id].push(a)
    })
    rows.forEach(r => { r.answers = byQ[r.id] || []; if (r._showReplies === undefined) r._showReplies = false })
  }
  questions.value = rows
}
function toggleReplies(item){
  item._showReplies = !item._showReplies
  item._replying = !!item._showReplies
}

function toggleComment(item){
  item._showReplies = !item._showReplies
  item._replying = !!item._showReplies
}

// ===== Groups =====
async function createGroup() {
  groupErr.value = ''
  const titleVal = groupTitle.value.trim()
  const placeVal = (groupWhere.value || '').trim() || null
  const whenVal  = (groupDescription.value || '').trim() || null
  if (!titleVal) { groupErr.value = 'Please enter a group name.'; return }
  creatingGroup.value = true
  try {
    const { data, error } = await supabase
      .from('study_groups')
      .insert({ course: code.value, title: titleVal, place: placeVal, groupDescription: whenVal })
      .select('id, title, place, groupDescription, created_at')
      .single()

    if (error) { groupErr.value = error.message; return }

    // Optimistic update so it appears immediately
    if (data) {
      groups.value = [data, ...groups.value]
      // Also prepend to feed
      feed.value = [{ kind: 'group', ...data }, ...feed.value]
    }

    // reset form
    groupTitle.value = ''
    groupWhere.value = ''
    groupDescription.value = ''
  } catch (e) {
    groupErr.value = String(e?.message || e)
    console.error('[study_groups.insert] error:', e)
  } finally {
    creatingGroup.value = false
  }
}

async function joinGroup(g) {
  // minimal UX – you can extend to memberships later
  alert(`Ask the creator about joining: ${g.title}`)
}

async function loadGroups() {
  const { data } = await supabase
    .from('study_groups')
    .select('id, title, place, time, created_at')
    .eq('course', code.value)
    .order('created_at', { ascending: false })
  groups.value = data || []
}


function avatarFor(u){
  let raw = u?.avatar_url || ''
  if (raw && !/^https?:\/\//i.test(raw)) {
    try {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(raw)
      return pub?.publicUrl || ''
    } catch { return '' }
  }
  return raw || ''
}

// ===== Course title =====
async function loadTitle() {
  const { data } = await supabase
    .from('courses')
    .select('title')
    .eq('code', code.value)
    .maybeSingle()
  title.value = data?.title || ''
}

onMounted(loadAll)
onMounted(() => { subscribeFeed() })

// react to param change (no full reload)
watch(() => route.params.code, () => {
  feedLimit.value = FEED_PAGE
  hasMore.value = false
  loadAll()
  subscribeFeed()
})
// --- Overflow menu helpers ---
function isMyItem(item){
  const uid = currentUser.value?.id
  // Prefer explicit user_id if present; fallback to display_name matching my username
  if (item.user_id && uid) return item.user_id === uid
  const mineByName = (myProfile.value?.username && item.display_name && myProfile.value.username === item.display_name)
  return !!mineByName
}

function toggleItemMenu(item){
  // Close others
  feed.value = feed.value.map(it => (it === item ? it : ({...it, _menuOpen:false})))
  item._menuOpen = !item._menuOpen
}
function closeAllMenus(){
  if (!feed.value.length) return
  let changed = false
  feed.value = feed.value.map(it => {
    if (it._menuOpen){ changed = true; return { ...it, _menuOpen:false } }
    return it
  })
  return changed
}

async function deleteItem(item){
  const table = tableFor(item.kind)
  if (!table) return
  if (!confirm('Delete this post? This cannot be undone.')) return
  try {
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) throw error
    // Remove locally
    feed.value = feed.value.filter(x => !(x.kind===item.kind && x.id===item.id))
  } catch (e) {
    alert('Could not delete (permission or server error).')
    console.error('[deleteItem]', e)
  } finally {
    item._menuOpen = false
  }
}

async function reportItem(item){
  try {
    const uid = currentUser.value?.id
    if (!uid) { alert('Please log in to report.'); return }

    let reason = prompt('Why are you reporting this post? (optional)', '')
    if (reason === null) { item._menuOpen = false; return } // user cancelled
    reason = (reason || '').slice(0, 300)

    await supabase.from('reports').insert({
      item_type: item.kind,        // 'file' | 'question' | 'group'
      item_id: item.id,
      course: code.value,
      reason,
      created_by: uid
    })
    alert('Thanks — report submitted.')
  } catch (e) {
    alert('Could not submit report.')
    console.error('[reportItem]', e)
  } finally {
    item._menuOpen = false
  }
}

</script>

<style scoped>
.course-page { max-width: 980px; margin: 28px auto; padding: 0 12px; }
.course-header { margin-bottom: 16px; }
.course-header h1 { margin: 0 0 6px; }
.subtle { opacity: 0.8; }

.tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
.tabs button { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: #fff; cursor: pointer; text-align: center; }
.tabs button.active { background: rgba(255,255,255,0.08); }

.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.grid .input.readonly { opacity: 0.8; }
.input, textarea, select { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px; color: #fff; }
.button { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; cursor: pointer; }
.button.primary { background: #7aa2ff33; border-color: #7aa2ff66; }
.badge { background: rgba(255,255,255,0.07); padding: 4px 8px; border-radius: 999px; font-size: 12px; margin-right: 8px; }

.file-list, .q-list, .group-list { display: grid; gap: 10px; margin-top: 10px; }
.file-row, .q-row, .group-row { display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; }
.spacer { flex: 1; }
.avatar.small { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.14); display: grid; place-items: center; font-weight: 700; }
.avatar.xsmall { width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.14); display: grid; place-items: center; font-size: 12px; }
.small { font-size: 12px; }
.muted { opacity: 0.7; }
.strong { font-weight: 600; }
.reply { display: flex; gap: 8px; margin-top: 8px; }

.feed-list { display: grid; gap: 10px; margin-top: 10px; }
.feed-row { position: relative; transition: background .15s, border-color .15s; }
.feed-row:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }
.feed-row .strong { font-weight: 650; letter-spacing: .1px; }
.feed-row .small { opacity: .75; }
.badge.k-file { background: rgba(129, 199, 132, 0.25); }
.badge.k-question { background: rgba(100, 149, 255, 0.25); }
.badge.k-group { background: rgba(255, 193, 7, 0.25); }
.chips { display: flex; gap: 6px; }
.chip { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 5px 10px; cursor: pointer; color: #fff; font-size: 12px; }
.chip.active { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.24); }

.actions { display: flex; gap: 6px; align-items: center; }
.button.icon { padding: 4px 8px; font-size: 12px; }
.button.icon.active { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.22); }


/* Ensure course posts match unified feed height */
.feed-list .feed-row {
  min-height: 92px;            /* row height to match unified feed */
  padding: 14px 12px 40px 12px;/* extra bottom space for fixed actions */
  align-items: center;         /* center contents vertically */
}

.feed-row .actions {
  position: absolute;
  right: 12px;
  bottom: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: 0; /* override any generic margins */
}
/* Center the text column vertically within the row */
.feed-row .col, .feed-row .col.clickable {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
/* Keep action buttons vertically centered as well */
.feed-row .actions { align-items: center; }

.actions { display: flex; gap: 8px; align-items: center; }
.iconbtn { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color:#fff; cursor:pointer; font-size:12px; text-decoration:none; }
.iconbtn:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.24); }
.iconbtn.ghost { background: transparent; border-color: rgba(255,255,255,0.14); }
.iconbtn.ghost { white-space: nowrap; }
.iconbtn.vote { padding:6px 8px; }
.iconbtn.vote .tri { font-size:11px; opacity:.95; }
.iconbtn.vote .count { font-variant-numeric: tabular-nums; min-width: 1.5ch; text-align:right; }

/* icon and count alignment for comment button */
.iconbtn .icon { line-height: 1; display: inline-block; }
.iconbtn .count { font-variant-numeric: tabular-nums; }
/* badge refinement */
.badge { text-transform: none; font-weight: 600; }

.col.clickable { cursor: pointer; }
.feed-row .col.clickable:hover .strong { text-decoration: underline; }

/* --- Composer --- */
.composer { display:flex; gap:10px; align-items:flex-start; background: rgba(0,0,0,0.10); border:1px solid rgba(255,255,255,0.12); padding:10px; border-radius:10px; margin:8px 0 12px; }
.avatar.large { width:40px; height:40px; border-radius:50%; background: rgba(255,255,255,0.14); display:grid; place-items:center; font-weight:800; }
.avatar.large img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.avatar.large span { display: grid; place-items: center; width: 100%; height: 100%; }
.composer-col { flex:1; }
.composer-input { border-radius:14px; resize: vertical; }
.composer-actions { display:flex; align-items:center; gap:10px; margin-top:6px; }

.reply.under { margin: 6px 0 4px 44px; display:flex; gap:8px; align-items:flex-start; }
.reply.under textarea.input { flex: 1 1 0; width: auto !important; min-height: 64px; }
.reply.under .button { flex: 0 0 auto; width: auto; min-width: 96px; white-space: nowrap; }


.answers.under { margin: 6px 0 0 44px; display: grid; gap: 8px; }
.answer-row { display:flex; gap:8px; align-items:flex-start; background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:8px; padding:8px; }


.user-list { display: grid; gap: 8px; margin-top: 10px; }
.user-row { display:flex; align-items:center; gap:12px; padding:12px; background: rgba(0,0,0,0.10); border:1px solid rgba(255,255,255,0.12); border-radius:12px; }
.user-row + .user-row { margin-top: 8px; }
.user-row .left { display:flex; align-items:center; gap:12px; cursor:pointer; }
.user-row .left .col .strong { font-weight: 650; }
.button.pill { border-radius: 12px; }
.message-wide { flex: 1; justify-content: center; display: inline-flex; align-items: center; text-align:center; padding: 10px 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); font-weight: 600; }
.message-wide:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.22); }

.more-btn { position:absolute; top:8px; right:8px; width:28px; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color:#fff; cursor:pointer; line-height:1; font-size:18px; display:grid; place-items:center; }
.more-btn:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.22); }
.more-menu { position:absolute; top:40px; right:8px; background: rgba(0,0,0,0.9); border:1px solid rgba(255,255,255,0.18); border-radius:10px; padding:6px; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 5; }
.menu-item { width:100%; text-align:left; padding:8px 10px; border:none; background:transparent; color:#fff; cursor:pointer; border-radius:8px; font-size: 14px; }
.menu-item:hover { background: rgba(255,255,255,0.08); }
.menu-item.danger { color: #ffb4b4; }
.menu-item.danger:hover { background: rgba(255, 99, 71, 0.15); }

.post {
  position: relative; /* Needed so child absolute elements position correctly */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 92px; /* keep consistent height */
  padding: 12px 16px;
}

.post-actions {
  position: absolute;
  bottom: 8px;
  right: 12px;
  display: flex;
  gap: 8px;
}
.feed-row .meta.meta-bottom {
  position: absolute;
  left: 12px;
  bottom: 10px;
}

</style>











