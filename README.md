# Kick TTS

Kick yayımında KICK hədiyyələrini, channel points mesajlarını və (istəsən) chat-i səslə oxuyur, səsi birbaşa OBS-ə göndərir. Hər tamaşaçını yadda saxlayır, ən sadiq tamaşaçıları göstərir və xüsusi anlarda ("100-cü mesaj", "7 gündür ardıcıl buradadır") öz-özünə danışır.

Pulsuzdur. Quraşdırma, hesab və ya açar tələb etmir.

## 4 addımda başla

1. **App-i aç.**
   - **Windows:** `KickTTS-win-x64.exe` faylına iki dəfə kliklə. Açılan qara pəncərəni bağlama — app onunla işləyir.
   - **macOS:** faylın üzərinə **sağ klik → Open (Aç)**, sonra çıxan pəncərədə yenə **Open** bas. Bunu yalnız ilk dəfə etmək lazımdır (app Apple tərəfindən imzalanmadığı üçün macOS soruşur).

   İlk dəfə açılanda brauzerdə idarə paneli özü açılır. Açılmasa, brauzerdə bu ünvanı aç: http://localhost:7777

2. **Kick istifadəçi adını yaz** və **Qoşul** düyməsini bas. Yuxarıda yaşıl **"Kick: qoşulub"** yazısı görünməlidir.
   - "Kick məlumatlarını avtomatik ala bilmədik" yazısı çıxsa, oradakı linki aç, göstərilən iki rəqəmi kopyala, sahələrə yaz və **Yadda saxla və qoşul** düyməsini bas.

3. **OBS-də:** Sources (Mənbələr) → **+** → **Browser** → URL: `http://localhost:7777/overlay` → **"Control audio via OBS"** qutusunu işarələ → **OK**.
   Yuxarıda yaşıl **"OBS overlay: qoşulub"** yazısı görünməlidir.

4. Paneldə **Test** düyməsini bas. OBS-in audio mikserində yeni səs mənbəyi tərpənməli və səs eşidilməlidir.

## Bilmək faydalıdır

- Overlay-i OBS-ə **yalnız bir dəfə** əlavə et, yoxsa səs iki dəfə çıxa bilər.
- Default olaraq yalnız **KICK hədiyyələri** və **channel points** oxunur. Chat-i və abunəlikləri "Nə oxunsun" bölməsində aç.
- Səslər kompüterin öz səsləridir:
  - **macOS:** System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → Türkcə **Yelda** və rusca **Milena** səslərini yüklə.
  - **Windows:** Settings → Time & Language → Speech → Add voices → Türkçe.
- Azərbaycan dilində sistem səsi yoxdur; Türkcə səs Azərbaycan mətnini ən yaxşı oxuyur.
- Məlumatlar bu qovluqda saxlanılır:
  - macOS: `~/Library/Application Support/KickTTS`
  - Windows: `%APPDATA%\KickTTS`

  Bir tamaşaçının məlumatını silmək üçün "Sadiq tamaşaçılar" bölməsində onun adına kliklə və **Məlumatı sil** düyməsini bas.
