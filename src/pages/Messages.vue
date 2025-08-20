<template>
  <div class="messages-page">
    <!-- render-hint --><span class="render-hint" aria-hidden="true" style="position:absolute;left:-9999px;">messages-mounted</span>
    <div class="quick-compose">
      <select v-model="quickTo" class="qc-select">
        <option :value="null" disabled>Select friend…</option>
        <option v-for="f in friends" :key="f.id" :value="f.id">{{ f.username || f.email }}</option>
      </select>
      <input class="qc-input" v-model="quickText" @keyup.enter="sendQuick" placeholder="New message…" />
      <button class="qc-send" @click="sendQuick">Send</button>
    </div>
    <aside class="friends-list">
      <div class="section-title">Direct Messages</div>
      <div
        v-for="f in friends"
        :key="f.id"
        class="friend"
        :class="{ active: activeFriend && activeFriend.id === f.id }"
        @click="openChat(f)"
      >
        <span class="name">{{ f.username || f.email }}</span>
        <span class="badge" v-if="unread[f.id] && unread[f.id] > 0">{{ unread[f.id] }}</span>
      </div>
      <div v-if="!friends.length" class="empty-item">No direct messages yet.</div>

      <div class="section-title" style="margin-top:12px;">Course Chats</div>
      <div
        v-for="c in courseChats"
        :key="c"
        class="friend"
        :class="{ active: activeCourse === c }"
        @click="openCourse(c)"
      >
        <span class="name">#{{ c }}</span>
      </div>
      <div v-if="!courseChats.length" class="empty-item">No course chats yet.</div>
    </aside>

    <main class="chat" v-if="activeFriend || activeCourse">
      <div class="chat-head">
        <div class="pill" v-if="activeFriend">DM</div>
        <div class="pill" v-else>Course</div>
        <div class="chat-title">{{ activeFriend ? (activeFriend.username || activeFriend.email) : `#${activeCourse}` }}</div>
      </div>

      <div class="messages" ref="messagesEl">
        <div
          v-if="!messages.length"
          class="empty-thread"
        >
          No messages yet — say hi 👋
        </div>

        <div
          v-for="m in messages"
          :key="m.id"
          class="row"
          :class="m.sender_id === myId ? 'right' : 'left'"
        >
          <div class="bubble">
            <div class="text">{{ m.content }}</div>
            <div class="meta">{{ new Date(m.created_at || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }}</div>
          </div>
        </div>
      </div>

      <div class="composer">
        <textarea
          v-model="newMessage"
          class="composer-input"
          rows="1"
          :placeholder="activeCourse ? `Message #${activeCourse}` : 'Type a message…'"
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.enter.shift.stop
        />
        <button class="send-btn" @click="sendMessage">Send</button>
      </div>
    </main>
    <main class="chat empty" v-if="!activeFriend && !activeCourse">
      <div class="empty-state">Select a friend or course to start chatting.</div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { supabase, currentUser } from '../services/supabase'
import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const loading = ref(true)

const me = currentUser
const friends = ref([]) 
const activeFriend = ref(null)
const messages = ref([])
const newMessage = ref('')

const quickTo = ref(null)
const quickText = ref('')
const unread = ref({}) // { [friendId]: number }

// local last seen map stored in localStorage to compute unread counts client-side
const LAST_SEEN_KEY = 'dm_last_seen'
const lastSeen = ref({})
function loadLastSeen() {
  try { lastSeen.value = JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || '{}') } catch { lastSeen.value = {} }
}
function saveLastSeen() {
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(lastSeen.value))
}

const myId = computed(() => currentUser.value?.id)

const messagesEl = ref(null)
function scrollToBottom() {
  requestAnimationFrame(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

async function waitForUserId(timeoutMs = 6000) {
  const start = Date.now()
  // try to fill from current session once
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user?.id && !currentUser.value?.id) {
      // preserve other profile fields if your store uses them
      currentUser.value = { ...(currentUser.value || {}), id: data.session.user.id }
    }
  } catch {}
  while (!myId.value && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 120))
  }
}

// react to auth changes so the page works after a fresh login
supabase.auth.onAuthStateChange((_e, sess) => {
  if (sess?.user?.id) {
    currentUser.value = { ...(currentUser.value || {}), id: sess.user.id }
  }
})

