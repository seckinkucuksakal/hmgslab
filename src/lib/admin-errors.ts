import type { PostgrestError } from '@supabase/supabase-js'

export function getAdminErrorMessage(error: PostgrestError | Error | null): string {
  if (!error) return 'Bilinmeyen bir hata oluştu.'

  const message = error.message.toLowerCase()

  if (message.includes('unauthorized')) {
    return 'Bu işlem için yetkiniz yok.'
  }
  if (message.includes('results cannot publish before exam ends')) {
    return 'Sonuçlar sınav bitiş saatinden önce yayınlanamaz.'
  }
  if (message.includes('exactly 5 options')) {
    return 'HMGSlab soruları için beş seçenek zorunludur.'
  }
  if (message.includes('exactly one correct')) {
    return 'Tam olarak bir doğru cevap seçilmelidir.'
  }
  if (message.includes('question not found')) {
    return 'Soru bulunamadı.'
  }
  if (message.includes('foreign key')) {
    return 'Seçilen ders veya konu geçersiz.'
  }
  if (message.includes('duplicate key') || message.includes('unique')) {
    return 'Bu kayıt zaten mevcut.'
  }
  if (message.includes('check constraint') && message.includes('difficulty')) {
    return 'Geçersiz zorluk seviyesi.'
  }

  return 'İşlem tamamlanamadı. Lütfen bilgileri kontrol edin.'
}
