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

/**
 * Handle 24-Hour Diurnal Meteorology Projection
 */
async function handleProject24h(body, apiKey, request) {
  const { startTime = '08:00', startTemp, startPressure, startHumidity, dominantWind = 'Timur', location = 'Indonesia', anchorPoints = [] } = body;

  const validAnchors = (anchorPoints || []).filter(a => a && a.hour >= 1 && a.hour <= 24);

  let anchorPromptSection = '';
  if (validAnchors.length > 0) {
    anchorPromptSection = `
DATA RIIL LAPANGAN YANG SUDAH DICATAT PETUGAS (GROUND TRUTH):
${JSON.stringify(validAnchors, null, 2)}

ATURAN UTAMA:
1. Jam-jam acuan di atas (Jam ${validAnchors.map(a => a.hour).join(', ')}) WAJIB 100% PERSIS DAN TIDAK BOLEH DIUBAH! Tandai "isAnchor": true pada jam ini.
2. Jam-jam kosong sebelum, di antara, dan sesudah titik acuan WAJIB diinterpolasikan secara mulus dan ilmiah (diurnal meteorologi).
3. Laju alir (L/menit) pada jam-jam kosong stabil di sekitar angka alat yang tercatat pada titik acuan.
4. Tekanan udara dan kelembaban membentuk fluktuasi pasang surut alami yang bersambung dengan data riil.`;
  }

  const systemPrompt = `Anda adalah pakar meteorologi dan pengukuran kualitas udara ambien lingkungan (Standar SNI & FSOP-10.3.3).
Tugas Anda adalah memproyeksikan dan melengkapi data pencatatan 24 jam secara ilmiah, akurat, dan realistis untuk survei udara ambien di Indonesia.

Pola diurnal fisika atmosfer yang WAJIB ditaati:
1. Waktu: 24 jam berurutan dengan interval 1 jam, dimulai dari waktu mulai ${startTime}.
2. Suhu Udara (°C): 
   - Siang hari (11:00 - 14:00) mencapai puncak tertinggi (31.0°C s/d 34.5°C).
   - Sore hari (15:00 - 18:00) menurun perlahan (29.0°C s/d 27.0°C).
   - Malam hari (19:00 - 23:00) sejuk stabil (26.0°C s/d 25.0°C).
   - Dini hari/subuh (03:00 - 05:00) mencapai titik terendah (23.5°C s/d 25.0°C).
   - Pagi hari (06:00 - 08:00) mulai naik kembali (26.0°C s/d 29.5°C).
3. Kelembaban Udara (%RH):
   - Korelasi terbalik sempurna dengan suhu.
   - Siang terik: kelembaban terendah (50% s/d 68%).
   - Malam & dini hari: kelembaban tertinggi (80% s/d 93%).
4. Tekanan Udara (mmHg):
   - Pasang surut semidiurnal atmosfer dalam rentang 752.0 s/d 759.5 mmHg.
5. Laju Alir (L/menit):
   - Sangat stabil sesuai alat sampler.
6. Kecepatan Angin (m/s):
   - Siang lebih aktif (1.2 s/d 3.2 m/s), malam lebih tenang (0.4 s/d 1.5 m/s).
7. Arah Angin: Konsisten dengan angin dominan (${dominantWind}).
8. Cuaca: Alami (Cerah, Cerah Berawan, Berawan).
${anchorPromptSection}

Format output WAJIB JSON persis:
{
  "summary": "Proyeksi meteorologi 24 jam berbasis waktu mulai ${startTime}",
  "rows": [
    {
      "hour": 1,
      "waktu": "08:00",
      "tekanan": "756.2",
      "suhu": "29.4",
      "laju": "12.0",
      "kelembaban": "68",
      "kecepatan_angin": "1.5",
      "arah_angin": "${dominantWind}",
      "cuaca": "Cerah Berawan",
      "isAnchor": true
    }
    ... (sampai jam ke-24)
  ]
}`;

  const userPrompt = `Buatkan proyeksi 24 jam lengkap dari jam 1 s/d jam 24.
Waktu mulai: ${startTime}, Suhu awal/referensi: ${startTemp || 'otomatis'}, Arah angin: ${dominantWind}.
${validAnchors.length > 0 ? `Pastikan data riil jam [${validAnchors.map(a => a.hour).join(', ')}] terkunci persis apa adanya.` : ''}
Kembalikan tepat 24 baris data realistis dari jam 1 sampai jam 24 dalam format JSON.`;

  const resultText = await callGemini(apiKey, systemPrompt, userPrompt, { jsonMode: true, temperature: 0.2 });
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (e) {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    else throw new Error('Gagal mem-parsing format JSON dari Gemini');
  }

  if (parsed && Array.isArray(parsed.rows)) {
    validAnchors.forEach(a => {
      const idx = parsed.rows.findIndex(r => Number(r.hour) === Number(a.hour));
      if (idx !== -1) {
        parsed.rows[idx] = { ...parsed.rows[idx], ...a, isAnchor: true };
      }
    });
  }

  return new Response(JSON.stringify(parsed), {
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