async function loadFriends() {
  if (!myId.value) { friends.value = []; return }
  const { data: rels, error: rerr } = await supabase
    .from('friends')
    .select('requester_id, addressee_id, status')
    .or(`requester_id.eq.${myId.value},addressee_id.eq.${myId.value}`)
    .eq('status', 'accepted')
  if (rerr) { console.warn('friends err', rerr); friends.value = []; return }
  const ids = [...new Set((rels || []).map(r => r.requester_id === myId.value ? r.addressee_id : r.requester_id))]
  if (!ids.length) { friends.value = []; return }
  const { data: profs, error: perr } = await supabase
    .from('profiles')
    .select('id, username, university, study_line')
    .in('id', ids)
  if (perr) { console.warn('profiles err', perr); friends.value = []; return }
  friends.value = profs || []
}

const courseChats = ref([]) // list of course codes the user is in
const activeCourse = ref('') // current course code if in course chat mode

function coerceCourses(val) {
  if (!val) return []
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'string') {
    // try JSON first
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
    } catch {}
    // fallback split by non-digits/letters
    return val.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
  }
  if (typeof val === 'object') {
    // handle jsonb object like {"0":"02456","1":"38103"}
    try { return Object.values(val).map(String).filter(Boolean) } catch { return [] }
  }
  return []
}

async function loadCourseChats() {
  if (!myId.value) { courseChats.value = []; return }
  const { data, error } = await supabase
    .from('profiles')
    .select('courses')
    .eq('id', myId.value)
    .maybeSingle()
  if (error) {
    console.warn('loadCourseChats error', error)
    courseChats.value = []
    return
  }
  courseChats.value = coerceCourses(data?.courses)
}

let channel = null
async function openChat(friend) {
  if (!myId.value) return
  activeFriend.value = friend
  activeCourse.value = ''
  const { data } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${myId.value},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${myId.value})`)
    .order('created_at', { ascending: true })
  messages.value = data || []
  scrollToBottom()

  markSeen(friend.id)
  await refreshUnread()

  if (channel) supabase.removeChannel(channel)
  channel = supabase
    .channel('messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if ((m.sender_id === myId.value && m.receiver_id === friend.id) || (m.receiver_id === myId.value && m.sender_id === friend.id)) {
        messages.value.push(m)
        scrollToBottom()
      }
    })
    .subscribe()
  // also listen globally for messages to increment unread when not in the open chat
}

let courseChannel = null
async function openCourse(code) {
  if (!code) return;
  activeFriend.value = null
  activeCourse.value = code
  const { data } = await supabase
    .from('course_messages')
    .select('*')
    .eq('course', code)
    .order('created_at', { ascending: true })
  messages.value = data || []
  scrollToBottom()

  if (channel) supabase.removeChannel(channel)
  if (courseChannel) supabase.removeChannel(courseChannel)
  courseChannel = supabase
    .channel(`course-${code}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'course_messages', filter: `course=eq.${code}` }, payload => {
      messages.value.push(payload.new)
      scrollToBottom()
    })
    .subscribe()
}

async function sendMessage() {
  if (!myId.value) { router.push('/profile'); return }
  const text = (newMessage.value || '').trim()
  if (!text) return
  if (activeCourse.value) {
    await supabase.from('course_messages').insert({
      course: activeCourse.value,
      sender_id: myId.value,
      content: text
    })
  } else if (activeFriend.value) {
    await supabase.from('messages').insert({
      sender_id: myId.value,
      receiver_id: activeFriend.value.id,
      content: text
    })
  } else {
    return
  }
  newMessage.value = ''
}

function markSeen(friendId) {
  lastSeen.value[friendId] = new Date().toISOString()
  saveLastSeen()
  unread.value[friendId] = 0
}

async function refreshUnread() {
  if (!friends.value.length) return
  for (const f of friends.value) {
    const since = lastSeen.value[f.id] || '1970-01-01T00:00:00Z'
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', myId.value)
      .eq('sender_id', f.id)
      .gt('created_at', since)
    unread.value[f.id] = count || 0
  }
}

