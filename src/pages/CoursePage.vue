<template>
  <div class="course-page">
    <header class="course-header">
      <h1>{{ code }} <span v-if="title">— {{ title }}</span></h1>
      <div class="subtle">Everything for this course: uploads, questions, and study groups.</div>
    </header>

    <div class="tabs">
      <button :class="{active: tab==='feed'}" @click="tab='feed'">Feed</button>
      <button :class="{active: tab==='files'}" @click="tab='files'">Files</button>
      <button :class="{active: tab==='questions'}" @click="tab='questions'">Questions</button>
      <button :class="{active: tab==='groups'}" @click="tab='groups'">Study Groups</button>
    </div>

    <!-- FEED -->
    <section v-if="tab==='feed'" class="card">
      <h2>Latest activity</h2>
      <div v-if="!feed.length" class="muted">No activity yet.</div>
      <div v-else class="feed-list">
        <div v-for="item in feed" :key="item.kind + ':' + item.id" class="feed-row">
          <span class="badge" :class="'k-' + item.kind">{{ item.kind }}</span>
          <div class="col">
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
            <div class="small muted">
              {{ prettyDate(item.created_at) }}
              <template v-if="item.kind==='question' && item.display_name"> — {{ item.display_name }}</template>
              <template v-if="item.kind==='group' && (item.place || item.time)"> — {{ item.place || '—' }} {{ item.time ? ' · ' + item.time : '' }}</template>
            </div>
          </div>
          <div class="spacer"></div>
          <template v-if="item.kind==='file'">
            <a class="button" :href="item.public_url" target="_blank" rel="noopener">Open</a>
          </template>
          <template v-else-if="item.kind==='question'">
            <button class="button" @click="tab='questions'">View</button>
          </template>
          <template v-else>
            <button class="button" @click="tab='groups'">View</button>
          </template>
        </div>
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

    <!-- QUESTIONS -->
    <section v-if="tab==='questions'" class="card">
      <h2>Ask a question</h2>
      <textarea
        class="input"
        rows="3"
        v-model="questionBody"
        :placeholder="`Ask about ${code}…`"
      />
      <button class="button primary" :disabled="asking" @click="askQuestion">
        {{ asking ? 'Posting…' : 'Ask' }}
      </button>
      <div class="hint" v-if="askErr">{{ askErr }}</div>

      <h3 style="margin-top:18px;">Recent questions</h3>
      <div v-if="questions.length===0" class="muted">No questions yet.</div>
      <div v-else class="q-list">
        <div v-for="q in questions" :key="q.id" class="q-row">
          <div class="avatar small">{{ (q.display_name || 'U').slice(0,1).toUpperCase() }}</div>
          <div class="col">
            <div class="strong">{{ q.body }}</div>
            <div class="small muted">{{ prettyDate(q.created_at) }} — {{ q.display_name || 'Anonymous' }}</div>
            <!-- answers -->
            <div class="answers">
              <div v-if="!q.answers?.length" class="small muted">No answers yet.</div>
              <div v-else>
                <div v-for="a in q.answers" :key="a.id" class="ans-row">
                  <div class="avatar xsmall">{{ (a.display_name || 'U').slice(0,1).toUpperCase() }}</div>
                  <div class="col">
                    <div>{{ a.body }}</div>
                    <div class="small muted">{{ prettyDate(a.created_at) }} — {{ a.display_name || 'Anonymous' }}</div>
                  </div>
                </div>
              </div>
              <div class="reply">
                <input class="input" v-model="q._reply" placeholder="Write an answer…" />
                <button class="button" @click="replyTo(q)">Reply</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- STUDY GROUPS -->
    <section v-if="tab==='groups'" class="card">
      <h2>Study groups</h2>
      <div class="grid">
        <input class="input" v-model="groupTitle" placeholder="Group name (e.g., Project team A)" />
        <input class="input" v-model="groupWhere" placeholder="Where/Link (e.g., Library / Zoom)" />
        <input class="input" v-model="groupWhen" placeholder="When (e.g., Thursdays 15-17)" />
      </div>
      <button class="button primary" :disabled="creatingGroup" @click="createGroup">
        {{ creatingGroup ? 'Creating…' : 'Create group' }}
      </button>
      <div class="hint" v-if="groupErr">{{ groupErr }}</div>

      <h3 style="margin-top:18px;">Groups for {{ code }}</h3>
      <div v-if="groups.length===0" class="muted">No groups yet.</div>
      <div v-else class="group-list">
        <div v-for="g in groups" :key="g.id" class="group-row">
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
const uploadType = ref('Exam')
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
const groupWhen = ref('')
const creatingGroup = ref(false)
const groupErr = ref('')
const groups = ref([])

