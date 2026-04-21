const GEMINI_MODEL = "gemini-2.5-flash"

const stripCodeFence = (text) => {
  const value = String(text || "").trim()
  if (!value) return ""

  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
}

const extractGeminiText = (payload) => {
  const parts =
    payload?.candidates?.[0]?.content?.parts ||
    payload?.candidates?.[0]?.parts ||
    []

  return parts
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim()
}

const parseGeminiResult = (text) => {
  const cleaned = stripCodeFence(text)

  try {
    const parsed = JSON.parse(cleaned)
    return {
      title: String(parsed?.title || "").trim(),
      imageAuthor: String(parsed?.imageAuthor || "").trim(),
      description: String(parsed?.description || "").trim(),
    }
  } catch {
    return {
      title: cleaned.trim(),
      imageAuthor: "",
      description: "",
    }
  }
}

const fetchImageAsInlinePart = async (imageUrl) => {
  const response = await fetch(imageUrl)

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`)
  }

  const contentType = response.headers.get("content-type") || "image/jpeg"
  const arrayBuffer = await response.arrayBuffer()
  const data = Buffer.from(arrayBuffer).toString("base64")

  return {
    inline_data: {
      mime_type: contentType,
      data,
    },
  }
}

const analyzeImageWithGemini = async ({ imageUrl, apiKey }) => {
  const imagePart = await fetchImageAsInlinePart(imageUrl)

  const prompt = [
    "You are cleaning image metadata for a private JSON dataset.",
    "Return JSON only.",
    'Use this exact shape: {"title":"", "imageAuthor":"", "description":""}',
    "Rules:",
    "- title must be concise, factual, and useful",
    '- never use phrases like "This may contain"',
    "- no hype, no fluff, no guessing beyond what is visibly plausible",
    "- if the subject appears historical, mention clothing, object, troop type, weapon, armor, setting, or scene briefly if visible",
    "- keep title under 12 words",
    "- imageAuthor should be blank unless the author is visibly written in the image itself",
    "- description must be one short sentence max",
  ].join("\n")

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, imagePart],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  )

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.error?.status ||
        `Gemini request failed: ${response.status}`,
    )
  }

  const text = extractGeminiText(payload)

  if (!text) {
    throw new Error("Gemini returned no text.")
  }

  return parseGeminiResult(text)
}

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." })
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY
    const imageUrl = String(req.body?.imageUrl || "").trim()

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." })
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "Missing imageUrl." })
    }

    const result = await analyzeImageWithGemini({
      imageUrl,
      apiKey,
    })

    return res.status(200).json({
      title: result.title || "",
      imageAuthor: result.imageAuthor || "",
      description: result.description || "",
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      error: err.message || "Analyze failed.",
    })
  }
}

export default handler
