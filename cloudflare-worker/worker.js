/**
 * Cloudflare Worker for Sistem Survei Lapangan AI Assistant
 * Model: Google Gemini 2.0 Flash / 1.5 Flash (via Google AI Studio)
 * 100% Serverless, Free Tier Compatible (100k req/day Cloudflare, 1500 req/day Gemini)
 */

export default {
  async fetch(request, env) {
    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(request)
      });
    }

    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'Sistem Survei Lapangan AI Proxy',
        model: 'gemini-2.0-flash',
        timestamp: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
    }

    // Verify Gemini API Key exists in Cloudflare Environment
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'GEMINI_API_KEY belum disetel di Cloudflare Worker Environment Variables.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }

    try {
      const body = await request.json();
      const endpoint = url.pathname;

      if (endpoint === '/api/project-24h') {
        return await handleProject24h(body, apiKey, request);
      } else if (endpoint === '/api/complete-form') {
        return await handleCompleteForm(body, apiKey, request);
      } else if (endpoint === '/api/chat') {
        return await handleChat(body, apiKey, request);
      } else {
        // Default general AI handler
        return await handleChat(body, apiKey, request);
      }
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Terjadi kesalahan saat memproses permintaan: ' + err.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(request)
        }
      });
    }
  }
};

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

/**
 * Call Google Gemini REST API with robust model fallback
 */
async function callGemini(apiKey, systemInstruction, prompt, options = {}) {
  const models = [
    options.model,
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ].filter(Boolean);

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 3500
        }
      };

      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      if (options.jsonMode) {
        payload.generationConfig.responseMimeType = 'application/json';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`(${res.status}): ${errText}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Gemini API Error: ${lastErr?.message || lastErr}`);
}

function hasMeasurement(r) {
  if (!r) return false;
  const s = (v) => (v != null ? String(v).trim() : '');
  return !!(s(r.suhu) || s(r.tekanan) || s(r.laju) || s(r.kelembaban));
}

function cleanVal(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/°c|%|m\/s|mmhg/gi, '').trim();
}

function toWindDegree(val, defaultDeg = 300) {
  if (val === null || val === undefined) return defaultDeg;
  const str = String(val).trim().toLowerCase();
  const num = parseFloat(str);
  if (!isNaN(num)) {
    let deg = Math.round(num) % 360;
    return deg === 0 ? 360 : deg;
  }
  const compassMap = {
    'utara': 360, 'n': 360, 'north': 360,
    'timur laut': 45, 'ne': 45, 'northeast': 45,
    'timur': 90, 'e': 90, 'east': 90,
    'tenggara': 135, 'se': 135, 'southeast': 135,
    'selatan': 180, 's': 180, 'south': 180,
    'barat daya': 225, 'sw': 225, 'southwest': 225,
    'barat': 270, 'w': 270, 'west': 270,
    'barat laut': 315, 'nw': 315, 'northwest': 315
  };
  return compassMap[str] || defaultDeg;
}

function formatInteger(val, defaultVal = '0') {
  if (val === null || val === undefined || String(val).trim() === '' || String(val).trim() === '-') {
    return String(defaultVal);
  }
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return String(val).trim();
  return String(Math.round(num));
}

function formatWindSpeed(val, defaultVal = '1.5') {
  if (val === null || val === undefined || String(val).trim() === '' || String(val).trim() === '-') {
    return String(defaultVal);
  }
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return String(val).trim();
  return num.toFixed(1);
}

function formatWindDir(val, defaultDeg = 300) {
  return String(toWindDegree(val, defaultDeg));
}

