import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PasswordInput } from '../components/PasswordInput'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import {
  changePassword,
  deleteOwnAccount,
  getProfileSettingsErrorMessage,
  updateDisplayName,
  updateLeaderboardVisibility,
} from '../lib/profile-settings'
import { routes } from '../lib/routes'
import { getMyAccess, type MyAccess } from '../lib/access'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-gray-900 dark:text-slate-100">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export function ProfilPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { profile, loading, refetch } = useProfile()

  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState<string | null>(null)
  const [nameLoading, setNameLoading] = useState(false)

  const [access, setAccess] = useState<MyAccess | null>(null)
  const [accessError, setAccessError] = useState(false)

  const loadAccess = () => {
    setAccessError(false)
    getMyAccess().then(setAccess).catch(() => setAccessError(true))
  }

  useEffect(() => {
    getMyAccess()
      .then(setAccess)
      .catch(() => setAccessError(true))
  }, [])

  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [visibilityLoading, setVisibilityLoading] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const closeDeleteModal = () => {
    if (deleteLoading) return
    setShowDeleteModal(false)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name)
    }
  }, [profile?.display_name])

  const handleDisplayNameSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return

    setNameError(null)
    setNameSuccess(null)
    setNameLoading(true)

    try {
      await updateDisplayName(user.id, displayName)
      await refetch()
      setNameSuccess('Görünen ad güncellendi.')
    } catch (error) {
      setNameError(getProfileSettingsErrorMessage(error))
    } finally {
      setNameLoading(false)
    }
  }

  const handleVisibilityChange = async (show: boolean) => {
    if (!user) return

    setVisibilityError(null)
    setVisibilityLoading(true)

    try {
      await updateLeaderboardVisibility(user.id, show)
      await refetch()
    } catch (error) {
      setVisibilityError(getProfileSettingsErrorMessage(error))
    } finally {
      setVisibilityLoading(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.email) return

    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('Yeni şifreler eşleşmiyor.')
      return
    }

    setPasswordLoading(true)

    try {
      await changePassword(user.email, currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
      setPasswordSuccess('Şifreniz güncellendi.')
    } catch (error) {
      setPasswordError(getProfileSettingsErrorMessage(error))
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== 'SİL') return

    setDeleteError(null)
    setDeleteLoading(true)

    try {
      await deleteOwnAccount()
      await signOut()
      navigate(routes.landing, { replace: true })
    } catch (error) {
      setDeleteError(getProfileSettingsErrorMessage(error))
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
          Profil ve Ayarlar
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
          Hesap bilgilerinizi ve uygulama tercihlerinizi yönetin.
        </p>
      </div>

      <SettingsSection
        title="Hesap"
        description="Temel profil bilgileriniz."
      >
        <form onSubmit={handleDisplayNameSubmit} className="space-y-4">
          {nameError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {nameError}
            </p>
          )}
          {nameSuccess && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
              {nameSuccess}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm text-gray-700 dark:text-slate-300"
            >
              E-posta
            </label>
            <input
              id="email"
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="mb-1 block text-sm text-gray-700 dark:text-slate-300"
            >
              Görünen ad
            </label>
            <input
              id="displayName"
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={nameLoading}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {nameLoading ? 'Kaydediliyor…' : 'Adı kaydet'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Paketim"
        description="Erişim durumunuz sunucuda belirlenir; bu ekran yalnızca onu gösterir."
      >
        {accessError ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Paket bilgisi yüklenemedi.{' '}
            <button type="button" onClick={loadAccess} className="font-medium underline">
              Yeniden dene
            </button>
          </p>
        ) : !access ? (
          <p className="text-sm text-gray-500">Yükleniyor…</p>
        ) : (
          <dl className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
            <div className="flex justify-between gap-4">
              <dt>Paket</dt>
              <dd className="font-medium">
                {access.status === 'free' ? 'Ücretsiz erişim' : (access.plan_name ?? '—')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Durum</dt>
              <dd className="font-medium">
                {{
                  free: 'Ücretsiz',
                  active: 'Aktif',
                  canceled: 'İptal edildi (süre sonuna kadar geçerli)',
                  expired: 'Süresi doldu',
                }[access.status]}
              </dd>
            </div>
            {access.ends_at && (
              <div className="flex justify-between gap-4">
                <dt>{access.status === 'expired' ? 'Bitiş' : 'Erişim bitiş tarihi'}</dt>
                <dd className="font-medium">
                  {formatIstanbulDateTimeShort(access.ends_at)}
                </dd>
              </div>
            )}
            {access.enforced && access.status === 'free' && (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Ücretsiz erişimde {access.free_exam_limit} deneme çözebilirsiniz
                ({access.free_exams_used} kullanıldı).
              </p>
            )}
            {access.history_locked && (
              <p className="text-xs text-red-700 dark:text-red-300">
                Paketiniz sona erdiği için geçmiş sonuçlar ve analizler kilitli;
                yenilediğinizde yeniden açılır.
              </p>
            )}
            {!access.enforced && (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Şu an tüm aktif denemeler ücretsizdir. Ücretli paketler henüz
                satışa açılmadı.
              </p>
            )}
          </dl>
        )}
      </SettingsSection>

      <SettingsSection
        title="Sıralama gizliliği"
        description="Bu denemenin katılımcıları arasındaki sıralamada diğer katılımcılara nasıl göründüğünüzü seçin."
      >
        {visibilityError && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {visibilityError}
          </p>
        )}
        <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={profile?.show_in_leaderboard ?? true}
            disabled={visibilityLoading}
            onChange={(event) => handleVisibilityChange(event.target.checked)}
          />
          <span>
            Sıralamada adımı göster
            <span className="mt-1 block text-xs text-gray-500 dark:text-slate-400">
              Kapalıyken diğer katılımcılar sizi “Gizli Kullanıcı” olarak görür.
              Kendi sıranızda adınızı her zaman görürsünüz.
            </span>
          </span>
        </label>
      </SettingsSection>

      <SettingsSection
        title="Görünüm"
        description="Uygulama temasını seçin."
      >
        <ThemeToggle />
      </SettingsSection>

      <SettingsSection
        title="Güvenlik"
        description="Şifrenizi güncelleyin."
      >
        {passwordSuccess && (
          <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
            {passwordSuccess}
          </p>
        )}

        {!showPasswordForm ? (
          <button
            type="button"
            onClick={() => {
              setShowPasswordForm(true)
              setPasswordError(null)
            }}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Şifre değiştir
          </button>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {passwordError}
              </p>
            )}

            <PasswordInput
              id="currentPassword"
              label="Mevcut şifre"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />

            <PasswordInput
              id="newPassword"
              label="Yeni şifre"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              minLength={8}
              hint="En az 8 karakter"
              required
            />

            <PasswordInput
              id="confirmPassword"
              label="Yeni şifre tekrar"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              minLength={8}
              required
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={passwordLoading}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {passwordLoading ? 'Güncelleniyor…' : 'Şifreyi güncelle'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setPasswordError(null)
                }}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200"
              >
                İptal
              </button>
            </div>
          </form>
        )}
      </SettingsSection>

      <SettingsSection
        title="Hesabı sil"
        description="Bu işlem geri alınamaz. Tüm deneme sonuçlarınız ve profil verileriniz kalıcı olarak silinir."
      >
        <button
          type="button"
          onClick={() => {
            setShowDeleteModal(true)
            setDeleteConfirmText('')
            setDeleteError(null)
          }}
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
        >
          Hesabımı sil
        </button>
      </SettingsSection>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-account-title"
              className="text-base font-semibold text-gray-900 dark:text-slate-100"
            >
              Hesabı silmek istediğinize emin misiniz?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
              Bu işlem geri alınamaz. Deneme sonuçlarınız, performans
              verileriniz ve profil bilgileriniz kalıcı olarak silinir.
            </p>

            {deleteError && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {deleteError}
              </p>
            )}

            <div className="mt-4">
              <label
                htmlFor="deleteConfirmText"
                className="mb-1 block text-sm text-gray-700 dark:text-slate-300"
              >
                Onaylamak için <strong>SİL</strong> yazın
              </label>
              <input
                id="deleteConfirmText"
                type="text"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="SİL"
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmText !== 'SİL'}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? 'Siliniyor…' : 'Evet, hesabı sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
