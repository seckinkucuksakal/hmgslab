export type UserRole = 'user' | 'admin'

export type Profile = {
  id: string
  display_name: string
  role: UserRole
  show_in_leaderboard: boolean
  created_at: string
}
