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
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { AdminCatalogPage } from './pages/admin/AdminCatalogPage'
import { AdminEditExamPage } from './pages/admin/AdminEditExamPage'
import { AdminEditQuestionPage } from './pages/admin/AdminEditQuestionPage'
import { AdminExamsPage } from './pages/admin/AdminExamsPage'
import { AdminNewExamPage } from './pages/admin/AdminNewExamPage'
import { AdminNewQuestionPage } from './pages/admin/AdminNewQuestionPage'
import { AdminQuestionsPage } from './pages/admin/AdminQuestionsPage'
import { DenemelerPage } from './pages/DenemelerPage'
import { ExamLeaderboardPage } from './pages/ExamLeaderboardPage'
import { ExamCompletionPage } from './pages/exam/ExamCompletionPage'
import { ExamLobbyPage } from './pages/exam/ExamLobbyPage'
import { ExamResultPage } from './pages/exam/ExamResultPage'
import { ExamTakePage } from './pages/exam/ExamTakePage'
import { HomePage } from './pages/HomePage'
import { PerformansPage } from './pages/PerformansPage'
import { ProfilPage } from './pages/ProfilPage'
import { SonuclarPage } from './pages/SonuclarPage'
import { SonucDetailPage } from './pages/SonucDetailPage'
import { CookieConsent } from './components/CookieConsent'
import {
  CerezPolitikasiPage,
  GizlilikPage,
  KullanimKosullariPage,
  KvkkPage,
} from './pages/legal/LegalPages'

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <ServerClockProvider>
          <Routes>
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
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
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/sorular" replace />} />
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
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestRoute>
                <ForgotPasswordPage />
              </GuestRoute>
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/kvkk" element={<KvkkPage />} />
          <Route path="/gizlilik" element={<GizlilikPage />} />
          <Route path="/cerez-politikasi" element={<CerezPolitikasiPage />} />
          <Route path="/kullanim-kosullari" element={<KullanimKosullariPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <CookieConsent />
        </ServerClockProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
