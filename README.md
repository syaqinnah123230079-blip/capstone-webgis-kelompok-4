# WebGIS Point Taksonomi & Exposure

Versi awal memakai **titik koordinat survei** dari `EKSPOSURE.xlsx`.
Data polygon/footprint bangunan dapat ditambahkan kemudian tanpa mengubah konsep utama WebGIS.

## Data aktual yang dipakai
- Sheet: `ArcGIS_XY`
- Titik valid yang berhasil dibuat: 589
- Koordinat: kolom `X` dan `Y`

## Menjalankan versi yang sudah jadi
1. Buka folder ini di VS Code.
2. Install extension **Live Server**.
3. Klik kanan `index.html`.
4. Pilih **Open with Live Server**.

## Jika ingin regenerasi GeoJSON dari Excel di komputer sendiri
Letakkan:
`EKSPOSURE.xlsx`

di:
`data/raw/EKSPOSURE.xlsx`

Lalu jalankan:
`python scripts/convert_excel_to_points.py`

Setelah itu copy/gunakan file:
`data/processed/bangunan_points.geojson`

sebagai data titik WebGIS.

## Layer polygon nanti
Saat SHP bangunan sudah lengkap, polygon dapat ditambahkan sebagai layer baru sementara titik tetap dipakai untuk validasi/identitas survei.
