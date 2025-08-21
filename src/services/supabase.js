// src/services/supabase.js
import { createClient } from '@supabase/supabase-js'
import { ref } from 'vue'

// --- Read env (Vite only exposes variables prefixed with VITE_) ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Helpful guard so we fail early with a clear hint (instead of a white page)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error('[Supabase] Missing env. Make sure you have a .env with:', {
    VITE_SUPABASE_URL: SUPABASE_URL || '(missing)',
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? '(set)' : '(missing)'
  })
  throw new Error('Supabase env missing. Define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY then restart Vite.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Reactive auth state
export const currentUser = ref(null)
export const authReady = ref(false)
let _initPromise = null
let _unsub = null

export async function initAuth () {
  // Get current session once
  const { data: { session } } = await supabase.auth.getSession()
  currentUser.value = session?.user || null
  authReady.value = true

  // Listen for future changes
  if (_unsub) _unsub()
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
    currentUser.value = s?.user || null
  })
  _unsub = () => subscription?.unsubscribe()
}

export function ensureAuthInit () {
  if (!_initPromise) _initPromise = initAuth()
  return _initPromise
}

export async function getSession () {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}