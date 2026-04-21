const sharpImport = () => import("sharp").then((mod) => mod.default)

const GEMINI_MODEL = "gemini-2.5-flash-lite"

const ensureTrailingPeriod = (text) => {
  const value = String(text || "")
    .trim()
    .replace(/[.!?…]+$/, "")
  if (!value) return ""
  return `${value}.`
}

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
      title: ensureTrailingPeriod(parsed?.title || ""),
      imageAuthor: String(parsed?.imageAuthor || "").trim(),
      description: String(parsed?.description || "").trim(),
    }
  } catch {
    return {
      title: ensureTrailingPeriod(cleaned),
      imageAuthor: "",
      description: "",
    }
  }
}

const fetchImageBuffer = async (imageUrl) => {
  const response = await fetch(imageUrl)

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`)
  }

  const contentType = response.headers.get("content-type") || "image/jpeg"
  const arrayBuffer = await response.arrayBuffer()

  return {
    contentType,
    inputBuffer: Buffer.from(arrayBuffer),
  }
}

const buildInlineImagePart = async ({
  inputBuffer,
  contentType,
  maxSize = 384,
  jpegQuality = 75,
}) => {
  if (
    !contentType.startsWith("image/") ||
    contentType.includes("gif") ||
    contentType.includes("svg")
  ) {
    return {
      inline_data: {
        mime_type: contentType,
        data: inputBuffer.toString("base64"),
      },
    }
  }

  const sharp = await sharpImport()

  const image = sharp(inputBuffer).rotate()
  const metadata = await image.metadata()

  let pipeline = image.resize({
    width: maxSize,
    height: maxSize,
    fit: "inside",
    withoutEnlargement: true,
  })

  let outputBuffer
  let mimeType

  if (metadata.hasAlpha) {
    outputBuffer = await pipeline.png().toBuffer()
    mimeType = "image/png"
  } else {
    outputBuffer = await pipeline
      .jpeg({
        quality: jpegQuality,
        mozjpeg: true,
      })
      .toBuffer()
    mimeType = "image/jpeg"
  }

  return {
    inline_data: {
      mime_type: mimeType,
      data: outputBuffer.toString("base64"),
    },
  }
}

const runGeminiRequest = async ({ imagePart, apiKey }) => {
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

const analyzeImageWithGemini = async ({ imageUrl, apiKey }) => {
  const { inputBuffer, contentType } = await fetchImageBuffer(imageUrl)

  const smallImagePart = await buildInlineImagePart({
    inputBuffer,
    contentType,
    maxSize: 384,
    jpegQuality: 75,
  })

  let firstPass

  try {
    firstPass = await runGeminiRequest({
      imagePart: smallImagePart,
      apiKey,
    })
  } catch (err) {
    const largerImagePart = await buildInlineImagePart({
      inputBuffer,
      contentType,
      maxSize: 768,
      jpegQuality: 82,
    })

    return await runGeminiRequest({
      imagePart: largerImagePart,
      apiKey,
    })
  }

  const looksWeak =
    !firstPass.title ||
    firstPass.title.length < 3 ||
    /^image$/i.test(firstPass.title) ||
    /^untitled$/i.test(firstPass.title)

  if (!looksWeak) {
    return firstPass
  }

  const largerImagePart = await buildInlineImagePart({
    inputBuffer,
    contentType,
    maxSize: 768,
    jpegQuality: 82,
  })

  return await runGeminiRequest({
    imagePart: largerImagePart,
    apiKey,
  })
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
