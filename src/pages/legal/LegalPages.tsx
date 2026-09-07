import { LegalPageLayout } from '../../components/layout/LegalPageLayout'

export function KvkkPage() {
  return <LegalPageLayout title="KVKK Aydınlatma Metni" />
}

export function GizlilikPage() {
  return <LegalPageLayout title="Gizlilik Politikası" />
}

export function CerezPolitikasiPage() {
  return (
    <LegalPageLayout title="Çerez Politikası">
      <p className="rounded-md border border-gray-200 bg-white px-4 py-3 text-gray-600">
        Bu metin hukuk danışmanı tarafından hazırlanacaktır.
      </p>
      <p>
        HMGSlab şu an yalnızca oturum yönetimi ve temel site işlevleri için
        gerekli teknolojileri kullanmaktadır. Reklam, pazarlama veya davranışsal
        izleme amaçlı üçüncü taraf çerezler kullanılmamaktadır.
      </p>
      <p>
        Çerez bildirimi tercihiniz, tarayıcınızda yalnızca bildirimin
        görüntülendiğini kaydeden bir değer olarak saklanır; e-posta, şifre veya
        kimlik bilgisi içermez.
      </p>
    </LegalPageLayout>
  )
}

export function KullanimKosullariPage() {
  return <LegalPageLayout title="Kullanım Koşulları" />
}
