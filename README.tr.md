# GameDev PM

[English](README.md) · **Türkçe**

Oyun geliştirme ekipleri için proje yönetim aracı. Derleme adımı gerektirmez; saf HTML/CSS/JS olduğu için **GitHub Pages** üzerinde doğrudan çalışır.

> ### 🤖 Claude ile oluşturuldu
> Bu depodaki kod, **Claude** (Anthropic'in yapay zekâ modeli, Claude Code aracılığıyla) tarafından üretilmiştir. Gereksinimleri ekip belirledi, tasarım kararlarını ekip verdi, sonucu ekip inceledi ve test etti. TÜBİTAK üretken yapay zekâ rehberi doğrultusunda bu kullanım, uygulamanın kendi **Yapay zekâ** kaydında da yer alır.

## Özellikler

| Görünüm | Neler var |
|---|---|
| **Pano** | Trello benzeri listeler ve kartlar. Kartlar ve listeler sürükle-bırakla taşınır (fare, kalem ve dokunmatik). Kart rengi, renkli etiketler, kişi atama, başlangıç/bitiş tarihi, tamamlama, açıklama (Markdown), kontrol listesi, yorumlar, aktivite geçmişi, öncelik, tahmini süre ve bağımlılıklar desteklenir. Hata kartları için şiddet, platform, build no, tekrar üretme adımları ve beklenen/gerçekleşen davranış alanları vardır. |
| **Yapılacaklar** | Her kişi için bir kart ve **günlük, haftalık veya aylık** liste. Kişiye atanmış ve tarihi o döneme denk gelen kartlar otomatik listelenir (işaretlemek panodaki kartı da tamamlar); ayrıca herkes, isterse bir karta bağlı, ek iş ekleyebilir. Zamana, önceliğe veya sürükleyerek belirlenen özel sıraya göre sıralanır. Geciken kartlar ve önceki dönemden kalan işler üstte görünür. "Sadece ben" ve "Tamamlananlar" düğmeleri vardır; ortak filtre burada da geçerlidir. |
| **Gantt** | Kartlardan otomatik oluşur. Gün/hafta/ay yakınlaştırması; liste, kişi veya etikete göre gruplama; daraltılabilir özet çubukları ve ilerleme dolgusu. Kilometre taşları, bağımlılık okları (ihlal edilenler kırmızı), kritik yol ve bugün çizgisi bulunur. Çubuğu sürükleyerek tarih kaydırılır, kenarından sürükleyerek süre değiştirilir, sağdaki noktadan başka bir çubuğa sürükleyerek bağımlılık eklenir. **SVG/PNG** olarak dışa aktarılır. |
| **Takvim** | Çok günlü çubuklarla aylık görünüm. Sürükleyerek tarih değişir, güne tıklayarak kart eklenir. Gecikenler ve yaklaşanlar listelenir. Google/Outlook takvimine **.ics** olarak aktarılır. |
| **İş yükü** | Kişi × hafta (veya gün) ısı haritası. Tahmini saatler iş günlerine dağıtılır; kapasite aşımı kırmızı görünür. SVG/PNG olarak aktarılır. |
| **İstatistik** | İlerleme kutuları, burndown grafiği, listeye/kişiye/etikete/önceliğe/türe göre dağılımlar. Her grafik SVG/PNG olarak aktarılır. |
| **GDD / Wiki** | Markdown sayfaları, canlı önizleme. GDD, karakter, seviye ve toplantı şablonları hazırdır. |
| **Yapay zekâ** | TÜBİTAK rehberiyle uyumlu yapay zekâ kullanım kaydı. Ayrıntılar aşağıda. |

Genel özellikler:
- **Arama ve filtre:** Arama kutusunda `#etiket`, `@kişi` ve serbest metin kullanılabilir. Filtre panelinden durum, etiket, kişi, öncelik ve türe göre süzülür. Filtre pano, Gantt, takvim, iş yükü ve istatistiklere birlikte uygulanır.
- **Arka plan:** 12 hazır desen, düz renk, görsel bağlantısı ya da görsel yükleme.
- **Tema ve dil:** Aydınlık/karanlık tema ve Türkçe/İngilizce arayüz varsayılan olarak sistem ayarını izler. Üst çubuktan veya Ayarlar'dan değiştirilir.
- **Birden fazla pano**, Trello JSON içe aktarma, tam JSON yedekleme ve geri yükleme.
- **Kısayollar:** `/` aramaya odaklanır, `1`–`8` görünümler arasında geçer, `Esc` pencereyi kapatır.

## Yapay zekâ bölümü (TÜBİTAK rehberi)

TÜBİTAK'ın *Destek Süreçlerinde Üretken Yapay Zekânın (ÜYZ) Sorumlu ve Güvenilir Kullanımı Rehberi*'nin (v04, Ocak 2026) başvuru sahiplerine yönelik bölümü temel alındı:
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

Sonra tarayıcıda `http://localhost:5173` adresini açın. Dosyayı çift tıklayarak açmak da çalışır, ancak Drive senkronu için `http(s)` adresi gerekir.

## Google Drive ile senkronizasyon

Veriler her durumda önce tarayıcıya (localStorage) kaydedilir; uygulama internet olmadan da çalışır. Ekiple paylaşmak için Google Drive'daki tek bir JSON dosyası üzerinden senkronlanır.

### Kim neyi görür?

- Proje **tek bir dosyada** durur. Dosya kiminle paylaşıldıysa hepsi aynı projeyi görür.
- Aynı siteyi kullanan başka bir ekip **kendi dosyasını** oluşturur ve sadece kendi projesini görür.
- Uygulama yalnızca `drive.file` iznini ister: kimsenin Drive'ının geri kalanını göremez, sadece uygulamayla oluşturulan veya uygulamada seçilen dosyaları görür.

### Aynı anda düzenleme

Her kart, liste, yorum vb. ayrı bir kayıttır ve kendi "son değişiklik" zaman damgasını taşır. Birleştirme **kayıt bazında** yapılır: Ayşe A kartını, Mehmet B kartını aynı anda düzenlerse ikisinin değişikliği de korunur. İki kişi **aynı öğeyi** değiştirirse, ikinci senkronlayan kişiye kendi sürümünü **Kal** ile mi koruyacağı yoksa Drive'dakiyle **Değiştir** mi diyeceği sorulur. Uygulama açıldığında Drive'daki dosya değişmişse ve bu cihazda hiç yüklenmemiş değişiklikler varsa (örneğin internetsizken yapılanlar) aynı soru sorulur: **Kal** ekibin güncellemelerini alıp senin değişikliklerini korur, **Değiştir** yüklenmemiş değişiklikleri bırakıp Drive'daki sürümü kullanır. Silmeler de kayıt olarak tutulur, böylece silinen kart başka bir cihazdan geri gelmez.

Dosya yaklaşık 15 saniyede bir, ayrıca sekmeden çıkınca ve sekmeye dönünce hemen kontrol edilir. Uygulama yüklemeden önce en güncel dosyayı indirip birleştirir ve yazmadan hemen önce bir kez daha kontrol eder; iki yükleme yine de çakışırsa bir sonraki turda kendini onarır.

### Kurulum (bir kişi, bir kez, ~15 dk)

1. [console.cloud.google.com](https://console.cloud.google.com) adresinde bir proje oluşturun.
2. **APIs & Services → Library** bölümünden **Google Drive API** ve **Google Picker API** etkinleştirin.
3. **OAuth consent screen:** *External* seçin, uygulama adını girin ve **Test users** kısmına ekip arkadaşlarınızın Gmail adreslerini ekleyin. Uygulama "Testing" modunda kalabilir (en fazla 100 test kullanıcısı). Herkesin giriş yapabilmesini istiyorsanız uygulamayı yayınlayın; Google bu durumda gizlilik politikası gibi bilgiler isteyip inceleme yapabilir.
4. **Credentials → Create credentials → OAuth client ID → Web application.** *Authorized JavaScript origins* kısmına `https://KULLANICI.github.io` (yerel test için `http://localhost:5173`) ekleyin.
5. **Credentials → Create credentials → API key.** *Website restrictions* ile `KULLANICI.github.io/*` adresine kısıtlayın.
6. **Proje numarası** (App ID): Cloud Console ana sayfasındaki *Project info* kartında yazar.
7. Bu üç değeri **`config.js`** dosyasına yazın ve GitHub'a yükleyin:

   ```js
   window.GDPM_CONFIG = {
     googleDrive: {
       clientId: '1234567890-abc….apps.googleusercontent.com',
       apiKey: 'AIza…',
       appId: '123456789012',
       fileId: '',   // isteğe bağlı: ortak veri dosyası, aşağıya bakın
     },
   };
   ```

   Bu değerler gizli değildir; zaten her tarayıcı tarafından görülebilir. Erişimi izinli adresler ve Drive paylaşımı sınırlar. `config.js` boş kalırsa herkes anahtarları **Ayarlar → Senkronizasyon** bölümüne kendisi girebilir.

### Her ekip üyesi için

1. Bir kişi **Ayarlar → Senkronizasyon** bölümünde **Drive'da yeni dosya oluştur**'a tıklar ve oluşan `gamedev-pm-data.json` dosyasını Drive'da ekiple **Düzenleyen** olarak paylaşır.
2. İsteğe bağlı ama önerilir: **Ayarlar → Senkronizasyon** bölümünde **config.js için kimliği kopyala**'ya tıklayın, `config.js` içindeki `fileId` alanına yapıştırıp GitHub'a yükleyin. Bundan sonra site herkes için ekip dosyasını otomatik açar.
3. Diğerleri siteyi açar ve bir kez **Bağlan**'a tıklar. Uygulama veri dosyasını kendisi bulur (`config.js`'teki ekip dosyası, bu tarayıcının daha önce kullandığı dosya ya da Drive'daki uygulama dosyaları). Yalnızca bu Google hesabı ortak dosyayı daha önce hiç açmadıysa Google, kendi dosya seçicisinde bir tıklama ister; seçici o dosya seçili olarak açılır.
4. Herkes **Ayarlar → Genel → Ben kimim?** kısmından kendi adını seçer; yorum ve kayıtlarda bu ad görünür.

**Oturumun açık kalması:** Google'ın tarayıcı girişi bir saat geçerli belirteç verir ve statik bir sitenin bunu arka planda yenileyecek sunucusu yoktur. Uygulama belirteci yenilemeler ve sekmeler arasında saklar; süresi dolmak üzereyken (ya da dolduğunda) **sayfada herhangi bir yere tıkladığında** kendiliğinden yeniler: Google penceresi bir an açılıp tekrar sormadan kapanır. Tarayıcın bu pencereyi engellerse site için açılır pencerelere bir kez izin ver. Oturum kapalıyken yapılan değişiklikler saklanır ve yenilemeden sonra yüklenir.

## Yedekleme

**Ayarlar → Veri → Tümünü dışa aktar** her şeyi tek bir JSON dosyasına yazar. Senkron açık olsa bile ara sıra yedek alın.

## Dosya yapısı

```
index.html
config.js                            ekibin Google Drive anahtarları
css/app.css
js/
  icons.js util.js ui.js i18n.js     yardımcılar, arayüz parçaları, TR/EN metinler
  store.js                           veri deposu + kayıt bazında birleştirme
  model.js                           pano/kart mantığı, filtre, örnek veri, Trello içe aktarma
  sync.js                            Google Drive senkronu
  md.js export.js settings.js app.js
  views/  board card todo gantt calendar workload stats wiki ai
```

## Emeği geçenler

- Kod [Claude](https://www.anthropic.com/claude) (Anthropic) ile üretildi; ekip tarafından yönlendirildi ve test edildi.
- Ayarlar simgesinin şekli [Lucide](https://lucide.dev)'den alındı (ISC lisansı). Yazı tipleri: Bricolage Grotesque, Figtree ve JetBrains Mono (Google Fonts, SIL Open Font License).
