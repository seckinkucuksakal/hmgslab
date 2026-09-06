import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../components/AuthLayout'
import { PasswordInput } from '../../components/PasswordInput'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    navigate('/', { replace: true })
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Yükleniyor…
      </div>
    )
  }

  if (!session) {
    return (
      <AuthLayout title="Şifre sıfırla">
        <p className="text-center text-sm text-gray-700">
          Geçersiz veya süresi dolmuş bağlantı. Yeni bir sıfırlama bağlantısı
          iste.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link
            to="/forgot-password"
            className="font-medium text-gray-900 hover:underline"
          >
            Şifremi unuttum
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Yeni şifre belirle">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <PasswordInput
          id="password"
          label="Yeni şifre"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          hint="En az 8 karakter"
        />

        <PasswordInput
          id="confirmPassword"
          label="Yeni şifre tekrar"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={8}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
        </button>
      </form>
    </AuthLayout>
  )
}
