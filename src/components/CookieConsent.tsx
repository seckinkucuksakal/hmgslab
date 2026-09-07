import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  acknowledgeCookieNotice,
  isCookieNoticeAcknowledged,
} from '../lib/cookie-consent'
import { SITE_NAME } from '../lib/brand'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!isCookieNoticeAcknowledged())
  }, [])

  if (!visible) return null

  const handleAccept = () => {
    acknowledgeCookieNotice()
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]"
      role="region"
      aria-label="Çerez bildirimi"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-gray-600">
          {SITE_NAME}, oturumunuzu güvenli şekilde sürdürebilmek ve temel site
          işlevlerini sağlayabilmek için gerekli teknolojileri kullanır.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            to="/cerez-politikasi"
            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            Çerez Politikası
          </Link>
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}
