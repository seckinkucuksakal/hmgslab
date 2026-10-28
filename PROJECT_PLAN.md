# HMGSlab proje kapsamı ve geliştirme planı

Son güncelleme: 29 Ekim 2026

## Kullanıcının belirlediği sabit ders kapsamı

Bu liste kullanıcı tarafından verilmiştir. Platformdaki sorular aşağıdaki 19
ana ders/alan başlığından birine bağlı olmalıdır. Kullanıcı kapsamı
değiştirmedikçe yeni bir ana başlık eklenmemelidir. Alt konular bu derslerin
altında tanımlanabilir; kullanıcı henüz alt konu listesini belirlememiştir.

1. Anayasa Yargısı
2. İdare Hukuku
3. İdari Yargılama Usulü
4. Medeni Hukuk
5. Borçlar Hukuku
6. Ticaret Hukuku
7. Hukuk Yargılama Usulü
8. İcra ve İflas Hukuku
9. Ceza Hukuku
10. Ceza Yargılama Usulü
11. İş ve Sosyal Güvenlik Hukuku
12. Vergi Hukuku
13. Vergi Usul Hukuku
14. Avukatlık Hukuku
15. Hukuk Felsefesi ve Sosyolojisi
16. Türk Hukuk Tarihi
17. Milletlerarası Hukuk
18. Milletlerarası Özel Hukuk
19. Genel Kamu Hukuku

Soru oluşturma, ders filtreleri, deneme dağılımları ve performans analizlerinde
bu adlar ve sıralama esas alınacaktır. Derslere göre soru sayıları/ağırlıkları
henüz belirlenmemiştir; bu listeden bir dağılım kuralı türetilmemelidir.

Depodaki örnek verilerde bulunan `Anayasa Hukuku`, kullanıcının verdiği
`Anayasa Yargısı` başlığıyla aynı kabul edilmemelidir. Mevcut kapsam dışı
kayıtlar ilişkileriyle birlikte incelenmeli; veri kaybına veya yanlış ders
sınıflandırmasına neden olacak otomatik silme/yeniden adlandırma yapılmamalıdır.

## İnceleme durumu

Kaynak kod ve SQL migration dosyaları incelendi. Yerel açılış sayfası tarayıcıda
görüntülendi. Bitmiş sınav bağlantısı ve süresi dolan oturumun listeye
eşleştirilmesiyle ilgili iki hata, gerçek uygulama fonksiyonları ve taklit
servis yanıtlarıyla doğrulandı. Canlı veritabanının migration dosyalarıyla
birebir aynı olduğu ve üyelik gerektiren bütün akışların çalıştığı henüz
doğrulanmadı. Build başarılı; lint ve paket boyutu uyarıları bulunuyor.

Aşağıdaki fazlar önerilen uygulama sırasıdır. Bu belgeyi kaydetmek, fazların
uygulamasına başlandığı veya tamamlandığı anlamına gelmez.

## Faz 0 — Ders kapsamını standartlaştırma

- 19 dersin kalıcı kimliklerini, adlarını ve sıralamasını standartlaştır.
- Mevcut dersleri, alt konuları ve bağlı soruları karşılaştır; kapsam dışı
  örnek kayıtlar için veri kaybını önleyen dönüşüm planı hazırla.
- Soru oluşturma ve ders filtrelerini belirlenen kapsamla sınırla; kuralı
  veritabanında da uygula. Yönetici arayüzünde serbest ana ders ekleme akışını
  bu sabit kapsamla uyumlu hale getir.
- Alt konuların doğru derse bağlı olmasını koru.

Durum: Kod ve `20260308000000_standard_subject_catalog.sql` migration’ı hazır; canlı veritabanına
HENÜZ uygulanmadı. Kapsam dışı eski dersler (ör. `Anayasa Hukuku`) elle sınıflandırılmayı bekler.

Tamamlanma ölçütü: Yeni sorular yalnızca bu 19 dersten birine bağlanabilir;
filtreler aynı adları gösterir ve mevcut soru ilişkileri korunur.

## Faz 1 — Cevap kaydı ve sınavın güvenilir tamamlanması

- Tek cevaplık bekleme alanını soru bazında, en güncel seçimi koruyan kayıt
  kuyruğuyla değiştir; geç dönen isteklerin yeni cevapların üzerine yazmasını önle.
- Bağlantı durumunu, bekleyen kayıt sayısını ve kayıt başarısını göster.
- Kullanıcı sınavı bitirirken devam eden kayıtları koordine et; kayıtları
  doğrulanmamış cevapları gönderilmiş gibi gösterme. Süre sonrasında sunucuya
  ulaşan cevapların kabul edilmemesi kuralını koru.
- Sayfa yenileme ve bağlantı geri gelme durumları için kurtarma davranışını
  belirle; kullanıcıya kayıt durumunu açıkça bildir.
- Bitmiş/süresi dolmuş sınavlarda önce durum kontrolü yapıp doğru sonuç veya
  bekleme ekranına yönlendir; süre dolumunda cevap girişini durdur.

Tamamlanma ölçütü: Bağlantı kesintisinde birden fazla cevap, hızlı cevap
değiştirme, kayıt sürerken bitirme ve süre dolumu senaryolarında ekranda
gösterilen kayıt durumu sunucudaki verilerle tutarlıdır.