function calculateDiurnalFallback(startTime = '08:00', anchors = [], options = {}) {
  const [startH, startM] = (startTime || '08:00').split(':').map(Number);
  const rows = [];
  const validAnchors = (anchors || []).filter(a => a && a.hour >= 1 && a.hour <= 24 && hasMeasurement(a));
  const anchorMap = {};
  validAnchors.forEach(a => { anchorMap[a.hour] = a; });

  let baseTemp = Math.round(parseFloat(options.startTemp));
  let baseTekanan = 760;
  let baseLaju = 100;
  let baseDeg = toWindDegree(options.dominantWind || 300);
  let baseCuaca = 'Cerah';

  if (validAnchors.length > 0) {
    const first = validAnchors[0];
    if (first.suhu && !isNaN(parseFloat(first.suhu))) baseTemp = Math.round(parseFloat(first.suhu));
    if (first.tekanan && !isNaN(parseFloat(first.tekanan))) baseTekanan = Math.round(parseFloat(first.tekanan));
    if (first.laju && !isNaN(parseFloat(first.laju))) baseLaju = Math.round(parseFloat(first.laju));
    if (first.arah_angin) baseDeg = toWindDegree(first.arah_angin, baseDeg);
    if (first.cuaca) baseCuaca = first.cuaca;
  }
  if (isNaN(baseTemp)) baseTemp = 30;

  const anchor1HourOfDay = startH % 24;
  const tempAmplitude = 8.5;

  for (let h = 1; h <= 24; h++) {
    const curH = (startH + (h - 1)) % 24;
    const curM = startM || 0;
    const timeStr = String(curH).padStart(2, '0') + ':' + String(curM).padStart(2, '0');

    if (anchorMap[h]) {
      const a = anchorMap[h];
      rows.push({
        hour: h,
        waktu: a.waktu || timeStr,
        tekanan: formatInteger(a.tekanan, baseTekanan),
        suhu: formatInteger(a.suhu, baseTemp),
        laju: formatInteger(a.laju, baseLaju),
        kelembaban: formatInteger(a.kelembaban, '65'),
        kecepatan_angin: formatWindSpeed(a.kecepatan_angin, '1.5'),
        arah_angin: formatWindDir(a.arah_angin, baseDeg),
        cuaca: a.cuaca || baseCuaca,
        isAnchor: true
      });
    } else {
      const hourDiffFromCoolest = (curH - 4 + 24) % 24;
      const diurnalFactor = 0.5 - 0.5 * Math.cos((hourDiffFromCoolest / 24) * 2 * Math.PI);
      const anchorFactor = (0.5 - 0.5 * Math.cos(((anchor1HourOfDay - 4 + 24) % 24 / 24) * 2 * Math.PI)) || 1;
      const tempDiff = (diurnalFactor - anchorFactor) * tempAmplitude;
      const tempVal = String(Math.round(baseTemp + tempDiff));

      const pressOffset = (1 - diurnalFactor) * 3.5 - 1.8;
      const pressVal = String(Math.round(baseTekanan + pressOffset));

      let baseRh = 65;
      if (validAnchors.length > 0 && validAnchors[0].kelembaban) {
        baseRh = parseFloat(validAnchors[0].kelembaban) || 65;
      }
      const rhDiff = (anchorFactor - diurnalFactor) * 32;
      const rhVal = Math.min(95, Math.max(30, Math.round(baseRh + rhDiff)));

      let baseWindSpeed = 1.8;
      if (validAnchors.length > 0 && validAnchors[0].kecepatan_angin) {
        baseWindSpeed = parseFloat(validAnchors[0].kecepatan_angin) || 1.8;
      }
      const windFactor = 0.5 + 0.5 * diurnalFactor;
      const windSpd = (baseWindSpeed * (0.6 + 0.5 * windFactor)).toFixed(1);

      let weatherStr = baseCuaca;
      if (curH >= 6 && curH <= 17) {
        weatherStr = diurnalFactor > 0.6 ? (baseCuaca || 'Cerah') : 'Cerah Berawan';
      } else {
        weatherStr = 'Berawan';
      }

      const degDev = Math.round(Math.sin(h * 1.3) * 6);
      let curDeg = ((baseDeg + degDev + 360 - 1) % 360) + 1;

      rows.push({
        hour: h,
        waktu: timeStr,
        tekanan: pressVal,
        suhu: tempVal,
        laju: String(baseLaju),
        kelembaban: String(rhVal),
        kecepatan_angin: windSpd,
        arah_angin: String(curDeg),
        cuaca: weatherStr,
        isAnchor: false
      });
    }
  }
  return rows;
}

/**
 * Handle 24-Hour Diurnal Meteorology Projection
 */
