import { ref } from 'vue'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Helpful hint during development
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,           // keep user logged in across tab reloads and routes
        autoRefreshToken: true,         // refresh session automatically
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        detectSessionInUrl: true,
      },
    })
  : null

export const currentUser = ref(null)

export function initAuth() {
  if (!supabase) return
  supabase.auth.getSession().then(({ data: { session } }) => {
    currentUser.value = session?.user || null
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser.value = session?.user || null
  })
}

// Optional helpers used by pages
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}