## Faz 2 — Sonuç gizliliği ve sıralama doğruluğu

- Sonuç açıklanma saati kontrolünü sıralama dahil bütün sonuç servislerine uygula.
- Doğrudan tablo erişim izinlerini incele; puan ve doğru/yanlış sayılarının
  açıklanma saatinden önce başka bir yoldan okunmasını engelle.
- Yetkilendirme, kendi/başkasının sonucu, erken sonuç erişimi ve yönetici
  sonuç yayımlama akışlarını doğrula.
- Profilde sıralamada adını gösterme/gizleme ayarı sun.
- Sıralamanın platformdaki ilgili denemenin katılımcıları arasında olduğunu
  metinlerde açıkça belirt.

Tamamlanma ölçütü: Sonuçlar açıklanana kadar kullanıcı arayüzü, doğrudan
bağlantılar ve servis çağrıları aynı gizlilik kuralını uygular.

## Faz 3 — Yönetici işlemleri ve sınav içeriğinin sabitlenmesi

- Deneme bilgileri ve soru bağlantılarını tek veritabanı işlemiyle kaydet;
  hata halinde tüm değişiklikleri geri al.
- Yayımlanan/başlayan sınavın soru, seçenek ve cevap anahtarı sürümünü sabitle;
  sonraki soru bankası düzenlemeleri bu sınavın değerlendirmesini değiştirmesin.
- Sınav başladıktan sonra takvim, süre ve içerik düzenleme kurallarını tanımla.
- Yönetici panelinde ders başına soru sayılarını ve toplam dağılımı göster;
  kullanıcıdan gelmeyen zorunlu ağırlıklar ekleme.
- Taslak/yayında ayrımını ve yayımlamadan önce içerik kontrollerini netleştir.

Tamamlanma ölçütü: Yarıda kalan kayıt bir denemeyi sorusuz bırakmaz;
aynı sınav sürümündeki katılımcılar aynı içerik ve cevap anahtarıyla değerlendirilir.

## Faz 4 — Listeleme, arama ve performans verileri

- Soru bankası aramasını bütün kayıtları kapsayan veritabanı sorgularına taşı;
  sayfalama ekle. İlk 500 kayıt sınırı nedeniyle sorular görünmez kalmasın.
- Sonuç geçmişine sayfalama ekle; ilk 20 sonuçtan eski denemelere erişim sağla.
- Deneme durumlarını sayfa açıkken ve kullanıcı sayfaya döndüğünde güncelle;
  süresi dolan oturumu devam ediyor gibi işaretleme.
- Sınav başına sırayla yapılan durum çağrılarını toplu sorguyla azalt.
- Performans ekranında 19 ders ve bunlara bağlı konular için hesaplanan
  istatistikleri görünür kıl; veri yokluğu ile yükleme hatasını ayır.

Tamamlanma ölçütü: Eski kayıtlar aranabilir ve açılabilir; sınav durumu
yenileme gerektirmeden güncellenir; ders/konu analizleri doğru kapsamı kullanır.

## Faz 5 — Öğrenci deneyimi ve tanıtım

- Sınavda sonra dönmek üzere soru işaretleme ve yalnızca boş/işaretli sorulara
  geçiş ekle; bitirme özetinde boş ve kaydedilmemiş cevapları göster.
- Mobil sınav gezinmesini, klavye kullanımını, iletişim kutularının odak
  yönetimini ve açık/koyu tema okunabilirliğini doğrula.
- Açılış sayfasında örnek sınav ve analiz ekranlarıyla ürünün işleyişini anlat.
- Ödeme öncesi paket düğmelerinin ve açıklamalarının gerçek işlevle uyumunu sağla.
- Yükleme hatalarında anlaşılır açıklama ve yeniden deneme olanağı sun.

Tamamlanma ölçütü: Kayıt, deneme seçimi, sınav, bitirme ve sonuç inceleme
akışları masaüstü ve mobilde açık ve tutarlı şekilde tamamlanabilir.

## Faz 6 — Ücretlendirme ve yayına hazırlık

- Ödeme sağlayıcısı ve paket hakları belirlendiğinde abonelik/ödeme entegrasyonunu
  kur; erişim haklarını sunucuda denetle. Ödeme ve üyelik durumlarını eşitle.
- Başarısız/tekrarlanan ödeme bildirimi, iptal ve süre dolumu akışlarını ele al.
- Kritik sınav ve yetki akışlarına otomatik kontroller ekle; bu kontrolleri ilgili
  fazların geliştirilmesi sırasında da çalıştır.
- Gerçekçi eşzamanlı sınav yükünü test et; hata izleme ve veritabanı yedekleme/
  geri yükleme sürecini doğrula.
- Sayfa bazında yükleme ile başlangıç paketini küçült; build/lint uyarılarını
  etkilerine göre gider.

Tamamlanma ölçütü: Paket erişimleri ödeme durumuyla tutarlıdır; kritik akışlar
doğrulanmıştır ve operasyonel hata/geri yükleme süreçleri uygulanabilir durumdadır.

Ödeme entegrasyonu, sınav güvenilirliği ve sonuç gizliliği tamamlandıktan sonra
ele alınmalıdır. Seçilecek sağlayıcı, kesin fiyatlar ve derslere göre sınav
dağılımı ayrıca kararlaştırılacak ürün kararlarıdır.
