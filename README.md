# GameDev PM

Oyun geliştirme ekipleri için proje yönetim aracı. Derleme adımı gerektirmez; saf HTML/CSS/JS olduğu için **GitHub Pages** üzerinde doğrudan çalışır.

## Özellikler

| Görünüm | Neler var |
|---|---|
| **Pano** | Trello benzeri listeler ve kartlar. Kartlar ve listeler sürükle-bırakla taşınır (fare, kalem ve dokunmatik). Kart rengi, renkli etiketler, kişi atama, başlangıç/bitiş tarihi, tamamlama, açıklama (Markdown), kontrol listesi, yorumlar, aktivite geçmişi, öncelik, tahmini süre ve bağımlılıklar desteklenir. Hata kartları için şiddet, platform, build no, tekrar üretme adımları ve beklenen/gerçekleşen davranış alanları vardır. |
| **Gantt** | Kartlardan otomatik oluşur. Gün/hafta/ay yakınlaştırması; liste, kişi veya etikete göre gruplama; daraltılabilir özet çubukları ve ilerleme dolgusu. Kilometre taşları, bağımlılık okları (ihlal edilenler kırmızı), kritik yol ve bugün çizgisi bulunur. Çubuğu sürükleyerek tarih kaydırılır, kenarından sürükleyerek süre değiştirilir, sağdaki noktadan başka bir çubuğa sürükleyerek bağımlılık eklenir. **SVG/PNG** olarak dışa aktarılır. |
| **Takvim** | Çok günlü çubuklarla aylık görünüm. Sürükleyerek tarih değişir, güne tıklayarak kart eklenir. Gecikenler ve yaklaşanlar listelenir. Google/Outlook takvimine **.ics** olarak aktarılır. |
| **İş yükü** | Kişi × hafta (veya gün) ısı haritası. Tahmini saatler iş günlerine dağıtılır; kapasite aşımı kırmızı görünür. SVG/PNG olarak aktarılır. |
| **İstatistik** | İlerleme kutuları, burndown grafiği, listeye/kişiye/etikete/önceliğe/türe göre dağılımlar. Her grafik SVG/PNG olarak aktarılır. |
| **GDD / Wiki** | Markdown sayfaları, canlı önizleme. GDD, karakter, seviye ve toplantı şablonları hazırdır. |
| **Yapay zekâ** | TÜBİTAK'ın *Destek Süreçlerinde ÜYZ'nin Sorumlu ve Güvenilir Kullanımı Rehberi* (v04, Ocak 2026) ile uyumlu kullanım kaydı. Ayrıntılar aşağıda. |

Genel özellikler:
- **Arama ve filtre:** Arama kutusunda `#etiket`, `@kişi` ve serbest metin kullanılabilir. Filtre panelinden durum, etiket, kişi, öncelik ve türe göre süzülür. Filtre pano, Gantt, takvim, iş yükü ve istatistiklere birlikte uygulanır.
- **Arka plan:** 12 hazır desen, düz renk, görsel bağlantısı ya da görsel yükleme.
- **Tema ve dil:** Aydınlık/karanlık tema ve Türkçe/İngilizce arayüz varsayılan olarak sistem ayarını izler. Üst çubuktan veya Ayarlar'dan değiştirilir.
- **Birden fazla pano**, Trello JSON içe aktarma, tam JSON yedekleme ve geri yükleme.
- **Kısayollar:** `/` aramaya odaklanır, `1`–`7` görünümler arasında geçer, `Esc` pencereyi kapatır.

## Yapay zekâ bölümü (TÜBİTAK rehberi)

Rehberin başvuru sahiplerine yönelik bölümü temel alındı:
- **Kullanım alanları:** Bölüm 1.1.1'deki *destekleyici* (kaynak araştırması, dil/çeviri, kodlama, fikir geliştirme, görselleştirme önerisi) ve 1.1.2'deki *dikkat gerektiren* (taslak yazdırma, veri analizi, görsel üretimi) kullanımlar ayrı gruplarda yer alır. Oyun projeleri için ses/müzik ve oyun içeriği (diyalog, hikâye, seviye) üretimi de *dikkat gerektiren* gruba eklendi.
- **Beyan alanları (1.2):** Araç adı ve versiyonu, kullanıldığı aşama/bölüm, kullanımın niteliği ve kapsamı. Bunlara ek olarak amaç, ekibin katkısı, ilgili kartlar ve "önemli ölçüde kullanım" işareti tutulur.
- **Doğrulama listesi (1.3–1.5):** Çıktının doğrulanması, gizli/kişisel veri girilmemesi, lisans/FSM kontrolü, özgünlük/intihal kontrolü ve önyargı incelemesi. Kullanım alanına göre bazı maddeler zorunludur; eksikler panelde uyarı olarak görünür.
- **Beyan raporu:** Kayıtlardan özet tablo, araç bazında ayrıntılar ve taahhüt metni içeren bir rapor üretilir. Rapor kopyalanabilir, `.md` olarak indirilebilir veya yazdırılıp PDF yapılabilir. Kayıtlar CSV olarak da alınabilir.

> Bu bölüm okulunuzun istediği belgeleme işini kolaylaştırmak içindir. Hukuki bir uygunluk garantisi vermez; nihai kurallar için rehberin kendisine ve okulunuza başvurun.

## GitHub Pages'te yayınlama

1. Bu klasörü bir GitHub deposuna yükleyin (`index.html` kök dizinde olmalı).
2. Depo → **Settings → Pages → Build and deployment** bölümünde *Deploy from a branch*, `main` ve `/ (root)` seçin.
3. Bir iki dakika sonra `https://KULLANICI.github.io/DEPO/` adresinde açılır.

