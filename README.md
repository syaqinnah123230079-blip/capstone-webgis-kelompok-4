# WebGIS Dashboard Taksonomi & Exposure — AOI Ready

Versi ini sudah membaca dua file berikut secara otomatis:

- `data/bangunan_points.geojson`
- `data/batas_wilayah.geojson`

## Untuk GitHub Pages

Di repository, struktur wajib:

```
index.html
style.css
app.js
data/
  bangunan_points.geojson
  batas_wilayah.geojson
```

Jika `batas_wilayah.geojson` sudah ada di GitHub, JANGAN hapus atau ganti dengan file kosong.

Cukup ganti tiga file utama:
- `index.html`
- `style.css`
- `app.js`

Setelah commit, tunggu GitHub Pages selesai deploy lalu tekan Ctrl+F5.

## AOI

AOI dibaca dari:
`data/batas_wilayah.geojson`

AOI ditampilkan sebagai overlay `Batas Wilayah / AOI`, dibawa ke belakang titik survei,
dan peta otomatis zoom ke extent AOI saat berhasil dimuat.
