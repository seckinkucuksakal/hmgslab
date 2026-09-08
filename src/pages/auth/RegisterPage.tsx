import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../components/AuthLayout'
import { PasswordInput } from '../../components/PasswordInput'
import { supabase } from '../../lib/supabase'
import { getAuthErrorMessage } from '../../lib/auth-errors'
import { routes } from '../../lib/routes'

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 60

type Step = 'form' | 'verify'

export function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('form')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendCooldown])

  const startResendCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmedName = displayName.trim()
    const trimmedEmail = email.trim()

    if (trimmedName.length < 2) {
      setError('Görünen ad en az 2 karakter olmalıdır.')
      return
    }

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: { display_name: trimmedName },
      },
    })

    setLoading(false)

    if (signUpError) {
      setError(getAuthErrorMessage(signUpError))
      return
    }

    if (data.session) {
      navigate(routes.home, { replace: true })
      return
    }

    setOtp('')
    setStep('verify')
    startResendCooldown()
  }

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const trimmedOtp = otp.replace(/\D/g, '')
    if (trimmedOtp.length !== OTP_LENGTH) {
      setError(`Doğrulama kodu ${OTP_LENGTH} haneli olmalıdır.`)
      return
    }

    setLoading(true)

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: trimmedOtp,
      type: 'signup',
    })

    setLoading(false)

    if (verifyError) {
      setError(getAuthErrorMessage(verifyError))
      return
    }

    if (data.session) {
      navigate(routes.home, { replace: true })
    }
  }

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return

    setError(null)
    setLoading(true)

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    })

    setLoading(false)

    if (resendError) {
      setError(getAuthErrorMessage(resendError))
      return
    }

    setOtp('')
    startResendCooldown()
  }

  if (step === 'verify') {
    return (
      <AuthLayout title="E-posta doğrulama">
        <p className="mb-4 text-center text-sm text-gray-600">
          <span className="font-medium text-gray-900">{email.trim()}</span>{' '}
          adresine gönderilen {OTP_LENGTH} haneli kodu girin.
        </p>

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="otp" className="mb-1 block text-sm text-gray-700">
              Doğrulama kodu
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              required
              maxLength={OTP_LENGTH}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.35em] outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== OTP_LENGTH}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Doğrulanıyor…' : 'Doğrula ve giriş yap'}
          </button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm">
          <p>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={loading || resendCooldown > 0}
              className="font-medium text-gray-900 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              {resendCooldown > 0
                ? `Yeni kod ${resendCooldown} sn sonra gönderilebilir`
                : 'Kodu tekrar gönder'}
            </button>
          </p>
          <p>
            <button
              type="button"
              onClick={() => {
                setStep('form')
                setOtp('')
                setError(null)
                setResendCooldown(0)
              }}
              className="text-gray-600 hover:underline"
            >
              Kayıt formuna dön
            </button>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Kayıt ol">
      <form onSubmit={handleRegister} className="space-y-4">
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
            maxLength={60}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
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
        <Link to={routes.giris} className="font-medium text-gray-900 hover:underline">
          Giriş yap
        </Link>
      </p>
    </AuthLayout>
  )
}
