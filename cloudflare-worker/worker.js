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
 * Call Google Gemini REST API (gemini-2.0-flash with fallback to gemini-1.5-flash)
 */
async function callGemini(apiKey, systemInstruction, prompt, options = {}) {
  const model = options.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 3000
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
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
    const errorText = await res.text();
    // Fallback to gemini-1.5-flash if 2.0-flash isn't available
    if (model !== 'gemini-1.5-flash' && res.status >= 400 && res.status < 500) {
      return callGemini(apiKey, systemInstruction, prompt, { ...options, model: 'gemini-1.5-flash' });
    }
    throw new Error(`Gemini API Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

/**
 * Handle 24-Hour Diurnal Meteorology Projection
 */
async function handleProject24h(body, apiKey, request) {
  const { startTime = '08:00', startTemp, startPressure, startHumidity, dominantWind = 'Timur', location = 'Indonesia', currentForm = {} } = body;

  const systemPrompt = `Anda adalah pakar meteorologi dan pengukuran kualitas udara ambien lingkungan (Standar SNI & FSOP-10.3.3).
Tugas Anda adalah memproyeksikan data pencatatan 24 jam secara ilmiah, akurat, dan realistis untuk survei udara ambien di Indonesia.

Pola diurnal fisika atmosfer yang WAJIB ditaati:
1. Waktu: 24 jam berurutan dengan interval 1 jam, dimulai dari waktu mulai yang diberikan (contoh: ${startTime}, lalu jam berikutnya hingga 24 baris).
2. Suhu Udara (°C): 
   - Siang hari (11:00 - 14:00) mencapai puncak tertinggi (31.0°C s/d 34.5°C).
   - Sore hari (15:00 - 18:00) menurun perlahan (29.0°C s/d 27.0°C).
   - Malam hari (19:00 - 23:00) sejuk stabil (26.0°C s/d 25.0°C).
   - Dini hari/subuh (03:00 - 05:00) mencapai titik terendah (23.5°C s/d 25.0°C).
   - Pagi hari (06:00 - 08:00) mulai naik kembali (26.0°C s/d 29.5°C).
3. Kelembaban Udara (%RH):
   - Korelasi terbalik sempurna dengan suhu.
   - Siang terik: kelembaban terendah (55% s/d 68%).
   - Malam & dini hari: kelembaban tertinggi (80% s/d 93%).
4. Tekanan Udara (mmHg):
   - Pasang surut atmosfer (semi-diurnal atmospheric tide) dalam rentang 752.0 s/d 759.5 mmHg.
   - Puncak pertama sekitar jam 09:00 - 10:00 pagi, puncak kedua sekitar jam 21:00 - 22:00 malam.
5. Laju Alir (L/menit):
   - Sangat stabil sesuai alat sampler (HVAS / impinger), dengan variasi fluktuasi mikroskopis wajar (misal antara 1.18 s/d 1.22 atau 1.00 s/d 1.02).
6. Kecepatan Angin (m/s):
   - Siang lebih aktif (1.2 s/d 3.2 m/s), malam lebih tenang (0.4 s/d 1.5 m/s).
7. Arah Angin:
   - Konsisten mengikuti angin dominan (${dominantWind}) dengan sedikit variasi arah terdekat.
8. Cuaca:
   - Sesuai siklus: 'Cerah', 'Cerah Berawan', 'Berawan', dsb.

Format output WAJIB JSON persis:
{
  "summary": "Proyeksi meteorologi 24 jam berbasis waktu mulai ${startTime} di ${location}",
  "rows": [
    {
      "hour": 1,
      "waktu": "08:00",
      "tekanan": "756.2",
      "suhu": "29.4",
      "laju": "1.20",
      "kelembaban": "68",
      "kecepatan_angin": "1.5",
      "arah_angin": "Timur",
      "cuaca": "Cerah Berawan"
    },
    ... (sampai jam ke-24)
  ]
}`;

  const userPrompt = `Buatkan proyeksi 24 jam lengkap dari jam 1 s/d jam 24.
Parameter awal:
- Jam mulai: ${startTime}
- Suhu awal: ${startTemp || 'otomatis'}
- Tekanan awal: ${startPressure || 'otomatis'}
- Kelembaban awal: ${startHumidity || 'otomatis'}
- Arah angin dominan: ${dominantWind}
- Lokasi: ${location}

Pastikan menghasilkan tepat 24 baris data realistis dari jam 1 sampai jam 24 dalam format JSON valid.`;

  const resultText = await callGemini(apiKey, systemPrompt, userPrompt, { jsonMode: true, temperature: 0.2 });
  let parsed;
  try {
    parsed = JSON.parse(resultText);
  } catch (e) {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    else throw new Error('Gagal mem-parsing format JSON dari Gemini');
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

Tugas Anda:
Lengkapi kolom-kolom formulir yang masih KOSONG berdasarkan:
1. Kolom-kolom yang sudah terisi sebelumnya (konteks yang konsisten).
2. Instruksi khusus dari pengguna (jika ada).
3. Standar baku teknis laboratorium lingkungan Indonesia (SNI, KemenLHK, BMKG).

Aturan penting:
- Jangan mengubah kolom yang sudah diisi pengguna dengan benar kecuali diminta.
- Berikan nilai yang masuk akal secara teknis (misal pH air sungai alami 6.5 - 8.2, DO 4.5 - 7.5 mg/L, suhu air 25 - 29°C, koordinat format derajat/menit/detik yang valid).
- Berikan penjelasan singkat mengenai data yang diisi.

Format output WAJIB JSON:
{
  "explanation": "Penjelasan singkat data yang dilengkapi",
  "fieldsToFill": {
    "nama_kolom_1": "nilai_1",
    "nama_kolom_2": "nilai_2"
  }
}`;

  const userPrompt = `Berikut adalah kondisi form saat ini:
- Kolom yang sudah diisi: ${JSON.stringify(filledFields, null, 2)}
- Kolom yang masih kosong: ${JSON.stringify(emptyFields)}
- Instruksi tambahan pengguna: ${userInstruction || 'Lengkapi kolom kosong yang esensial dengan data realistis dan konsisten.'}

Kembalikan daftar field yang harus diisi dalam objek "fieldsToFill".`;

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