async function handleProject24h(body, apiKey, request) {
  const { startTime = '08:00', startTemp, dominantWind = '300', location = 'Indonesia', anchorPoints = [] } = body;
  const dominantWindDeg = toWindDegree(dominantWind, 300);

  const validAnchors = (anchorPoints || []).filter(a => a && a.hour >= 1 && a.hour <= 24 && hasMeasurement(a));
  const anchorMap = {};
  validAnchors.forEach(a => { anchorMap[Number(a.hour)] = a; });

  const baselineRows = calculateDiurnalFallback(startTime, validAnchors, { startTemp, dominantWind: dominantWindDeg });

  let baseLajuStr = '100';
  if (validAnchors.length > 0 && validAnchors[0].laju) {
    baseLajuStr = formatInteger(validAnchors[0].laju, '100');
  }

  let anchorPromptSection = '';
  if (validAnchors.length > 0) {
    anchorPromptSection = `
DATA RIIL LAPANGAN YANG SUDAH DICATAT PETUGAS (GROUND TRUTH):
${JSON.stringify(validAnchors, null, 2)}

ATURAN UTAMA:
1. Jam acuan di atas (Jam ${validAnchors.map(a => a.hour).join(', ')}) WAJIB 100% PERSIS DAN TIDAK BOLEH DIUBAH! Tandai "isAnchor": true HANYA pada jam ini.
2. Jam-jam kosong (jam lainnya) WAJIB DILENGKAPI SELURUH KOLOMNYA (waktu, tekanan, suhu, laju, kelembaban, kecepatan_angin, arah_angin, cuaca).
   DILARANG KERAS MENGOSONGKAN ATAU MEMBERI TANDA STRIP (-) PADA KOLOM MANAPUN! Tandai "isAnchor": false.
3. Laju alir (L/menit) pada seluruh jam wajib berada di angka alat sampling (${baseLajuStr}).
4. Suhu udara, tekanan atmosfer, dan kelembaban membentuk kurva diurnal alami yang menyambung mulus dengan data riil.`;
  }

  const systemPrompt = `Anda adalah pakar meteorologi dan pengukuran kualitas udara ambien lingkungan (Standar SNI & FSOP-10.3.3).
Tugas Anda adalah memproyeksikan dan melengkapi data pencatatan 24 jam secara ilmiah, akurat, dan realistis untuk survei udara ambien di Indonesia.

ATURAN FORMAT PENULISAN ANGKA (SANGAT KETAT):
1. Tekanan Udara (mmHg): Bilangan BULAT tanpa koma/titik desimal (contoh: 763, 764, 762).
2. Suhu Udara (°C): Bilangan BULAT tanpa koma/titik desimal (contoh: 36, 34, 32, 29, 27).
3. Laju Alir (L/menit): Bilangan BULAT tanpa koma/titik desimal (contoh: 100, 1000).
4. Kelembaban (%RH): Bilangan BULAT tanpa koma/titik desimal (contoh: 39, 40, 48, 55, 65).
5. Kecepatan Angin (m/s): HANYA PARAMETER INI yang menggunakan TEPAT 1 angka di belakang titik (contoh: 1.7, 1.8, 1.5, 1.2, 1.0, 0.8).
6. Arah Angin: WAJIB ANGKA DERAJAT (0 - 360), DILARANG MENGGUNAKAN KATA seperti "Timur", "Selatan", dsb! (contoh: 300, 295, 305, 302).
7. Waktu: 24 jam berurutan dengan interval 1 jam, dimulai dari waktu mulai ${startTime}.
8. Cuaca: Alami (Cerah, Cerah Berawan, Berawan).
${anchorPromptSection}

PENTING:
- Setiap baris dari jam 1 sampai jam 24 HARUS terisi lengkap semua kolomnya.
- Jangan ada nilai kosong, null, atau strip (-).

Format output WAJIB JSON persis:
{
  "summary": "Proyeksi meteorologi 24 jam berbasis waktu mulai ${startTime}",
  "rows": [
    {
      "hour": 1,
      "waktu": "${startTime}",
      "tekanan": "763",
      "suhu": "36",
      "laju": "${baseLajuStr}",
      "kelembaban": "39",
      "kecepatan_angin": "1.7",
      "arah_angin": "${dominantWindDeg}",
      "cuaca": "Cerah",
      "isAnchor": true
    }
    ... (sampai jam ke-24)
  ]
}`;

  const userPrompt = `Buatkan proyeksi 24 jam lengkap dari jam 1 s/d jam 24.
Waktu mulai: ${startTime}, Suhu awal/referensi: ${startTemp || 'otomatis'}, Arah angin derajat: ${dominantWindDeg}.
${validAnchors.length > 0 ? `Pastikan data riil jam [${validAnchors.map(a => a.hour).join(', ')}] terkunci persis apa adanya.` : ''}
Pastikan seluruh 24 jam memiliki data lengkap untuk semua kolom. Ingat aturan format: tanpa angka di belakang titik kecuali kecepatan angin, dan arah angin wajib angka derajat.
Kembalikan tepat 24 baris data realistis dari jam 1 sampai jam 24 dalam format JSON.`;

  let parsed = null;
  try {
    const resultText = await callGemini(apiKey, systemPrompt, userPrompt, { jsonMode: true, temperature: 0.2 });
    try {
      parsed = JSON.parse(resultText);
    } catch (e) {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.warn('Worker Gemini call failed, using diurnal fallback:', err);
  }

  const mergedRows = [];
  for (let h = 1; h <= 24; h++) {
    const fallbackR = baselineRows[h - 1] || {};
    const geminiR = Array.isArray(parsed?.rows)
      ? parsed.rows.find(r => Number(r.hour) === h) || parsed.rows[h - 1]
      : null;
    const anchor = anchorMap[h];

    const pickVal = (anchorVal, geminiVal, fallbackVal) => {
      const cA = cleanVal(anchorVal);
      if (cA && cA !== '-') return cA;
      const cG = cleanVal(geminiVal);
      if (cG && cG !== '-') return cG;
      return cleanVal(fallbackVal) || '';
    };

    const rawTekanan = pickVal(anchor ? anchor.tekanan : '', geminiR?.tekanan, fallbackR.tekanan);
    const rawSuhu = pickVal(anchor ? anchor.suhu : '', geminiR?.suhu, fallbackR.suhu);
    const rawLaju = pickVal(anchor ? anchor.laju : '', geminiR?.laju, fallbackR.laju);
    const rawKelembaban = pickVal(anchor ? anchor.kelembaban : '', geminiR?.kelembaban, fallbackR.kelembaban);
    const rawKecAngin = pickVal(anchor ? anchor.kecepatan_angin : '', geminiR?.kecepatan_angin, fallbackR.kecepatan_angin);
    const rawArahAngin = pickVal(anchor ? anchor.arah_angin : '', geminiR?.arah_angin, fallbackR.arah_angin);
    const rawCuaca = pickVal(anchor ? anchor.cuaca : '', geminiR?.cuaca, fallbackR.cuaca);

    mergedRows.push({
      hour: h,
      waktu: pickVal(anchor ? anchor.waktu : '', geminiR?.waktu, fallbackR.waktu),
      tekanan: formatInteger(rawTekanan, fallbackR.tekanan || 763),
      suhu: formatInteger(rawSuhu, fallbackR.suhu || 36),
      laju: formatInteger(rawLaju, fallbackR.laju || baseLajuStr),
      kelembaban: formatInteger(rawKelembaban, fallbackR.kelembaban || 40),
      kecepatan_angin: formatWindSpeed(rawKecAngin, fallbackR.kecepatan_angin || '1.5'),
      arah_angin: formatWindDir(rawArahAngin, dominantWindDeg),
      cuaca: rawCuaca || fallbackR.cuaca || 'Cerah',
      isAnchor: !!anchor
    });
  }

  return new Response(JSON.stringify({
    summary: `Proyeksi meteorologi 24 jam berbasis waktu mulai ${startTime}`,
    rows: mergedRows
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request)
    }
  });
}

