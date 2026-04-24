// pages/api/gemini-analyze.js
import sharp from "sharp"
import { GoogleGenAI, MediaResolution } from "@google/genai"

const MODEL = "gemini-flash-lite-latest"

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: "v1alpha",
})

const getMimeTypeFromBuffer = (buffer) => {
  if (!buffer || buffer.length < 12) return "image/jpeg"

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png"
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg"
  }

  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp"
  }

  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif"
  }

  return "image/jpeg"
}

const fetchImageBuffer = async (url) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.startsWith("image/")) {
    throw new Error("URL did not return an image")
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const resizeImageForVision = async (buffer) => {
  return sharp(buffer)
    .rotate()
    .resize({
      width: 768,
      height: 768,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 80,
      mozjpeg: true,
    })
    .toBuffer()
}

const sanitizeGeneratedText = (value) => {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”`]+|["'“”`]+$/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^this may contain[:,]?\s*/i, "")
    .replace(/^this image (shows|is)[:,]?\s*/i, "")
    .trim()
}

const buildPrompt = () => {
  return [
    "Write one factual DK Publishing-style caption for this image.",
    "Write as one clear paragraph, 1 to 3 sentences.",
    "First identify the subject when the image strongly supports it.",
    "If the exact subject is uncertain, use a broader accurate description instead.",
    "Describe visible details precisely, especially arms, armor, weapons, uniforms, equipment, insignia, shields, helmets, horse tack, banners, ships, vehicles, architecture, terrain, and setting.",
    "Use historically informed terms when supported by visible evidence, such as Cataphract, Lamellar Armor, Scale Armor, Mail, Barding, Dromon, Chelandion, Hippagogos, Galley, Lance, Spear, Sword, Shield, Helm, Standard, Pennon, Forecastle, Sterncastle, Oar Bank, and Ram.",
    "Capitalize proper nouns and historical terms correctly.",
    "Use BCE dates only when supported by the image. Never use BC or AD.",
    "Do not mention the artist, illustrator, or signature.",
    "Do not use markdown, asterisks, italics, bold formatting, or bullet points.",
    "Do not start with 'This image shows', 'This image is', or 'This may contain'.",
    "Do not invent exact names, dates, battles, campaigns, or people unless directly supported by visible text or unmistakable visual evidence.",
    "Prefer a correct broader term over a wrong specific term.",
    "Be specific, not generic.",
  ].join("\n")
}

const analyzeImage = async (imageUrl) => {
  const originalBuffer = await fetchImageBuffer(imageUrl)
  const resizedBuffer = await resizeImageForVision(originalBuffer)

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        inlineData: {
          mimeType: getMimeTypeFromBuffer(resizedBuffer),
          data: resizedBuffer.toString("base64"),
        },
      },
      {
        text: buildPrompt(),
      },
    ],
    config: {
      temperature: 1,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    },
  })

  return sanitizeGeneratedText(response.text)
}

export default async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" })
  }

  try {
    const image = String(req.body?.image || "").trim()

    if (!image) {
      return res.status(400).json({ error: "image is required" })
    }

    const title = await analyzeImage(image)

    return res.status(200).json({ title })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      error: err.message || "Unexpected server error",
    })
  }
}
