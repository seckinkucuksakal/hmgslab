import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { Profile } from '../types/profile'

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, role, show_in_leaderboard, created_at')
      .eq('id', user.id)
      .single()

    setProfile(data)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const displayName =
    profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Kullanıcı'

  const isAdmin = profile?.role === 'admin'

  return { profile, displayName, isAdmin, loading, refetch }
}