/**
 * Handle Smart Form Completion for Empty Fields
 */
async function handleCompleteForm(body, apiKey, request) {
  const { formType, emptyFields = [], filledFields = {}, userInstruction = '' } = body;

  const systemPrompt = `Anda adalah asisten cerdas pengisian formulir survei laboratorium lingkungan PT LABORATORINDO ALAM BESTARI (Standar Akreditasi KAN, SNI & FSOP).
Jenis Formulir: ${formType === 'air' ? 'Survei Sampel Air (FSOP-10.3.1)' : 'Survei Udara Ambien (FSOP-10.3.3)'}.

ATURAN UTAMA:
1. Anda HANYA mengisi kolom yang KOSONG.
2. Anda DILARANG mengubah kolom yang sudah terisi.
3. Baca seluruh data formulir yang sudah terisi (seperti nama pelanggan, titik sampling, koordinat, waktu, cuaca, suhu, tekanan, dll) sebagai acuan kondisi nyata di lapangan.
4. Nilai untuk kolom yang kosong harus logis, realistis, dan serasi dengan data riil yang sudah ada di formulir tersebut.

Format output WAJIB JSON:
{
  "explanation": "Penjelasan singkat bagaimana data disesuaikan dengan kondisi riil form",
  "fieldsToFill": {
    "nama_kolom_1": "nilai_1",
    "nama_kolom_2": "nilai_2"
  }
}`;

  const userPrompt = `DATA RIIL LAPANGAN YANG SUDAH TERISI DI FORM (Konteks Nyata):
${JSON.stringify(filledFields, null, 2)}

DAFTAR KOLOM YANG MASIH KOSONG UNTUK DILENGKAPI:
${JSON.stringify(emptyFields)}

${userInstruction ? `INSTRUKSI TAMBAHAN PETUGAS LAPANGAN: ${userInstruction}` : 'Lengkapi kolom kosong di atas agar serasi dan akurat sesuai data riil yang sudah terisi.'}`;

  const resultText = await callGemini(apiKey, systemPrompt, userPrompt, { jsonMode: true, temperature: 0.3 });
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (e) {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    else throw new Error('Gagal mem-parsing format JSON');
  }

  return new Response(JSON.stringify(parsed), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request)
    }
  });
}

