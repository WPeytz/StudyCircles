<template>
  <div class="messages-page">
    <!-- render-hint --><span class="render-hint" aria-hidden="true" style="position:absolute;left:-9999px;">messages-mounted</span>
    <aside class="friends-list">
      <div class="section-title">Direct Messages</div>
      <div class="quick-dm">
        <select v-model="quickTo" class="qc-select" @change="onSelectFriend">
          <option value="" disabled>Select friend…</option>
          <option v-for="f in friends" :key="f.id" :value="f.id">{{ f.username || f.email }}</option>
        </select>
      </div>
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
        <span class="name">#{{ c }}<template v-if="courseTitles[c]"> — {{ courseTitles[c] }}</template></span>
      </div>
      <div v-if="!courseChats.length" class="empty-item">No course chats yet.</div>
    </aside>

    <main class="chat" v-if="activeFriend || activeCourse">
      <div class="chat-head">
        <div class="pill" v-if="activeFriend">DM</div>
        <div class="pill" v-else>Course</div>
        <div class="chat-title">{{ activeFriend ? (activeFriend.username || activeFriend.email) : ('#' + activeCourse + (courseTitles[activeCourse] ? ' — ' + courseTitles[activeCourse] : '')) }}</div>
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
          <RouterLink
            v-if="m.sender_id !== myId"
            class="avatar"
            :to="{ path: '/profile', query: { user: m.sender_id } }"
            :title="(profileFor(m.sender_id)?.username || profileFor(m.sender_id)?.email || 'View profile')"
          >
            <img v-if="avatarUrlFor(m.sender_id)" :src="avatarUrlFor(m.sender_id)" alt="avatar" />
            <span v-else>{{ (profileFor(m.sender_id)?.username || profileFor(m.sender_id)?.email || 'U').slice(0,1).toUpperCase() }}</span>
          </RouterLink>
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
import { ref, onMounted, computed, watch } from 'vue'
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

// Helper to push unique messages by id
function pushUniqueMessage(arr, msg) {
  if (!msg || !msg.id) return
  if (!Array.isArray(arr)) return
  if (arr.findIndex(x => x.id === msg.id) === -1) arr.push(msg)
}
const newMessage = ref('')

const quickTo = ref('')
const quickText = ref('')
const unread = ref({}) // { [friendId]: number }


// Cache sender profiles for avatars/usernames
const senderProfiles = ref({}) // { [userId]: { id, username, email, avatar_url, avatarPublicUrl } }

function profileFor(id) {
  return senderProfiles.value[id] || null
}
function avatarUrlFor(id) {
  const p = profileFor(id)
  return p?.avatarPublicUrl || null
}

async function loadSenderProfiles(msgs = []) {
  const ids = Array.from(new Set((msgs || []).map(m => m.sender_id).filter(Boolean)))
    .filter(id => !senderProfiles.value[id])
  if (!ids.length) return
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, email, avatar_url')
    .in('id', ids)
  if (error) return
  for (const r of (data || [])) {
    let avatarPublicUrl = null
    if (r.avatar_url) {
      try {
        if (typeof r.avatar_url === 'string' && /^https?:\/\//i.test(r.avatar_url)) {
          avatarPublicUrl = r.avatar_url
        } else {
          // accept either `avatars/xyz.png` or just `xyz.png` as stored path
          const rawPath = String(r.avatar_url)
          const path = rawPath.startsWith('avatars/') ? rawPath.slice('avatars/'.length) : rawPath
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
          avatarPublicUrl = pub?.publicUrl || null
        }
      } catch {}
    }
    senderProfiles.value[r.id] = { ...r, avatarPublicUrl }
  }
}

