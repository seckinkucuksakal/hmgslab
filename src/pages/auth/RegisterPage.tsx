import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../components/AuthLayout'
import { PasswordInput } from '../../components/PasswordInput'
import { supabase } from '../../lib/supabase'

export function RegisterPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    if (data.session) {
      navigate('/', { replace: true })
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <AuthLayout title="Kayıt ol">
        <p className="text-center text-sm text-gray-700">
          Kayıt başarılı. Giriş yapabilirsiniz.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-medium text-gray-900 hover:underline">
            Giriş sayfasına git
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Kayıt ol">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div>
          <label
            htmlFor="displayName"
            className="mb-1 block text-sm text-gray-700"
          >
            Görünen ad
          </label>
          <input
            id="displayName"
            type="text"
            required
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
        </div>

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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
          />
        </div>

        <PasswordInput
          id="password"
          label="Şifre"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          hint="En az 8 karakter"
        />

        <PasswordInput
          id="confirmPassword"
          label="Şifre tekrar"
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
          {loading ? 'Kaydediliyor…' : 'Kayıt ol'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Zaten hesabın var mı?{' '}
        <Link to="/login" className="font-medium text-gray-900 hover:underline">
          Giriş yap
        </Link>
      </p>
    </AuthLayout>
  )
}