/**
 * General AI Assistant & Chat Handler
 */
async function handleChat(body, apiKey, request) {
  const { message = '', context = {}, history = [] } = body;

  const systemPrompt = `Anda adalah "LabBestari AI", Asisten Cerdas Lapangan untuk PT LABORATORINDO ALAM BESTARI.
Anda terintegrasi langsung ke dalam aplikasi web survei lapangan (Air FSOP-10.3.1 & Udara Ambien FSOP-10.3.3).

Kemampuan Anda:
1. Menjawab pertanyaan teknis mengenai sampling lingkungan, pengawetan sampel (asam nitrat, pendinginan 4°C, botol gelap), baku mutu (PP 22/2021), perhitungan debit sungai, dan pengukuran 24 jam.
2. Membantu melengkapi, menganalisis, atau mengoreksi data formulir.
3. Memberikan rekomendasi ramah, sigap, profesional, dan dalam bahasa Indonesia yang baik.
4. Jika pengguna meminta untuk mengisi atau memperbarui data tertentu pada form, Anda bisa menyertakan objek data JSON khusus di akhir jawaban dengan format:
\`\`\`form_update
{
  "fields": {
    "nama_field": "nilai"
  }
}
\`\`\`
Aplikasi web akan otomatis menampilkan tombol bagi pengguna untuk langsung menerapkan nilai tersebut ke formulir dengan 1 kali klik.

Konteks formulir aktif saat ini:
- Tipe form: ${context.formType || 'Tidak diketahui'}
- Ringkasan isian saat ini: ${JSON.stringify(context.currentSummary || {})}`;

  const prompt = message || 'Halo, apa saja yang bisa Anda bantu untuk survei lapangan hari ini?';
  const resultText = await callGemini(apiKey, systemPrompt, prompt, { temperature: 0.4 });

  // Extract form_update if present
  let suggestedFields = null;
  const matchUpdate = resultText.match(/```form_update\s*([\s\S]*?)\s*```/);
  if (matchUpdate) {
    try {
      const parsed = JSON.parse(matchUpdate[1]);
      suggestedFields = parsed.fields || parsed;
    } catch (e) {}
  }

  // Clean reply text from the block for pleasant chat reading
  const cleanReply = resultText.replace(/```form_update[\s\S]*?```/, '').trim();

  return new Response(JSON.stringify({
    reply: cleanReply,
    suggestedFields: suggestedFields
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request)
    }
  });
}