// Helper to ensure a friend by id is present in the friends list and senderProfiles cache
async function ensureFriendById(id) {
  if (!id) return null;
  // already present?
  const existing = friends.value.find(x => x.id === id)
  if (existing) return existing
  // fetch profile
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, university, study_line, email, avatar_url')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  // push into friends list as an ad‑hoc entry so the DM UI can open
  if (!friends.value.some(x => x.id === data.id)) {
    friends.value = [...friends.value, data]
  }
  // also warm avatar cache
  senderProfiles.value[id] = {
    id: data.id,
    username: data.username,
    email: data.email,
    avatar_url: data.avatar_url,
    avatarPublicUrl: (function () {
      if (!data.avatar_url) return null
      if (/^https?:\/\//i.test(data.avatar_url)) return data.avatar_url
      const rawPath = String(data.avatar_url)
      const path = rawPath.startsWith('avatars/') ? rawPath.slice('avatars/'.length) : rawPath
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      return pub?.publicUrl || null
    })()
  }
  return data
}

async function onSelectFriend() {
  const id = quickTo.value && String(quickTo.value)
  if (!id) return
  let f = friends.value.find(x => x.id === id)
  if (!f) {
    f = await ensureFriendById(id)
  }
  if (f) {
    openChat(f)
  }
}

// react to `?to=<friendId>` even if friends load slightly later or list is empty
const toParam = computed(() => (route.query?.to ? String(route.query.to) : null))
watch([toParam, friends], async ([to, list]) => {
  if (!to) return
  // If friend list hasn't loaded the target yet, fetch it so we can open the chat
  let f = (Array.isArray(list) ? list : []).find(x => x.id === to)
  if (!f) {
    f = await ensureFriendById(to)
  }
  if (f) openChat(f)
}, { immediate: true })

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
  friends.value = []
  if (!myId.value) return

  const idSet = new Set()

  // Try 1: a mutual-rows table with requester/addressee
  try {
    const { data: rels, error } = await supabase
      .from('friends')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${myId.value},addressee_id.eq.${myId.value}`)
      .eq('status', 'accepted')

    if (!error && Array.isArray(rels)) {
      for (const r of rels) idSet.add(r.requester_id === myId.value ? r.addressee_id : r.requester_id)
    }
  } catch (e) {
    console.warn('[Friends] friends(requester/addressee) not available:', e?.message || e)
  }

  // Try 2: a simple edge table (user_id, friend_id)
  if (!idSet.size) {
    try {
      const { data: edges, error } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .or(`user_id.eq.${myId.value},friend_id.eq.${myId.value}`)

      if (!error && Array.isArray(edges)) {
        for (const r of edges) idSet.add(r.user_id === myId.value ? r.friend_id : r.user_id)
      }
    } catch (e) {
      console.warn('[Friends] friends(user_id/friend_id) not available:', e?.message || e)
    }
  }

  // Try 3: a table named `friendships` (user_id, friend_id)
  if (!idSet.size) {
    try {
      const { data: edges, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${myId.value},friend_id.eq.${myId.value}`)
        .in('status', ['accepted', 'mutual'])

      if (!error && Array.isArray(edges)) {
        for (const r of edges) idSet.add(r.user_id === myId.value ? r.friend_id : r.user_id)
      }
    } catch (e) {
      // ignore
    }
  }

  // Try 4: fallback to friend_requests (sender_id/receiver_id) where status='accepted'
  if (!idSet.size) {
    try {
      const { data: reqs, error } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${myId.value},receiver_id.eq.${myId.value}`)
        .eq('status', 'accepted')

      if (!error && Array.isArray(reqs)) {
        for (const r of reqs) {
          const other = r.sender_id === myId.value ? r.receiver_id : r.sender_id
          if (other) idSet.add(other)
        }
      }
    } catch (e) {
      console.warn('[Friends] friend_requests (sender/receiver) fallback failed:', e?.message || e)
    }
  }

  // Try 5: derive contacts from messages table (anyone you've messaged with)
  if (!idSet.size) {
    try {
      const { data: msgs, error } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${myId.value},receiver_id.eq.${myId.value}`)
        .limit(200)

      if (!error && Array.isArray(msgs)) {
        for (const m of msgs) {
          const other = m.sender_id === myId.value ? m.receiver_id : m.sender_id
          if (other) idSet.add(other)
        }
      }
    } catch (e) {
      console.warn('[Friends] messages-derived contacts failed:', e?.message || e)
    }
  }

  if (!idSet.size) { friends.value = []; return }

  // Load the public profile rows for the resolved ids
  try {
    const ids = Array.from(idSet)
    const { data: profs, error } = await supabase
      .from('profiles')
      .select('id, username, university, study_line, email, avatar_url')
      .order('username', { ascending: true })
      .in('id', ids)

    if (error) {
      console.warn('[Friends] profiles error:', error)
      friends.value = []
    } else {
      friends.value = (profs || []).map(p => ({
        ...p,
        id: String(p.id)
      }))
    }
  } catch (e) {
    console.warn('[Friends] profiles query threw:', e)
    friends.value = []
  }
}

const courseChats = ref([]) // list of course codes the user is in
const activeCourse = ref('') // current course code if in course chat mode
const courseTitles = ref({})

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

async function fetchCourseTitles(codes = []) {
  if (!codes.length) { courseTitles.value = {}; return }
  const { data, error } = await supabase
    .from('courses')
    .select('code,title')
    .in('code', codes)
  if (error) { console.warn('fetchCourseTitles error', error); return }
  const map = {}
  for (const r of data || []) map[r.code] = r.title
  courseTitles.value = map
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
  await fetchCourseTitles(courseChats.value)
}