Yerelde denemek için bir statik sunucu yeterlidir:

```bash
python -m http.server 5173
```

Sonra tarayıcıda `http://localhost:5173` adresini açın. Dosyayı çift tıklayarak açmak da çalışır, ancak bulut senkronu için `http(s)` adresi gerekir.

## Senkronizasyon

Veriler her durumda önce tarayıcıya (localStorage) kaydedilir; uygulama internet olmadan da çalışır. Ekip paylaşımı için iki ücretsiz seçenek vardır. Hangisini kullanacağınızı **Ayarlar → Senkronizasyon** bölümünden seçersiniz.

### Aynı anda kullanım nasıl çalışır?

Her kart, liste, yorum vb. ayrı bir kayıttır ve kendi "son değişiklik" zaman damgasını taşır. Birleştirme **kayıt bazında** yapılır: Ayşe A kartını, Mehmet B kartını aynı anda düzenlerse ikisinin değişikliği de korunur. Sadece **aynı kartı aynı saniyelerde** iki kişi değiştirirse son kaydeden kazanır. Silmeler de kayıt olarak tutulur, böylece silinen kart başka bir cihazdan geri gelmez.

| | Firebase (önerilen) | Google Drive |
|---|---|---|
| Gecikme | Anlık (1–2 sn) | ~15 sn yoklama |
| Çakışma | Kayıt bazında, gerçek zamanlı | Yüklemeden önce indir, birleştir, yükle. Çakışan yüklemeler bir sonraki turda kendini onarır. |
| Kurulum | Firebase projesi + config yapıştır | Google Cloud OAuth istemcisi + API anahtarı |
| Ücret | Spark planı ücretsiz (günde 50 bin okuma / 20 bin yazma) | Ücretsiz (Drive kotanızdan) |

### Firebase kurulumu (~10 dk)

1. [console.firebase.google.com](https://console.firebase.google.com) adresinden yeni bir proje oluşturun (Analytics gerekmez).
2. **Build → Authentication → Get started → Sign-in method** bölümünden **Google** sağlayıcısını etkinleştirin.
3. **Authentication → Settings → Authorized domains** listesine `KULLANICI.github.io` ekleyin.
4. **Build → Firestore Database → Create database** ile production modunda, size yakın bir bölgede (ör. `europe-west`) veritabanı oluşturun.
5. **Firestore → Rules** sekmesine aşağıdaki kuralları yapıştırın ve e-postaları kendi ekibinizinkilerle değiştirin:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /workspaces/{ws}/{document=**} {
         allow read, write: if request.auth != null
           && request.auth.token.email in ['ali@gmail.com', 'ayse@gmail.com', 'mehmet@gmail.com'];
       }
     }
   }
   ```

6. **Project settings → General → Your apps** bölümünden bir Web uygulaması (`</>`) ekleyin ve gösterilen `firebaseConfig = { ... }` nesnesini kopyalayın.
7. Uygulamada **Ayarlar → Senkronizasyon → Firebase** seçin, config'i yapıştırın, ekipçe aynı **çalışma alanı kimliğini** kullanın ve **Google ile bağlan**'a tıklayın.

> Firebase config'teki `apiKey` gizli değildir; erişimi yukarıdaki güvenlik kuralları korur.

### Google Drive kurulumu (~15 dk)

1. [console.cloud.google.com](https://console.cloud.google.com) adresinde bir proje oluşturun.
2. **APIs & Services → Library** bölümünden **Google Drive API** ve **Google Picker API** etkinleştirin.
3. **OAuth consent screen:** *External* seçin, uygulama adını girin ve **Test users** kısmına ekip üyelerinin Gmail adreslerini ekleyin. Uygulama "Testing" modunda kalabilir.
4. **Credentials → Create credentials → OAuth client ID → Web application** ile istemci oluşturun. *Authorized JavaScript origins* kısmına `https://KULLANICI.github.io` (yerel test için `http://localhost:5173`) ekleyin.
5. **Credentials → Create credentials → API key** ile bir anahtar oluşturun. *Website restrictions* ile `KULLANICI.github.io/*` adresine kısıtlayın.
6. **Proje numarası** (App ID): Cloud Console ana sayfasındaki *Project info* kartında yazar.
7. Uygulamada **Ayarlar → Senkronizasyon → Google Drive** seçin ve üç değeri girin.
8. **Bir kişi** "Drive'da yeni dosya oluştur" der, oluşan `gamedev-pm-data.json` dosyasını Drive'da ekiple **Düzenleyen** olarak paylaşır.
9. **Diğerleri** "Drive'dan seç" ile paylaşılan dosyayı açar.

> Uygulama yalnızca `drive.file` iznini ister: Drive'ınızın tamamını değil, sadece uygulamayla oluşturulan veya seçilen dosyayı görebilir. Erişim belirteci yaklaşık 1 saat geçerlidir; süresi dolunca üst çubuktaki **Bağlan** düğmesine bir kez tıklamak yeterlidir.

## Yedekleme

**Ayarlar → Veri → Tümünü dışa aktar** her şeyi tek bir JSON dosyasına yazar. Senkron kullansanız bile ara sıra yedek alın.

## Dosya yapısı

```
index.html
css/app.css
js/
  icons.js util.js ui.js i18n.js     yardımcılar, arayüz parçaları, TR/EN metinler
  store.js                           veri deposu + kayıt bazında birleştirme
  model.js                           pano/kart mantığı, filtre, örnek veri, Trello içe aktarma
  sync.js                            Firebase ve Google Drive senkronu
  md.js export.js settings.js app.js
  views/  board card gantt calendar workload stats wiki ai
```