const feed = ref([])

async function loadFeed() {
  // Fetch latest resources, questions, and groups for this course, then merge & sort
  const [resR, qR, gR] = await Promise.all([
    supabase.from('resources')
      .select('id, title, type, public_url, created_at')
      .eq('course', code.value)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('questions')
      .select('id, body, display_name, created_at')
      .eq('course', code.value)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('study_groups')
      .select('id, title, place, time, created_at')
      .eq('course', code.value)
      .order('created_at', { ascending: false })
      .limit(50)
  ])

  const files = (resR.data || []).map(r => ({ kind: 'file', ...r }))
  const qs    = (qR.data   || []).map(r => ({ kind: 'question', ...r }))
  const grps  = (gR.data   || []).map(r => ({ kind: 'group', ...r }))

  const merged = [...files, ...qs, ...grps]
  merged.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  feed.value = merged
}

async function loadAll() {
  await Promise.all([loadTitle(), loadFiles(), loadQuestions(), loadGroups(), loadFeed()])
}

function prettyDate(d) {
  try { return new Date(d).toLocaleString() } catch { return '' }
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
    uploadType.value = 'Exam'
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
    const u = currentUser.value
    await supabase.from('questions').insert({
      body: questionBody.value.trim(),
      course: code.value,
      display_name: (u?.user_metadata?.full_name || u?.email || 'Anonymous')
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

async function replyTo(q) {
  const text = (q._reply || '').trim()
  if (!text) return
  const u = currentUser.value
  await supabase.from('answers').insert({
    question_id: q.id,
    body: text,
    display_name: (u?.user_metadata?.full_name || u?.email || 'Anonymous')
  })
  q._reply = ''
  await loadQuestions()
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
    rows.forEach(r => r.answers = byQ[r.id] || [])
  }
  questions.value = rows
}

// ===== Groups =====
async function createGroup() {
  groupErr.value = ''
  const titleVal = groupTitle.value.trim()
  const placeVal = (groupWhere.value || '').trim() || null
  const whenVal  = (groupWhen.value || '').trim() || null
  if (!titleVal) { groupErr.value = 'Please enter a group name.'; return }
  creatingGroup.value = true
  try {
    const { data, error } = await supabase
      .from('study_groups')
      .insert({ course: code.value, title: titleVal, place: placeVal, time: whenVal })
      .select('id, title, place, time, created_at')
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
    groupWhen.value = ''
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

// react to param change (no full reload)
watch(() => route.params.code, () => { loadAll() })
</script>

<style scoped>
.course-page { max-width: 980px; margin: 28px auto; padding: 0 12px; }
.course-header { margin-bottom: 16px; }
.course-header h1 { margin: 0 0 6px; }
.subtle { opacity: 0.8; }

.tabs { display: flex; gap: 8px; margin: 12px 0 16px; }
.tabs button { padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: transparent; color: #fff; cursor: pointer; }
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
.feed-row { display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; }
.badge.k-file { background: rgba(129, 199, 132, 0.25); }
.badge.k-question { background: rgba(100, 149, 255, 0.25); }
.badge.k-group { background: rgba(255, 193, 7, 0.25); }
</style>