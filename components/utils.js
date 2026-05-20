export const ICON_SIZE = 24
export const MENU_WIDTH = 300
export const MENU_HEIGHT = 450
export const MENU_EDGE_GAP = 8

export const defaultImage =
  "https://i.pinimg.com/1200x/27/ff/37/27ff3733ece0a0d09d76d1288f2dbef4.jpg"

export const STORAGE_KEY = "json-editor-data"
export const FILE_HANDLE_DB = "json-editor-file-db"
export const FILE_HANDLE_STORE = "handles"
export const FILE_HANDLE_KEY = "active-json-file"
export const FLOATING_MENU_POSITION_KEY =
  "json-editor-floating-menu-position-v1"
export const ANALYZE_CONCURRENCY = 3

export const openFileHandleDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_HANDLE_DB, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILE_HANDLE_STORE)) {
        db.createObjectStore(FILE_HANDLE_STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

export const saveFileHandleToDb = async (handle) => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readwrite")
    const store = tx.objectStore(FILE_HANDLE_STORE)

    store.put(handle, FILE_HANDLE_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const getFileHandleFromDb = async () => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readonly")
    const store = tx.objectStore(FILE_HANDLE_STORE)
    const request = store.get(FILE_HANDLE_KEY)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export const deleteFileHandleFromDb = async () => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readwrite")
    const store = tx.objectStore(FILE_HANDLE_STORE)

    store.delete(FILE_HANDLE_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const normalizeImageUrl = (url) => {
  const raw = String(url || "").trim()
  if (!raw) return ""

  try {
    const absolute = raw.startsWith("//") ? `https:${raw}` : raw
    const parsed = new URL(absolute)

    const host = parsed.hostname.toLowerCase()
    let pathname = decodeURIComponent(parsed.pathname)
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")

    if (host === "i.pinimg.com") {
      const match = pathname.match(
        /^\/(?:originals|\d+x)\/([a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{2}\/[^/?#]+)$/i,
      )

      if (match) {
        return `pinimg:${match[1].toLowerCase()}`
      }
    }

    const wikimediaThumbMatch = pathname.match(
      /^\/wikipedia\/commons\/thumb\/([a-f0-9]\/[a-f0-9]{2}\/[^/]+)\/\d+px-[^/]+$/i,
    )

    if (host === "upload.wikimedia.org" && wikimediaThumbMatch) {
      return `wikimedia:${wikimediaThumbMatch[1]}`
    }

    return `${parsed.protocol.toLowerCase()}//${host}${pathname}${parsed.search}`
  } catch {
    return raw.replace(/^\/\//, "https://").replace(/#.*$/, "").trim()
  }
}

export const getDuplicateImageKeys = (images) => {
  const counts = new Map()

  images.forEach((img) => {
    const key = normalizeImageUrl(img.image)
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  )
}

export const getDuplicateItemCount = (images) => {
  const counts = new Map()

  images.forEach((img) => {
    const key = normalizeImageUrl(img.image)
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  let duplicateItems = 0

  counts.forEach((count) => {
    if (count > 1) {
      duplicateItems += count - 1
    }
  })

  return duplicateItems
}

export const getYoutubeEmbedUrl = (url) => {
  if (!url) return null

  try {
    if (url.includes("youtube.com/embed/")) return url

    const watchMatch = url.match(/v=([^&]+)/)
    if (watchMatch) {
      return `https://www.youtube.com/embed/${watchMatch[1]}`
    }

    const shortMatch = url.match(/youtu\.be\/([^?]+)/)
    if (shortMatch) {
      return `https://www.youtube.com/embed/${shortMatch[1]}`
    }

    return null
  } catch {
    return null
  }
}

export const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const normalizeLoadedData = (parsed) =>
  (parsed || []).map((item) => ({
    id: createId(),
    title: item.title || "",
    eventStartYear: parseOptionalYear(item.eventStartYear),
    eventEndYear: parseOptionalYear(item.eventEndYear),
    publishOn: item?.publishOn ?? true,
    images: (item.images || []).map((img) => ({
      title: img.title || "",
      image: img.image || "",
      imageAuthor: img.imageAuthor || "",
    })),
    open: false,
  }))

export const clampIndex = (value, max) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  if (num < 0) return 0
  if (num > max) return max
  return num
}

export const clampNumber = (value, min, max) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return min
  if (num < min) return min
  if (num > max) return max
  return num
}

export const getMaxFloatingPercent = (
  menuWidth = MENU_WIDTH,
  menuHeight = MENU_HEIGHT,
) => {
  if (typeof window === "undefined") {
    return {
      maxXPercent: 95,
      maxYPercent: 95,
    }
  }

  const maxX = Math.max(window.innerWidth - menuWidth - MENU_EDGE_GAP, 0)
  const maxY = Math.max(window.innerHeight - menuHeight - MENU_EDGE_GAP, 0)

  return {
    maxXPercent: (maxX / window.innerWidth) * 100,
    maxYPercent: (maxY / window.innerHeight) * 100,
  }
}

export const clampFloatingPosition = (
  position,
  menuWidth = MENU_WIDTH,
  menuHeight = MENU_HEIGHT,
) => {
  const { maxXPercent, maxYPercent } = getMaxFloatingPercent(
    menuWidth,
    menuHeight,
  )

  return {
    xPercent: clampNumber(position?.xPercent, 0, maxXPercent),
    yPercent: clampNumber(position?.yPercent, 0, maxYPercent),
  }
}

export const moveImageInArray = (images, fromIndex, toIndex) => {
  if (
    fromIndex < 0 ||
    fromIndex >= images.length ||
    toIndex < 0 ||
    toIndex >= images.length ||
    fromIndex === toIndex
  ) {
    return images
  }

  const next = [...images]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export const moveSelectedImagesToIndex = (
  images,
  selectedIndexes,
  targetIndex,
) => {
  if (!selectedIndexes.length) return images

  const selectedSet = new Set(selectedIndexes)
  const selectedImages = images.filter((_, idx) => selectedSet.has(idx))
  const unselectedImages = images.filter((_, idx) => !selectedSet.has(idx))

  const insertAt = clampIndex(targetIndex, unselectedImages.length)
  const next = [...unselectedImages]
  next.splice(insertAt, 0, ...selectedImages)

  return next
}

export const getInitialFloatingMenuPosition = () => {
  if (typeof window === "undefined") {
    return { xPercent: 5, yPercent: 5 }
  }

  try {
    const saved = localStorage.getItem(FLOATING_MENU_POSITION_KEY)
    if (!saved) {
      return clampFloatingPosition({ xPercent: 5, yPercent: 5 })
    }

    const parsed = JSON.parse(saved)

    if (
      Number.isFinite(Number(parsed?.xPercent)) ||
      Number.isFinite(Number(parsed?.yPercent))
    ) {
      return clampFloatingPosition({
        xPercent: Number(parsed?.xPercent),
        yPercent: Number(parsed?.yPercent),
      })
    }

    if (
      Number.isFinite(Number(parsed?.x)) ||
      Number.isFinite(Number(parsed?.y))
    ) {
      return clampFloatingPosition({
        xPercent: (Number(parsed?.x || 0) / window.innerWidth) * 100,
        yPercent: (Number(parsed?.y || 0) / window.innerHeight) * 100,
      })
    }

    return clampFloatingPosition({ xPercent: 5, yPercent: 5 })
  } catch {
    return clampFloatingPosition({ xPercent: 5, yPercent: 5 })
  }
}

export const getFloatingTransform = (xPercent, yPercent) =>
  `translate3d(${xPercent}vw, ${yPercent}vh, 0)`

export const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

  return results
}

export const getBoardSortYear = (value) => {
  const raw = String(value ?? "").trim()

  if (!raw) {
    return Number.POSITIVE_INFINITY
  }

  const year = Number(raw)

  if (!Number.isFinite(year)) {
    return Number.POSITIVE_INFINITY
  }

  return year
}

export const sortBoardsByEventStartYear = (boards) =>
  [...boards]
    .map((board, originalIndex) => ({
      board,
      originalIndex,
      sortYear: getBoardSortYear(board.eventStartYear),
      sortTitle: String(board.title || "").trim(),
    }))
    .sort((a, b) => {
      if (a.sortYear !== b.sortYear) {
        return a.sortYear - b.sortYear
      }

      const titleCompare = a.sortTitle.localeCompare(b.sortTitle, undefined, {
        sensitivity: "base",
        numeric: true,
      })

      if (titleCompare !== 0) {
        return titleCompare
      }

      return a.originalIndex - b.originalIndex
    })
    .map(({ board }) => board)

export const parseOptionalYear = (value) => {
  const trimmed = String(value ?? "").trim()

  if (trimmed === "") return null

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? parsed : null
}

export const playAudio = (
  audioFile = "https://pub-41a63e44811f431085eefa140827e30b.r2.dev/click05.wav",
) => {
  const audio = new Audio(audioFile)
  audio.play().catch((err) => {
    if (err.name !== "AbortError") {
      console.warn("Audio playback failed:", err)
    }
  })
}
