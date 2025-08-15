<template>
  <div class="container">
    <div class="card" style="display:grid; gap:12px;">
      <h1>Ask a Question</h1>
      <textarea v-model="prompt" rows="5" class="input" placeholder="Ask about a concept or past exam problem..."></textarea>
      <div style="display:flex; gap:8px; align-items:center;">
        <input v-model="course" class="input" placeholder="Course (optional)" style="flex:1" />
        <button class="button" @click="submit" :disabled="!prompt">Ask</button>
      </div>
      <div v-if="loading" class="small">Thinking…</div>
      <div v-if="notice" class="small">{{ notice }}</div>
      <div v-if="answer" class="card">
        <h2>Draft Answer</h2>
        <div style="white-space:pre-wrap">{{ answer }}</div>
        <div class="small">AI answers can be wrong — verify with peers.</div>
      </div>
      <div class="card" style="display:grid; gap:10px;">
        <h2>Recent Questions</h2>
        <div v-if="questions.length === 0" class="small">No questions yet. Be the first to ask!</div>
        <div v-for="q in questions" :key="q.id" class="card" style="display:flex; gap:12px; align-items:flex-start;">
          <div style="width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12);">
            {{ initials(q.display_name || q.email) }}
          </div>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; gap:12px;">
              <div style="font-weight:600;">{{ q.display_name || q.email || 'Anonymous' }}</div>
              <div class="small">{{ formatTime(q.created_at) }}</div>
            </div>
            <div class="small" v-if="q.course">Course: {{ q.course }}</div>
            <div style="white-space:pre-wrap; margin-top:6px;">{{ q.body }}</div>
            <div class="small" style="margin-top:10px; opacity:.8;">Answers</div>
            <div v-if="(answersByQ[q.id] || []).length === 0" class="small">No answers yet.</div>
            <div v-for="a in (answersByQ[q.id] || [])" :key="a.id" class="card" style="margin-top:6px;">
              <div style="display:flex; justify-content:space-between;">
                <div style="font-weight:600;">{{ a.display_name || 'Anonymous' }}</div>
                <div class="small">{{ formatTime(a.created_at) }}</div>
              </div>
              <div style="white-space:pre-wrap; margin-top:4px;">{{ a.body }}</div>
            </div>

            <div style="display:flex; gap:6px; align-items:flex-start; margin-top:8px;">
              <textarea v-model="replyBody[q.id]" rows="3" class="input" placeholder="Write an answer..." style="flex:1; padding:8px;"></textarea>
              <button class="button" @click="postAnswer(q.id)" :disabled="!replyBody[q.id]" style="padding:6px 12px; font-size:0.85rem; height:fit-content; align-self:center;">Reply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { askAI } from '../services/ai'
import { onMounted } from 'vue'
import { supabase } from '../services/supabase'

const prompt = ref('')
const course = ref('')
const loading = ref(false)
const answer = ref('')
const questions = ref([])
const notice = ref('')

const answersByQ = reactive({})   // { [question_id]: AnswerRow[] }
const replyBody = reactive({})     // { [question_id]: string }

function formatTime(iso) {
  try { return new Date(iso).toLocaleString() } catch { return '' }
}
function initials(name) {
  if (!name) return 'U'
  const parts = String(name).trim().split(/\s+/)
  const a = parts[0]?.[0] || ''
  const b = parts[1]?.[0] || ''
  return (a + b).toUpperCase() || 'U'
}

async function submit() {
  loading.value = true
  answer.value = ''
  notice.value = ''
  try {
    // 1) call AI (mock or endpoint)
    const res = await askAI({ prompt: prompt.value, course: course.value })
    answer.value = res.answer || '(No answer returned)'

    // 2) persist question in Supabase and return inserted row
    let inserted = null
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser()
      const display_name = user?.user_metadata?.full_name || user?.email || null
      const { data: row, error: insertErr } = await supabase
        .from('questions')
        .insert({
          body: String(prompt.value || '').trim(),
          course: course.value || null,
          user_id: user?.id || null,
          display_name
        })
        .select('id, body, course, display_name, created_at, user_id')
        .single()

      if (insertErr) {
        console.error('Insert question failed:', insertErr)
        notice.value = `Couldn't save question: ${insertErr.message}`
      } else {
        inserted = row
        notice.value = 'Question posted!'
      }
    }

    // 3) update feed
    if (inserted) {
      questions.value.unshift(inserted)
    } else {
      await fetchQuestions()
    }

    // 4) clear inputs
    prompt.value = ''
    // keep course filled for convenience
  } catch (e) {
    console.error(e)
    answer.value = 'Error contacting AI endpoint. Configure /services/ai.js.'
    notice.value = 'There was an error posting your question.'
  } finally {
    loading.value = false
    // auto-clear notice after a few seconds
    setTimeout(() => { notice.value = '' }, 3000)
  }
}

async function fetchQuestions() {
  if (!supabase) return
  const { data, error } = await supabase
    .from('questions')
    .select('id, body, course, display_name, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('Fetch questions failed:', error)
    return
  }
  questions.value = data || []
  // Load answers for each question
  for (const q of questions.value) {
    await fetchAnswers(q.id)
  }
}

async function fetchAnswers(questionId) {
  if (!supabase) return
  const { data, error } = await supabase
    .from('answers')
    .select('id, question_id, body, display_name, created_at, user_id')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Fetch answers failed:', error)
    return
  }
  answersByQ[questionId] = data || []
}

async function postAnswer(questionId) {
  const body = String(replyBody[questionId] || '').trim()
  if (!body) return
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  const display_name = user?.user_metadata?.full_name || user?.email || null
  const { data, error } = await supabase
    .from('answers')
    .insert({ question_id: questionId, body, user_id: user?.id || null, display_name })
    .select('id, question_id, body, display_name, created_at, user_id')
    .single()
  if (error) {
    console.error('Insert answer failed:', error)
    notice.value = `Couldn't post answer: ${error.message}`
    return
  }
  if (!answersByQ[questionId]) answersByQ[questionId] = []
  answersByQ[questionId].push(data)
  replyBody[questionId] = ''
}

onMounted(() => {
  fetchQuestions()
  if (supabase) {
    const channel = supabase.channel('questions-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, payload => {
        const row = payload.new
        questions.value.unshift(row)
      })
      .subscribe()

    const answersChannel = supabase.channel('answers-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' }, payload => {
        const a = payload.new
        if (!answersByQ[a.question_id]) answersByQ[a.question_id] = []
        answersByQ[a.question_id].push(a)
      })
      .subscribe()
  }
})
</script>