async function sendQuick() {
  if (!myId.value) { router.push('/profile'); return }
  const toId = quickTo.value || (friends.value[0] && friends.value[0].id)
  if (!toId || !quickText.value.trim()) return
  await supabase.from('messages').insert({ sender_id: myId.value, receiver_id: toId, content: quickText.value })
  quickText.value = ''
  // if you're not in this chat, bump its unread because a reply might come back; unread is handled on receive
}

let globalChannel = null
function startGlobalSub() {
  if (globalChannel) supabase.removeChannel(globalChannel)
  globalChannel = supabase
    .channel('messages-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if (m.receiver_id === myId.value) {
        // if it's not the currently open chat, bump unread
        if (!activeFriend.value || m.sender_id !== activeFriend.value.id) {
          unread.value[m.sender_id] = (unread.value[m.sender_id] || 0) + 1
        }
      }
    })
    .subscribe()
}

onMounted(async () => {
  await waitForUserId()
  if (!myId.value) { loading.value = false; router.push('/profile'); return }
  loadLastSeen()
  await loadFriends()
  await loadCourseChats()
  if (!route.query.to && !activeFriend.value && !activeCourse.value && courseChats.value.length) {
    openCourse(courseChats.value[0])
  }
  console.log('[Messages] myId', myId.value, 'friends', friends.value, 'courses', courseChats.value)
  await refreshUnread()
  if (!quickTo.value && friends.value.length) quickTo.value = friends.value[0].id
  startGlobalSub()
  const to = route.query.to
  if (to && friends.value.length) {
    const f = friends.value.find(x => x.id === to)
    if (f) openChat(f)
  }
  loading.value = false
})
</script>

<style scoped>
.messages-page { display:flex; min-height:calc(100vh - 80px); background: transparent; }
.quick-compose { position: sticky; top: 0; z-index: 2; display:flex; gap:8px; padding:10px; border-bottom:1px solid #333; align-items:center; background: rgba(16,17,24,0.8); backdrop-filter: blur(6px); }
.qc-select { min-width: 180px; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:8px; padding:6px 8px; }
.qc-input { flex:1; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:8px; padding:8px 10px; }
.qc-send { background:#3d6df3; border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; }

.friends-list { width: 280px; border-right:1px solid #2b2e3a; padding:8px; overflow-y:auto; background: rgba(255,255,255,0.02); }
.section-title { font-size:12px; text-transform:uppercase; letter-spacing:.08em; opacity:.7; margin:6px 4px; }
.friend { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; cursor:pointer; transition: background .15s ease; }
.friend:hover { background: rgba(255,255,255,0.06); }
.friend.active { background: rgba(61,109,243,0.15); border: 1px solid rgba(61,109,243,0.35); }
.friend .name { font-weight:500; }
.friend .badge { background:#e35d6a; color:#fff; border-radius:10px; padding:2px 6px; font-size:12px; }

.chat { flex:1; display:flex; flex-direction:column; }
.chat-head { position: sticky; top: 0; z-index:1; display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid #2b2e3a; background: rgba(16,17,24,0.8); backdrop-filter: blur(6px); }
.pill { font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.06); }
.chat-title { font-weight:600; }

.messages { flex:1; overflow-y:auto; padding:16px 14px; display:flex; flex-direction:column; gap:10px; }
.row { display:flex; }
.row.left { justify-content:flex-start; }
.row.right { justify-content:flex-end; }
.bubble { max-width: 70%; background:#232633; border:1px solid #2f3444; padding:10px 12px; border-radius:12px; line-height:1.4; color:#e7e9f3; }
.row.right .bubble { background:#2b3566; border-color:#3a4aa3; }
.bubble .meta { margin-top:6px; font-size:11px; opacity:.65; }
.empty-thread { opacity:.7; font-size:14px; text-align:center; margin-top:18px; }

.composer { position: sticky; bottom: 0; display:flex; gap:8px; padding:10px 12px; border-top:1px solid #2b2e3a; background: rgba(16,17,24,0.8); backdrop-filter: blur(6px); }
.composer-input { flex:1; resize: vertical; min-height: 38px; max-height: 160px; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:10px; padding:10px 12px; }
.send-btn { background:#3d6df3; border:none; color:#fff; padding:10px 16px; border-radius:10px; cursor:pointer; }

.chat.empty { display:grid; place-items:center; color:#aab; }
.empty-state { opacity:.8; }
</style>