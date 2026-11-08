import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
import { AuthProvider } from './components/AuthProvider'
import { ThemeProvider } from './hooks/useTheme'
import { GuestRoute } from './components/GuestRoute'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { ExamLayout } from './components/layout/ExamLayout'
import { ServerClockProvider } from './hooks/useServerClock'
import { CookieConsent } from './components/CookieConsent'
import { ConfirmProvider } from './components/ConfirmDialog'
import { routes } from './lib/routes'

// Pages load on demand so the first paint ships only the shell, auth and routing.
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const AdminCatalogPage = lazy(() => import('./pages/admin/AdminCatalogPage').then((m) => ({ default: m.AdminCatalogPage })))
const AdminEditExamPage = lazy(() => import('./pages/admin/AdminEditExamPage').then((m) => ({ default: m.AdminEditExamPage })))
const AdminEditQuestionPage = lazy(() => import('./pages/admin/AdminEditQuestionPage').then((m) => ({ default: m.AdminEditQuestionPage })))
const AdminExamsPage = lazy(() => import('./pages/admin/AdminExamsPage').then((m) => ({ default: m.AdminExamsPage })))
const AdminNewExamPage = lazy(() => import('./pages/admin/AdminNewExamPage').then((m) => ({ default: m.AdminNewExamPage })))
const AdminNewQuestionPage = lazy(() => import('./pages/admin/AdminNewQuestionPage').then((m) => ({ default: m.AdminNewQuestionPage })))
const AdminQuestionsPage = lazy(() => import('./pages/admin/AdminQuestionsPage').then((m) => ({ default: m.AdminQuestionsPage })))
const DenemelerPage = lazy(() => import('./pages/DenemelerPage').then((m) => ({ default: m.DenemelerPage })))
const ExamLeaderboardPage = lazy(() => import('./pages/ExamLeaderboardPage').then((m) => ({ default: m.ExamLeaderboardPage })))
const ExamCompletionPage = lazy(() => import('./pages/exam/ExamCompletionPage').then((m) => ({ default: m.ExamCompletionPage })))
const ExamLobbyPage = lazy(() => import('./pages/exam/ExamLobbyPage').then((m) => ({ default: m.ExamLobbyPage })))
const ExamResultPage = lazy(() => import('./pages/exam/ExamResultPage').then((m) => ({ default: m.ExamResultPage })))
const ExamTakePage = lazy(() => import('./pages/exam/ExamTakePage').then((m) => ({ default: m.ExamTakePage })))
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const PerformansPage = lazy(() => import('./pages/PerformansPage').then((m) => ({ default: m.PerformansPage })))
const ProfilPage = lazy(() => import('./pages/ProfilPage').then((m) => ({ default: m.ProfilPage })))
const SonuclarPage = lazy(() => import('./pages/SonuclarPage').then((m) => ({ default: m.SonuclarPage })))
const SonucDetailPage = lazy(() => import('./pages/SonucDetailPage').then((m) => ({ default: m.SonucDetailPage })))
const CerezPolitikasiPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.CerezPolitikasiPage })))
const GizlilikPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.GizlilikPage })))
const KullanimKosullariPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.KullanimKosullariPage })))
const KvkkPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.KvkkPage })))

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>
        <ServerClockProvider>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
                Yükleniyor…
              </div>
            }
          >
          <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path={routes.home} element={<HomePage />} />
            <Route path="/denemeler" element={<DenemelerPage />} />
            <Route path="/denemeler/:examId/lobi" element={<ExamLobbyPage />} />
            <Route
              path="/denemeler/:examId/siralama"
              element={<ExamLeaderboardPage />}
            />
            <Route path="/sonuclar" element={<SonuclarPage />} />
            <Route path="/sonuclar/:attemptId" element={<SonucDetailPage />} />
            <Route path="/performans" element={<PerformansPage />} />
            <Route path="/profil" element={<ProfilPage />} />
            {/* per-exam payment replaced the package page */}
            <Route path={routes.paketler} element={<Navigate to={routes.denemeler} replace />} />
          </Route>

          <Route
            element={
              <ProtectedRoute>
                <ExamLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/sinav/:attemptId" element={<ExamTakePage />} />
            <Route
              path="/sinav/:attemptId/tamamlandi"
              element={<ExamCompletionPage />}
            />
            <Route
              path="/sinav/:attemptId/sonuc"
              element={<ExamResultPage />}
            />
          </Route>

          <Route
            path={routes.yonetim}
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to={routes.yonetimSorular} replace />} />
            <Route path="sorular" element={<AdminQuestionsPage />} />
            <Route path="sorular/yeni" element={<AdminNewQuestionPage />} />
            <Route
              path="sorular/:questionId/duzenle"
              element={<AdminEditQuestionPage />}
            />
            <Route path="dersler" element={<AdminCatalogPage />} />
            <Route path="denemeler" element={<AdminExamsPage />} />
            <Route path="denemeler/yeni" element={<AdminNewExamPage />} />
            <Route path="denemeler/:examId" element={<AdminEditExamPage />} />
          </Route>

          <Route
            path={routes.giris}
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path={routes.kayit}
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route
            path={routes.sifremiUnuttum}
            element={
              <GuestRoute>
                <ForgotPasswordPage />
              </GuestRoute>
            }
          />
          <Route path={routes.sifreSifirla} element={<ResetPasswordPage />} />

          <Route path="/kvkk" element={<KvkkPage />} />
          <Route path="/gizlilik" element={<GizlilikPage />} />
          <Route path="/cerez-politikasi" element={<CerezPolitikasiPage />} />
          <Route path="/kullanim-kosullari" element={<KullanimKosullariPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </Suspense>
        <CookieConsent />
        </ServerClockProvider>
        </ConfirmProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
