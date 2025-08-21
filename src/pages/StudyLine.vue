<template>
  <div class="studyline-page">
    <header class="head">
      <h1>{{ decodedStudy }}</h1>
      <p class="muted">People who chose this study line</p>
    </header>

    <section class="card">
      <div v-if="loading" class="muted">Loading…</div>
      <div v-else-if="people.length === 0" class="muted">No one here yet.</div>

      <div v-else class="list">
        <div v-for="p in people" :key="p.id" class="item friend-row">
          <router-link :to="`/profile?id=${p.id}`" class="avatar circle">
            <img v-if="avatars[p.id]" :src="avatars[p.id]" alt="avatar" />
            <span v-else>{{ (p.username || p.email || 'U').slice(0,1).toUpperCase() }}</span>
          </router-link>

          <router-link :to="`/profile?id=${p.id}`" class="name linklike">
            <div class="strong">{{ p.username || p.email }}</div>
          </router-link>

          <div class="uni small muted">{{ p.university || '—' }}</div>

          <div class="study small muted">{{ p.study_line || '' }}</div>

          <div class="courses" v-if="Array.isArray(p.courses) && p.courses.length">
            <router-link
              v-for="c in p.courses"
              :key="codeOf(c)"
              :to="`/course/${codeOf(c)}`"
              class="badge"
              :title="titleOf(c) || 'Course'"
            >
              {{ codeOf(c) }}
            </router-link>
          </div>

          <div class="actions">
            <router-link
              v-if="p.id !== me?.id && friends.has(p.id)"
              class="button pill"
              :to="`/messages?to=${p.id}`"
            >
              Message
            </router-link>
            <button
              v-else-if="p.id !== me?.id"
              class="button pill"
              :disabled="busy[p.id] === true || pending.has(p.id)"
              @click="sendFriend(p.id)"
              :title="pending.has(p.id) ? 'Request already sent' : 'Send friend request'"
            >
              {{ pending.has(p.id) ? 'Requested' : (busy[p.id] ? 'Sending…' : 'Add friend') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'

const me = currentUser
const route = useRoute()

const study = ref('')
const decodedStudy = computed(() => {
  try { return decodeURIComponent(study.value || '') } catch { return study.value || '' }
})

const loading = ref(false)
const people = ref([])
const courseTitles = ref({})
const busy = ref({})
const pending = ref(new Set())
const friends = ref(new Set())
const avatars = ref({})

function codeOf(c) { return (c && typeof c === 'object') ? (c.id || c.code || '') : (c || '') }
function titleOf(c) {
  if (c && typeof c === 'object') return c.name || c.title || courseTitles.value[codeOf(c)] || ''
  return courseTitles.value[codeOf(c)] || ''
}

onMounted(async () => {
  study.value = ((route.query?.name ?? route.query?.value) || '') + ''
  await bootstrap()
})

watch(() => [route.query.name, route.query.value], async () => {
  study.value = ((route.query?.name ?? route.query?.value) || '') + ''
  await bootstrap()
})

async function bootstrap() {
  people.value = []
  pending.value = new Set()
  if (!decodedStudy.value) return
  loading.value = true
  try {
    // Load people with this study line (including me)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, university, courses, study_line, avatar_url')
      .eq('study_line', decodedStudy.value)
      .order('username', { ascending: true })

    people.value = error ? [] : (data || [])

    // Resolve avatar URLs (supports full URLs and storage paths)
    const nextAvatars = {}
    for (const p of (people.value || [])) {
      let raw = p?.avatar_url || ''
      if (!raw) continue
      if (!/^https?:\/\//i.test(raw)) {
        try {
          const path = String(raw).replace(/^avatars\//, '')
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
          raw = pub?.publicUrl || ''
        } catch (_) { raw = '' }
      }
      if (raw) nextAvatars[p.id] = raw
    }
    avatars.value = nextAvatars

    // Build a unique set of course codes across listed people
    const codes = new Set()
    for (const p of (people.value || [])) {
      if (Array.isArray(p.courses)) {
        for (const c of p.courses) {
          const code = codeOf(c)
          if (code) codes.add(code)
        }
      }
    }
    // Fetch titles for those codes
    if (codes.size) {
      const { data: ct } = await supabase
        .from('courses')
        .select('code,title')
        .in('code', Array.from(codes))
      const map = {}
      for (const row of (ct || [])) map[row.code] = row.title
      courseTitles.value = map
    }

    // Preload which ones already have a pending request from me
    if (me.value && people.value.length) {
      const ids = people.value.map(p => p.id)
      const { data: reqs } = await supabase
        .from('friend_requests')
        .select('receiver_id, status')
        .eq('sender_id', me.value.id)
        .in('receiver_id', ids)
      for (const r of (reqs || [])) {
        if (r.status && r.status !== 'declined') pending.value.add(r.receiver_id)
      }

      // Load accepted friendships (both directions) to decide whether to show "Message"
      if (me.value && ids.length) {
        const or = [
          `and(sender_id.eq.${me.value.id},receiver_id.in.(${ids.join(',')}))`,
          `and(receiver_id.eq.${me.value.id},sender_id.in.(${ids.join(',')}))`
        ].join(',')
        const { data: accepted } = await supabase
          .from('friend_requests')
          .select('sender_id, receiver_id, status')
          .eq('status', 'accepted')
          .or(or)

        friends.value = new Set()
        for (const fr of (accepted || [])) {
          const otherId = fr.sender_id === me.value.id ? fr.receiver_id : fr.sender_id
          friends.value.add(otherId)
        }
      }
    }
  } finally {
    loading.value = false
  }
}

async function sendFriend(targetId) {
  if (!me.value || !targetId) return
  busy.value = { ...busy.value, [targetId]: true }
  try {
    const { error } = await supabase
      .from('friend_requests')
      .upsert(
        { sender_id: me.value.id, receiver_id: targetId, status: 'pending' },
        { onConflict: 'sender_id,receiver_id' }
      )
    if (!error) pending.value.add(targetId)
  } finally {
    busy.value = { ...busy.value, [targetId]: false }
  }
}
</script>

<style scoped>
.studyline-page { max-width: 1000px; margin: 28px auto; padding: 0 12px; }
.head h1 { margin: 0 0 4px; }
.muted { opacity: .75; }
.small { font-size: 12px; }
.strong { font-weight: 600; }

.card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 12px 0; }

.list { display: grid; gap: 12px; margin-top: 8px; }
.item { background: rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px; }

/* Friends-like row layout */
.friend-row { 
  display: grid; 
  grid-template-columns: 48px minmax(140px, 1fr) 90px minmax(180px, 1.2fr) auto auto; 
  align-items: center; 
  gap: 16px; 
}

.avatar.circle { width: 48px; height: 48px; border-radius: 999px; background: rgba(255,255,255,0.18); display: grid; place-items: center; font-weight: 700; }
.avatar.circle img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.avatar.circle span { display: grid; place-items: center; width: 100%; height: 100%; }

.name { display: grid; gap: 2px; }
.linklike { color: inherit; text-decoration: none; }
.avatar.circle { text-decoration: none; color: inherit; }
.avatar.circle:hover { filter: brightness(1.08); }
.name.linklike:hover .strong { text-decoration: underline; }
.uni { text-align: left; }
.study { text-align: left; }
.courses { display: flex; flex-wrap: wrap; gap: 6px; justify-self: start; }
.actions { justify-self: end; }

.button.pill { padding: 8px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.18); }
.button.pill[disabled] { opacity: .6; cursor: default; }

/* Responsive: stack on small widths */
@media (max-width: 820px) {
  .friend-row {
    grid-template-columns: 40px 1fr auto; 
    grid-template-areas: 
      'av name act' 
      'av uni  act' 
      'av study act' 
      'av courses courses';
    row-gap: 6px;
  }
  .avatar.circle { grid-area: av; width: 40px; height: 40px; }
  .name { grid-area: name; }
  .uni { grid-area: uni; }
  .study { grid-area: study; }
  .courses { grid-area: courses; }
  .actions { grid-area: act; }
}
</style>