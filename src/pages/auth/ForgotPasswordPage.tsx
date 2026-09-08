import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../../components/AuthLayout'
import { supabase } from '../../lib/supabase'
import { getAuthErrorMessage } from '../../lib/auth-errors'
import { routes } from '../../lib/routes'
import { authResetPasswordRedirectTo } from '../../lib/site-url'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authResetPasswordRedirectTo,
    })

    setLoading(false)

    if (error) {
      setError(getAuthErrorMessage(error))
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <AuthLayout title="Şifremi unuttum">
        <p className="text-center text-sm text-gray-700">
          Şifre sıfırlama bağlantısı e-posta adresine gönderildi.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to={routes.giris} className="font-medium text-gray-900 hover:underline">
            Giriş sayfasına dön
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Şifremi unuttum">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <p className="text-sm text-gray-600">
          E-posta adresini gir; şifre sıfırlama bağlantısı gönderelim.
        </p>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-gray-700">
            E-posta
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Gönderiliyor…' : 'Bağlantı gönder'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link to={routes.giris} className="text-gray-600 hover:underline">
          Giriş sayfasına dön
        </Link>
      </p>
    </AuthLayout>
  )
}
