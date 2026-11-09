/*
 * Team settings / Ekip ayarları
 *
 * EN: Fill in your Google Cloud keys and push this file to GitHub. Everyone who opens the
 *     site then syncs through Google Drive without pasting anything; they only sign in and
 *     pick the shared data file once. Leave clientId empty to let each person enter their own
 *     keys in Settings → Sync. These values are not secrets (they are visible to every browser
 *     anyway); access is limited by the OAuth client's allowed origins and by Drive sharing.
 *
 * TR: Google Cloud anahtarlarını doldurup bu dosyayı GitHub'a yükle. Siteyi açan herkes hiçbir
 *     şey yapıştırmadan Google Drive ile senkronlanır; sadece giriş yapıp ortak veri dosyasını
 *     bir kez seçer. clientId boş kalırsa herkes anahtarları Ayarlar → Senkronizasyon'dan girer.
 *     Bu değerler gizli değildir; erişimi OAuth istemcisinin izinli adresleri ve Drive paylaşımı sınırlar.
 */
window.GDPM_CONFIG = {
  googleDrive: {
    clientId: '', // 1234567890-abc….apps.googleusercontent.com
    apiKey: '',   // AIza…
    appId: '',    // Google Cloud project number, e.g. 123456789012
  },
};