let channel = null
async function openChat(friend) {
  if (!myId.value) return
  // allow passing a string id
  const f = typeof friend === 'string' ? (friends.value.find(x => x.id === friend) || await ensureFriendById(friend)) : friend
  if (!f) return
  activeFriend.value = f
  activeCourse.value = ''
  const { data } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${myId.value},receiver_id.eq.${f.id}),and(sender_id.eq.${f.id},receiver_id.eq.${myId.value})`)
    .order('created_at', { ascending: true })
  messages.value = data || []
  // De-duplicate messages by id after initial fetch
  messages.value = Array.from(new Map(messages.value.map(m => [m.id, m])).values())
  await loadSenderProfiles(messages.value)
  scrollToBottom()

  markSeen(f.id)
  await refreshUnread()

  if (channel) supabase.removeChannel(channel)
  channel = supabase
    .channel('messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const m = payload.new
      if ((m.sender_id === myId.value && m.receiver_id === f.id) || (m.receiver_id === myId.value && m.sender_id === f.id)) {
        pushUniqueMessage(messages.value, m)
        loadSenderProfiles([m])
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
  // De-duplicate messages by id after initial fetch
  messages.value = Array.from(new Map(messages.value.map(m => [m.id, m])).values())
  await loadSenderProfiles(messages.value)
  scrollToBottom()

  if (channel) supabase.removeChannel(channel)
  if (courseChannel) supabase.removeChannel(courseChannel)
  courseChannel = supabase
    .channel(`course-${code}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'course_messages', filter: `course=eq.${code}` }, payload => {
      pushUniqueMessage(messages.value, payload.new)
      loadSenderProfiles([payload.new])
      scrollToBottom()
    })
    .subscribe()
}

async function sendMessage() {
  if (!myId.value) { router.push('/profile'); return }
  const text = (newMessage.value || '').trim()
  if (!text) return
  try {
    if (activeCourse.value) {
      const { data, error } = await supabase
        .from('course_messages')
        .insert({ course: activeCourse.value, sender_id: myId.value, content: text })
        .select('*')
        .single()
      if (error) throw error
      pushUniqueMessage(messages.value, data)
      scrollToBottom()
    } else if (activeFriend.value) {
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender_id: myId.value, receiver_id: activeFriend.value.id, content: text })
        .select('*')
        .single()
      if (error) throw error
      pushUniqueMessage(messages.value, data)
      loadSenderProfiles([data])
      scrollToBottom()
    } else {
      return
    }
    newMessage.value = ''
  } catch (e) {
    console.warn('sendMessage failed', e?.message || e)
  }
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
  const toId = quickTo.value || (friends.value[0] && friends.value[0].id) || (route.query.to && String(route.query.to))
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
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId.value}` }, payload => {
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
  if (!quickTo.value && friends.value.length) quickTo.value = String(friends.value[0].id)
  startGlobalSub()
  const to = route.query.to
  if (to) {
    const f = friends.value.find(x => x.id === to) || await ensureFriendById(String(to))
    if (f) openChat(f)
  }
  loading.value = false
})
</script>

<style scoped>
.messages-page { display:flex; min-height:calc(100vh - 80px); background: transparent; }
.qc-select { min-width: 180px; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:8px; padding:6px 8px; }
.qc-input { flex:1; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:8px; padding:8px 10px; }
.qc-send { background:#3d6df3; border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; }

.quick-dm { display:flex; flex-direction:column; gap:6px; margin:6px 4px 10px; }
.quick-dm .qc-select,
.quick-dm .qc-input { width:100%; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:8px; padding:8px 10px; }
.quick-dm .qc-send { align-self:flex-end; background:#3d6df3; border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; }

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
.row.left .bubble { margin-left: 6px; }
.row.right .bubble { margin-right: 6px; }
.bubble .meta { margin-top:6px; font-size:11px; opacity:.65; }
.empty-thread { opacity:.7; font-size:14px; text-align:center; margin-top:18px; }

.composer { position: sticky; bottom: 0; display:flex; gap:8px; padding:10px 12px; border-top:1px solid #2b2e3a; background: rgba(16,17,24,0.8); backdrop-filter: blur(6px); }
.composer-input { flex:1; resize: vertical; min-height: 38px; max-height: 160px; background:#1e1f27; color:#e6e9f0; border:1px solid #323542; border-radius:10px; padding:10px 12px; }
.send-btn { background:#3d6df3; border:none; color:#fff; padding:10px 16px; border-radius:10px; cursor:pointer; }

.chat.empty { display:grid; place-items:center; color:#aab; }
.empty-state { opacity:.8; }

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 8px;
  display: grid;
  place-items: center;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  text-decoration: none;
  color: #e7e9f3;
  flex: 0 0 auto;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>