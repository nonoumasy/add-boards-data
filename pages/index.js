/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useMemo, useRef } from "react"
import { DndContext, closestCenter } from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  MdClear,
  MdOutlineFolder,
  MdSaveAlt,
  MdChevronLeft,
  MdChevronRight,
  MdMenu,
  MdDragIndicator,
  MdCheck,
} from "react-icons/md"
import {
  IoLogoGoogle,
  IoMdAdd,
  IoMdArrowRoundDown,
  IoMdArrowRoundUp,
  IoMdArrowUp,
  IoMdClose,
} from "react-icons/io"
import { AiOutlineDelete } from "react-icons/ai"
import { FiMinus } from "react-icons/fi"
import { RiImageAiFill } from "react-icons/ri"
import { TbLayoutBottombarCollapse } from "react-icons/tb"

const ICON_SIZE = 24
const defaultImage =
  "https://i.pinimg.com/1200x/27/ff/37/27ff3733ece0a0d09d76d1288f2dbef4.jpg"

const STORAGE_KEY = "json-editor-data"
const FILE_HANDLE_DB = "json-editor-file-db"
const FILE_HANDLE_STORE = "handles"
const FILE_HANDLE_KEY = "active-json-file"
const FLOATING_MENU_POSITION_KEY = "json-editor-floating-menu-position-v1"
const FLOATING_MENU_MINIMIZED_KEY = "json-editor-floating-menu-minimized-v1"

// ---------- INDEXEDDB ----------
const openFileHandleDb = () =>
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

const saveFileHandleToDb = async (handle) => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readwrite")
    const store = tx.objectStore(FILE_HANDLE_STORE)

    store.put(handle, FILE_HANDLE_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const getFileHandleFromDb = async () => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readonly")
    const store = tx.objectStore(FILE_HANDLE_STORE)
    const request = store.get(FILE_HANDLE_KEY)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

const deleteFileHandleFromDb = async () => {
  const db = await openFileHandleDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, "readwrite")
    const store = tx.objectStore(FILE_HANDLE_STORE)

    store.delete(FILE_HANDLE_KEY)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------- DUPLICATE HELPER ----------
const normalizeImageUrl = (url) => {
  const value = url?.trim()
  if (!value) return ""

  let normalized = value

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`
  }

  if (normalized.includes("i.pinimg.com/")) {
    const match = normalized.match(
      /^https?:\/\/i\.pinimg\.com\/(?:\d+x|originals)\/(.+)$/i,
    )

    if (match) {
      return `https://i.pinimg.com/originals/${match[1]}`
    }
  }

  const wikimediaThumbMatch = normalized.match(
    /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/([a-f0-9]\/[a-f0-9]{2}\/[^/]+)\/\d+px-.+$/i,
  )

  if (wikimediaThumbMatch) {
    return `https://upload.wikimedia.org/wikipedia/commons/${wikimediaThumbMatch[1]}`
  }

  return normalized
}

const getDuplicateImages = (images) => {
  const seen = new Set()
  const duplicates = new Set()

  images.forEach((img) => {
    const normalizedUrl = normalizeImageUrl(img.image)
    if (!normalizedUrl) return

    if (seen.has(normalizedUrl)) {
      duplicates.add(normalizedUrl)
    } else {
      seen.add(normalizedUrl)
    }
  })

  return duplicates
}

// ---------- YOUTUBE HELPER ----------
const getYoutubeEmbedUrl = (url) => {
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

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const normalizeLoadedData = (parsed) =>
  (parsed || []).map((item) => ({
    id: createId(),
    title: item.title || "",
    eventStartYear: item.eventStartYear || "",
    images: (item.images || []).map((img) => ({
      title: img.title || "",
      image: img.image || "",
      imageAuthor: img.imageAuthor || "",
    })),
    open: false,
  }))

const clampIndex = (value, max) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  if (num < 0) return 0
  if (num > max) return max
  return num
}

const moveImageInArray = (images, fromIndex, toIndex) => {
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

const moveSelectedImagesToIndex = (images, selectedIndexes, targetIndex) => {
  if (!selectedIndexes.length) return images

  const selectedSet = new Set(selectedIndexes)
  const selectedImages = images.filter((_, idx) => selectedSet.has(idx))
  const unselectedImages = images.filter((_, idx) => !selectedSet.has(idx))

  const insertAt = clampIndex(targetIndex, unselectedImages.length)
  const next = [...unselectedImages]
  next.splice(insertAt, 0, ...selectedImages)

  return next
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const getInitialFloatingMenuPosition = () => {
  if (typeof window === "undefined") {
    return { x: 20, y: 20 }
  }

  try {
    const saved = localStorage.getItem(FLOATING_MENU_POSITION_KEY)
    if (!saved) {
      return {
        x: Math.max(window.innerWidth - 440, 20),
        y: Math.max(window.innerHeight - 700, 20),
      }
    }

    const parsed = JSON.parse(saved)
    const x = Number(parsed?.x)
    const y = Number(parsed?.y)

    return {
      x: Number.isFinite(x) ? x : Math.max(window.innerWidth - 440, 20),
      y: Number.isFinite(y) ? y : Math.max(window.innerHeight - 700, 20),
    }
  } catch {
    return {
      x: Math.max(window.innerWidth - 440, 20),
      y: Math.max(window.innerHeight - 700, 20),
    }
  }
}

const Home = () => {
  const [data, setData] = useState([])
  const [fileName, setFileName] = useState("boardsData")
  const [dirty, setDirty] = useState(false)
  const [fileHandle, setFileHandle] = useState(null)
  const [supportsFsAccess, setSupportsFsAccess] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [analyzingMap, setAnalyzingMap] = useState({})
  const [globalMessage, setGlobalMessage] = useState("")

  const [selectionByBoard, setSelectionByBoard] = useState({})
  const [lastSelectedByBoard, setLastSelectedByBoard] = useState({})
  const [activeBoardId, setActiveBoardId] = useState(null)

  const [bulkMoveIndex, setBulkMoveIndex] = useState("")
  const [bulkTitle, setBulkTitle] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false)

  const [floatingMenuPosition, setFloatingMenuPosition] = useState({
    x: 20,
    y: 20,
  })
  const [isMenuMinimized, setIsMenuMinimized] = useState(false)
  const dragStateRef = useRef(null)

  const markDirty = () => setDirty(true)

  const setAnalyzing = (key, value) => {
    setAnalyzingMap((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const selectionBoardIds = useMemo(
    () =>
      Object.entries(selectionByBoard)
        .filter(([, indexes]) => Array.isArray(indexes) && indexes.length > 0)
        .map(([boardId]) => boardId),
    [selectionByBoard],
  )

  const activeBoard =
    data.find((item) => item.id === activeBoardId) ||
    data.find((item) => selectionBoardIds.includes(item.id)) ||
    null

  const activeSelectedIndexes = activeBoard
    ? (selectionByBoard[activeBoard.id] || []).filter(
        (idx) => idx < activeBoard.images.length,
      )
    : []

  const activeAuthorListId = activeBoard
    ? `image-author-options-${activeBoard.id}`
    : "image-author-options-global"

  const activeFrequentAuthors = activeBoard
    ? Object.entries(
        (activeBoard.images || [])
          .map((img) => img.imageAuthor?.trim())
          .filter(Boolean)
          .reduce((acc, value) => {
            acc[value] = (acc[value] || 0) + 1
            return acc
          }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([value]) => value)
    : []

  const activeSelectionCount = activeSelectedIndexes.length

  const cycleBoard = (direction) => {
    if (!selectionBoardIds.length) return

    if (!activeBoardId || !selectionBoardIds.includes(activeBoardId)) {
      setActiveBoardId(selectionBoardIds[0])
      return
    }

    const currentIndex = selectionBoardIds.indexOf(activeBoardId)
    const nextIndex =
      direction === "prev"
        ? (currentIndex - 1 + selectionBoardIds.length) %
          selectionBoardIds.length
        : (currentIndex + 1) % selectionBoardIds.length

    setActiveBoardId(selectionBoardIds[nextIndex])
  }

  const clearBoardSelection = (boardId) => {
    setSelectionByBoard((prev) => ({
      ...prev,
      [boardId]: [],
    }))
    setLastSelectedByBoard((prev) => ({
      ...prev,
      [boardId]: null,
    }))

    if (activeBoardId === boardId) {
      const remainingBoardIds = selectionBoardIds.filter((id) => id !== boardId)
      setActiveBoardId(remainingBoardIds[0] || null)
    }
  }

  const selectAllImagesForActiveBoard = () => {
    if (!activeBoard) return

    const indexes = activeBoard.images.map((_, idx) => idx)

    setSelectionByBoard((prev) => ({
      ...prev,
      [activeBoard.id]: indexes,
    }))

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [activeBoard.id]: activeBoard.images.length
        ? activeBoard.images.length - 1
        : null,
    }))
  }

  const handleSelectImage = (boardId, idx, isShiftKey, imageCount) => {
    const lastSelectedIndex = lastSelectedByBoard[boardId]

    setActiveBoardId(boardId)

    setSelectionByBoard((prev) => {
      const current = (prev[boardId] || []).filter(
        (selectedIndex) => selectedIndex < imageCount,
      )

      if (
        isShiftKey &&
        lastSelectedIndex != null &&
        lastSelectedIndex < imageCount
      ) {
        const start = Math.min(lastSelectedIndex, idx)
        const end = Math.max(lastSelectedIndex, idx)
        const range = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        )
        const nextSet = new Set(current)

        range.forEach((value) => {
          nextSet.add(value)
        })

        return {
          ...prev,
          [boardId]: [...nextSet].sort((a, b) => a - b),
        }
      }

      if (current.includes(idx)) {
        return {
          ...prev,
          [boardId]: current.filter((value) => value !== idx),
        }
      }

      return {
        ...prev,
        [boardId]: [...current, idx].sort((a, b) => a - b),
      }
    })

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [boardId]: idx,
    }))
  }

  const handleMenuDragStart = (e) => {
    if (e.button !== 0) return

    dragStateRef.current = {
      offsetX: e.clientX - floatingMenuPosition.x,
      offsetY: e.clientY - floatingMenuPosition.y,
    }

    window.addEventListener("mousemove", handleMenuDragMove)
    window.addEventListener("mouseup", handleMenuDragEnd)
  }

  const handleMenuDragMove = (e) => {
    if (!dragStateRef.current) return

    const menuWidth = isMenuMinimized ? 52 : 300
    const menuHeight = isMenuMinimized ? 52 : 400
    const nextX = e.clientX - dragStateRef.current.offsetX
    const nextY = e.clientY - dragStateRef.current.offsetY

    const maxX = Math.max(window.innerWidth - menuWidth - 8, 0)
    const maxY = Math.max(window.innerHeight - menuHeight - 8, 0)

    setFloatingMenuPosition({
      x: clampIndex(nextX, maxX),
      y: clampIndex(nextY, maxY),
    })
  }

  const handleMenuDragEnd = () => {
    dragStateRef.current = null
    window.removeEventListener("mousemove", handleMenuDragMove)
    window.removeEventListener("mouseup", handleMenuDragEnd)
  }

  const analyzeSingleImage = async (
    itemId,
    index,
    imageUrl,
    currentTitle,
    currentAuthor,
  ) => {
    if (!imageUrl?.trim()) {
      alert("Missing image URL.")
      return
    }

    const imageKey = `${itemId}:${index}`

    try {
      setAnalyzing(imageKey, true)
      setGlobalMessage("")

      const response = await fetch("/api/gemini-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Analyze failed.")
      }

      markDirty()
      setData((prev) =>
        prev.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                images: item.images.map((img, i) =>
                  i !== index
                    ? img
                    : {
                        ...img,
                        title: payload?.title || currentTitle || "",
                        imageAuthor:
                          payload?.imageAuthor || currentAuthor || "",
                      },
                ),
              },
        ),
      )

      setGlobalMessage("Analyze complete.")
    } catch (err) {
      console.error(err)
      alert(err.message || "Analyze failed.")
    } finally {
      setAnalyzing(imageKey, false)
    }
  }

  const analyzeSelectedImages = async (
    itemId,
    selectedIndexes,
    images,
    options = {},
  ) => {
    const { overwriteTitle = false, overwriteAuthor = false } = options

    const targets = selectedIndexes
      .map((index) => ({
        index,
        image: images[index],
      }))
      .filter((entry) => entry?.image?.image?.trim())

    if (!targets.length) {
      alert("No valid image URLs in selected items.")
      return
    }

    try {
      setGlobalMessage(`Analyzing ${targets.length} image(s)...`)

      for (let i = 0; i < targets.length; i += 1) {
        const entry = targets[i]
        const imageKey = `${itemId}:${entry.index}`

        try {
          setAnalyzing(imageKey, true)

          const response = await fetch("/api/gemini-analyze", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageUrl: entry.image.image,
            }),
          })

          const payload = await response.json()

          if (!response.ok) {
            throw new Error(payload?.error || "Analyze failed.")
          }

          markDirty()
          setData((prev) =>
            prev.map((item) =>
              item.id !== itemId
                ? item
                : {
                    ...item,
                    images: item.images.map((img, idx) => {
                      if (idx !== entry.index) return img

                      const nextTitle =
                        overwriteTitle || !img.title?.trim()
                          ? payload?.title || img.title || ""
                          : img.title

                      const nextAuthor =
                        overwriteAuthor || !img.imageAuthor?.trim()
                          ? payload?.imageAuthor || img.imageAuthor || ""
                          : img.imageAuthor

                      return {
                        ...img,
                        title: nextTitle,
                        imageAuthor: nextAuthor,
                      }
                    }),
                  },
            ),
          )
        } catch (err) {
          console.error(err)
        } finally {
          setAnalyzing(imageKey, false)
        }

        setGlobalMessage(`Analyzed ${i + 1} of ${targets.length} image(s)...`)

        if (i < targets.length - 1) {
          await sleep(250)
        }
      }

      setGlobalMessage(`Finished analyzing ${targets.length} image(s).`)
    } catch (err) {
      console.error(err)
      alert(err.message || "Batch analyze failed.")
    }
  }

  useEffect(() => {
    setIsMounted(true)

    const browserSupportsFsAccess =
      typeof window !== "undefined" &&
      "showOpenFilePicker" in window &&
      "showSaveFilePicker" in window

    setSupportsFsAccess(browserSupportsFsAccess)

    try {
      const saved = localStorage.getItem(STORAGE_KEY)

      if (saved) {
        setData(JSON.parse(saved))
        setDirty(true)
      }

      setFloatingMenuPosition(getInitialFloatingMenuPosition())

      const savedMinimized = localStorage.getItem(FLOATING_MENU_MINIMIZED_KEY)
      setIsMenuMinimized(savedMinimized === "true")
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    if (!isMounted) return

    const restoreFileHandle = async () => {
      try {
        if (
          typeof window === "undefined" ||
          !("showOpenFilePicker" in window) ||
          !("indexedDB" in window)
        ) {
          return
        }

        const savedHandle = await getFileHandleFromDb()
        if (!savedHandle) return

        setFileHandle(savedHandle)

        const permission = await savedHandle.queryPermission({
          mode: "readwrite",
        })

        if (permission === "granted") {
          const file = await savedHandle.getFile()
          const text = await file.text()
          const parsed = JSON.parse(text)

          setFileName(file.name.replace(".json", ""))
          setData(normalizeLoadedData(parsed))
          setDirty(false)
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch (err) {
        console.error(err)
      }
    }

    restoreFileHandle()
  }, [isMounted])

  useEffect(() => {
    if (!isMounted) return
    if (!data.length) return

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data, isMounted])

  useEffect(() => {
    if (!isMounted) return

    try {
      localStorage.setItem(
        FLOATING_MENU_POSITION_KEY,
        JSON.stringify(floatingMenuPosition),
      )
    } catch (err) {
      console.error(err)
    }
  }, [floatingMenuPosition, isMounted])

  useEffect(() => {
    if (!isMounted) return

    try {
      localStorage.setItem(FLOATING_MENU_MINIMIZED_KEY, String(isMenuMinimized))
    } catch (err) {
      console.error(err)
    }
  }, [isMenuMinimized, isMounted])

  useEffect(() => {
    if (!isMounted) return

    const handleBeforeUnload = (e) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty, isMounted])

  useEffect(() => {
    if (!activeBoard && selectionBoardIds.length) {
      setActiveBoardId(selectionBoardIds[0])
    }

    if (!selectionBoardIds.length && activeBoardId) {
      setActiveBoardId(null)
    }
  }, [activeBoard, selectionBoardIds, activeBoardId])

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleMenuDragMove)
      window.removeEventListener("mouseup", handleMenuDragEnd)
    }
  }, [])

  const handleUpload = async () => {
    if (!supportsFsAccess) {
      alert("This browser does not support saving back to the same file.")
      return
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "JSON Files",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
        multiple: false,
      })

      const file = await handle.getFile()
      const text = await file.text()
      const parsed = JSON.parse(text)

      setFileHandle(handle)
      await saveFileHandleToDb(handle)

      setFileName(file.name.replace(".json", ""))
      setData(normalizeLoadedData(parsed))
      localStorage.removeItem(STORAGE_KEY)
      setDirty(false)

      setSelectionByBoard({})
      setLastSelectedByBoard({})
      setActiveBoardId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const requestFilePermission = async (handle) => {
    const current = await handle.queryPermission({ mode: "readwrite" })
    if (current === "granted") return true

    const requested = await handle.requestPermission({ mode: "readwrite" })
    return requested === "granted"
  }

  const handleSave = async () => {
    const clean = data.map(({ id, open, ...rest }) => rest)

    try {
      let handle = fileHandle

      if (!supportsFsAccess) {
        const blob = new Blob([JSON.stringify(clean, null, 2)], {
          type: "application/json",
        })

        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${fileName}.json`
        a.click()
        URL.revokeObjectURL(url)

        localStorage.removeItem(STORAGE_KEY)
        setDirty(false)
        return
      }

      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: `${fileName}.json`,
          types: [
            {
              description: "JSON Files",
              accept: {
                "application/json": [".json"],
              },
            },
          ],
        })

        setFileHandle(handle)
        await saveFileHandleToDb(handle)
      }

      const hasPermission = await requestFilePermission(handle)
      if (!hasPermission) {
        alert("Write permission was not granted.")
        return
      }

      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(clean, null, 2))
      await writable.close()

      localStorage.removeItem(STORAGE_KEY)
      setDirty(false)
    } catch (err) {
      console.error(err)
    }
  }

  const forgetSavedFile = async () => {
    try {
      await deleteFileHandleFromDb()
      setFileHandle(null)
    } catch (err) {
      console.error(err)
    }
  }

  const updateItem = (id, key, value) => {
    markDirty()
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    )
  }

  const toggleItem = (id) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, open: !item.open } : item,
      ),
    )
  }

  const collapseAllBoards = () => {
    setData((prev) =>
      prev.map((item) => ({
        ...item,
        open: false,
      })),
    )
  }

  const deleteItem = (id) => {
    if (!confirm("Delete this item?")) return
    markDirty()
    setData((prev) => prev.filter((item) => item.id !== id))

    setSelectionByBoard((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    setLastSelectedByBoard((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    if (activeBoardId === id) {
      setActiveBoardId(null)
    }
  }

  const createItem = () => {
    markDirty()
    setData((prev) => [
      ...prev,
      {
        id: createId(),
        title: "",
        eventStartYear: "",
        images: [],
        open: true,
      },
    ])
  }

  const addImage = (itemId) => {
    markDirty()
    setData((prev) =>
      prev.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              images: [
                ...item.images,
                { title: "", image: "", imageAuthor: "" },
              ],
            },
      ),
    )
  }

  const deleteImage = (itemId, index) => {
    markDirty()
    setData((prev) =>
      prev.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              images: item.images.filter((_, i) => i !== index),
            },
      ),
    )

    setSelectionByBoard((prev) => {
      const current = prev[itemId] || []
      const nextIndexes = current
        .filter((selectedIndex) => selectedIndex !== index)
        .map((selectedIndex) =>
          selectedIndex > index ? selectedIndex - 1 : selectedIndex,
        )

      return {
        ...prev,
        [itemId]: nextIndexes,
      }
    })

    setLastSelectedByBoard((prev) => {
      const current = prev[itemId]
      if (current == null) return prev

      return {
        ...prev,
        [itemId]:
          current === index ? null : current > index ? current - 1 : current,
      }
    })
  }

  const handleAnalyzeSelected = async () => {
    if (!activeBoard || activeSelectedIndexes.length === 0) {
      alert("Select image(s) first.")
      return
    }

    setIsBatchAnalyzing(true)

    try {
      await analyzeSelectedImages(
        activeBoard.id,
        activeSelectedIndexes,
        activeBoard.images,
        {
          overwriteTitle: false,
          overwriteAuthor: false,
        },
      )
    } finally {
      setIsBatchAnalyzing(false)
    }
  }

  const handleBulkMoveSubmit = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    const targetIndex = clampIndex(bulkMoveIndex, activeBoard.images.length)

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== activeBoard.id) return it

        return {
          ...it,
          images: moveSelectedImagesToIndex(
            it.images,
            activeSelectedIndexes,
            targetIndex,
          ),
        }
      }),
    )

    clearBoardSelection(activeBoard.id)
    setBulkMoveIndex("")
  }

  const handleBulkApplyTitle = () => {
    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== activeBoard.id
          ? it
          : {
              ...it,
              images: it.images.map((img, idx) =>
                selectedSet.has(idx) ? { ...img, title: bulkTitle } : img,
              ),
            },
      ),
    )

    clearBoardSelection(activeBoard.id)
    setBulkTitle("")
  }

  const handleBulkApplyAuthor = () => {
    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== activeBoard.id
          ? it
          : {
              ...it,
              images: it.images.map((img, idx) =>
                selectedSet.has(idx)
                  ? { ...img, imageAuthor: bulkAuthor }
                  : img,
              ),
            },
      ),
    )

    clearBoardSelection(activeBoard.id)
    setBulkAuthor("")
  }

  const handleBulkMoveToTop = () => {
    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== activeBoard.id) return it
        return {
          ...it,
          images: moveSelectedImagesToIndex(
            it.images,
            activeSelectedIndexes,
            0,
          ),
        }
      }),
    )

    clearBoardSelection(activeBoard.id)
  }

  const handleBulkMoveToBottom = () => {
    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== activeBoard.id) return it
        return {
          ...it,
          images: moveSelectedImagesToIndex(
            it.images,
            activeSelectedIndexes,
            it.images.length,
          ),
        }
      }),
    )

    clearBoardSelection(activeBoard.id)
  }

  const handleBulkDelete = () => {
    if (!activeBoard || activeSelectedIndexes.length <= 1) return

    if (!confirm(`Delete ${activeSelectedIndexes.length} selected image(s)?`)) {
      return
    }

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== activeBoard.id
          ? it
          : {
              ...it,
              images: it.images.filter((_, idx) => !selectedSet.has(idx)),
            },
      ),
    )

    clearBoardSelection(activeBoard.id)
    setBulkMoveIndex("")
  }

  useEffect(() => {
    if (!isMounted) return

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSave()
      }

      if (e.key === "Escape") {
        const tagName = e.target?.tagName?.toLowerCase()
        const isTypingTarget =
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          e.target?.isContentEditable

        if (!isTypingTarget && activeBoardId) {
          clearBoardSelection(activeBoardId)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [data, fileName, fileHandle, supportsFsAccess, isMounted, activeBoardId])

  const showGlobalBulkActions = activeSelectionCount > 1 && !!activeBoard

  return (
    <main className="flex-column" style={{ padding: 20 }}>
      {globalMessage ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            border: "1px solid #ccc",
            fontSize: 12,
            fontWeight: "bold",
          }}
        >
          {globalMessage}
        </div>
      ) : null}

      <div className="flex-row">
        <MdOutlineFolder
          className="icon-button"
          size={ICON_SIZE}
          onClick={handleUpload}
          title="Load json"
          style={{ cursor: "pointer" }}
        />
        <IoMdAdd
          className="icon-button"
          size={ICON_SIZE}
          onClick={createItem}
          title="Create Board"
          style={{ cursor: "pointer" }}
        />
        <MdSaveAlt
          className="icon-button"
          size={ICON_SIZE}
          onClick={handleSave}
          title="Save Board"
          style={{ cursor: "pointer" }}
        />
        <MdClear
          className="icon-button"
          size={ICON_SIZE}
          onClick={forgetSavedFile}
          title="Clear Board json"
          style={{ cursor: "pointer" }}
        />
        <TbLayoutBottombarCollapse
          className="icon-button"
          size={ICON_SIZE}
          onClick={collapseAllBoards}
          title="Collapse All Boards"
          style={{ cursor: "pointer" }}
        />
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        file: {fileName}
        {fileHandle ? " | remembered" : ""}
        {isMounted && !supportsFsAccess
          ? " | browser does not support same-file save"
          : ""}
      </div>

      <div className="flex-column">
        {data
          .filter(
            (item) =>
              item.open ||
              item.images.length === 0 ||
              item.images.some((img) => img.image?.trim()),
          )
          .map((item, index) => (
            <BoardItem
              key={item.id}
              item={item}
              index={index}
              toggleItem={toggleItem}
              updateItem={updateItem}
              deleteItem={deleteItem}
              addImage={addImage}
              deleteImage={deleteImage}
              setData={setData}
              markDirty={markDirty}
              analyzeSingleImage={analyzeSingleImage}
              analyzingMap={analyzingMap}
              selectedIndexes={(selectionByBoard[item.id] || []).filter(
                (selectedIndex) => selectedIndex < item.images.length,
              )}
              onSelectImage={(idx, isShiftKey) =>
                handleSelectImage(item.id, idx, isShiftKey, item.images.length)
              }
              setActiveBoardId={setActiveBoardId}
            />
          ))}
      </div>

      {showGlobalBulkActions && !isMenuMinimized && (
        <div
          className="flex-column"
          style={{
            position: "fixed",
            left: floatingMenuPosition.x,
            top: floatingMenuPosition.y,
            width: 300,
            borderRadius: 20,
            background: "#fff",
            padding: 20,
            zIndex: 9999,
            boxShadow: "0 5px 10px rgba(0,0,0,0.5)",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "center",
              cursor: "grab",
              userSelect: "none",
            }}
            onMouseDown={handleMenuDragStart}
            title="Drag menu"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: "bold",
              }}
            >
              <MdDragIndicator size={20} />
              <span>Selection Menu</span>
            </div>

            <FiMinus
              size={20}
              title="Minimize menu"
              onClick={(e) => {
                e.stopPropagation()
                setIsMenuMinimized(true)
              }}
            />
          </div>
          <div
            className="flex-row"
            style={{
              flexWrap: "nowrap",
              alignItems: "center",
            }}
          >
            <img
              src={activeBoard.images[0].image || defaultImage}
              alt=""
              style={{
                width: 60,
                height: 40,
                objectFit: "cover",
              }}
            />
            <select
              value={activeBoard.id}
              onChange={(e) => setActiveBoardId(e.target.value)}
            >
              {selectionBoardIds.map((boardId) => {
                const board = data.find((item) => item.id === boardId)
                if (!board) return null

                const count = (selectionByBoard[boardId] || []).length

                return (
                  <option key={boardId} value={boardId}>
                    {(board.title || "Untitled") + ` (${count})`}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="flex-row">
            <MdChevronLeft
              className="icon-button"
              title="Previous board"
              size={ICON_SIZE}
              onClick={() => cycleBoard("prev")}
            />
            <MdChevronRight
              className="icon-button"
              title="Previous board"
              size={ICON_SIZE}
              onClick={() => cycleBoard("next")}
            />
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="number"
              min="0"
              max={activeBoard.images.length}
              required
              placeholder="move selected to index"
              value={bulkMoveIndex}
              onChange={(e) => setBulkMoveIndex(e.target.value)}
            />
            <IoMdArrowUp
              className="icon-button"
              title="Move Selected"
              size={ICON_SIZE}
              onSubmit={handleBulkMoveSubmit}
              style={{
                width: 20,
                height: 20,
                padding: 3,
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
              }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <input
              placeholder="apply same title to selected"
              value={bulkTitle}
              onChange={(e) => setBulkTitle(e.target.value)}
            />
            <IoMdArrowUp
              className="icon-button"
              title="Apply Title"
              size={ICON_SIZE}
              onClick={handleBulkApplyTitle}
              style={{
                width: 20,
                height: 20,
                padding: 3,
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
              }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <input
              list={activeAuthorListId}
              placeholder="apply same author to selected"
              value={bulkAuthor}
              onChange={(e) => setBulkAuthor(e.target.value)}
            />
            <IoMdArrowUp
              className="icon-button"
              title="Apply Author"
              size={ICON_SIZE}
              onClick={handleBulkApplyAuthor}
              style={{
                width: 20,
                height: 20,
                padding: 3,
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
              }}
            />
          </div>
          <div className="flex-row">
            <MdCheck
              className="icon-button"
              size={ICON_SIZE}
              onClick={selectAllImagesForActiveBoard}
              title="Select All In Board"
              style={{ cursor: "pointer" }}
            />
            <IoMdClose
              className="icon-button"
              size={ICON_SIZE}
              onClick={() => clearBoardSelection(activeBoard.id)}
              title="Deselect Board"
              style={{ cursor: "pointer" }}
            />
            <RiImageAiFill
              disabled={isBatchAnalyzing}
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleAnalyzeSelected}
              title={
                isBatchAnalyzing ? "Analyzing Selected..." : "Analyze Selected"
              }
              style={{ cursor: "pointer" }}
            />
            <IoMdArrowRoundUp
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleBulkMoveToTop}
              title="Move Selected To Top"
              style={{ cursor: "pointer" }}
            />
            <IoMdArrowRoundDown
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleBulkMoveToBottom}
              title="Move Selected To Bottom"
              style={{ cursor: "pointer" }}
            />
            <AiOutlineDelete
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleBulkDelete}
              title="Delete Selected"
              style={{ cursor: "pointer" }}
            />
          </div>

          <datalist id={activeAuthorListId}>
            {activeFrequentAuthors.map((author) => (
              <option key={author} value={author} />
            ))}
          </datalist>
        </div>
      )}

      {showGlobalBulkActions && isMenuMinimized && (
        <MdMenu
          title="Show selection menu"
          onClick={() => setIsMenuMinimized(false)}
          onMouseDown={handleMenuDragStart}
          size={ICON_SIZE}
          className="icon-button"
          style={{
            position: "fixed",
            left: floatingMenuPosition.x,
            top: floatingMenuPosition.y,
            zIndex: 9999,
            width: 50,
            height: 50,
            padding: 10,
            boxShadow: "0 5px 10px rgba(0,0,0,0.)",
            cursor: "grab",
          }}
        />
      )}
    </main>
  )
}

const BoardItem = ({
  item,
  index,
  toggleItem,
  updateItem,
  deleteItem,
  addImage,
  deleteImage,
  setData,
  markDirty,
  analyzeSingleImage,
  analyzingMap,
  selectedIndexes,
  onSelectImage,
  setActiveBoardId,
}) => {
  const duplicateUrls = getDuplicateImages(item.images)
  const missingTitleCount = item.images.filter(
    (img) => !img.title?.trim(),
  ).length
  const missingAuthorCount = item.images.filter(
    (img) => !img.imageAuthor?.trim(),
  ).length

  const frequentAuthors = Object.entries(
    (item.images || [])
      .map((img) => img.imageAuthor?.trim())
      .filter(Boolean)
      .reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1
        return acc
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)

  const authorListId = `image-author-options-${item.id}`

  const moveImageToTop = (idx) => {
    if (idx <= 0) return
    markDirty()

    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveImageInArray(it.images, idx, 0),
        }
      }),
    )
  }

  const moveImageToBottom = (idx) => {
    if (idx === item.images.length - 1) return
    markDirty()

    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveImageInArray(it.images, idx, it.images.length - 1),
        }
      }),
    )
  }

  const moveImageToIndex = (fromIndex, rawTargetIndex) => {
    const targetIndex = clampIndex(rawTargetIndex, item.images.length - 1)
    if (fromIndex === targetIndex) return

    markDirty()

    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveImageInArray(it.images, fromIndex, targetIndex),
        }
      }),
    )
  }

  const add10Images = () => {
    markDirty()
    const newImages = Array.from({ length: 10 }).map(() => ({
      title: "",
      image: "",
      imageAuthor: "",
    }))

    setData((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, images: [...it.images, ...newImages] }
          : it,
      ),
    )
  }

  const handleLoadJsonToItem = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (!Array.isArray(parsed)) {
        alert("JSON must be an array of objects.")
        e.target.value = ""
        return
      }

      const newImages = parsed.map((img) => ({
        title: img?.title || "",
        image: img?.image || "",
        imageAuthor: img?.imageAuthor || "",
      }))

      markDirty()
      setData((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, images: [...it.images, ...newImages] }
            : it,
        ),
      )
    } catch {
      alert("Invalid JSON file.")
    }

    e.target.value = ""
  }

  const handleAutoDeleteDuplicates = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (duplicateUrls.size === 0) return

    markDirty()

    const seen = new Set()
    const dedupedImages = item.images.filter((img) => {
      const normalizedUrl = normalizeImageUrl(img.image)

      if (!normalizedUrl) return true
      if (seen.has(normalizedUrl)) return false

      seen.add(normalizedUrl)
      return true
    })

    setData((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, images: dedupedImages } : it,
      ),
    )
  }

  const handleImageDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = Number(active.id)
    const newIndex = Number(over.id)

    const newImages = arrayMove(item.images, oldIndex, newIndex)

    markDirty()
    setData((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, images: newImages } : it)),
    )
  }

  return (
    <div
      className="flex-column"
      style={{
        border: "1px solid #ccc",
        padding: 10,
      }}
    >
      <div className="flex-between">
        <div
          onClick={() => toggleItem(item.id)}
          className="flex-row"
          style={{
            cursor: "pointer",
            fontWeight: "bold",
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          <span>
            {index + 1}. {item.title || "Untitled"} ({item.eventStartYear}) |{" "}
            {item.images.length} images | {missingTitleCount} missing titles |{" "}
            {missingAuthorCount} missing authors
            {duplicateUrls.size > 0
              ? ` | ${duplicateUrls.size} duplicates`
              : ""}
            {selectedIndexes.length > 0
              ? ` | ${selectedIndexes.length} selected`
              : ""}
          </span>

          {duplicateUrls.size > 0 && (
            <button
              onClick={handleAutoDeleteDuplicates}
              style={{ width: "fit-content" }}
            >
              Auto Delete Duplicates
            </button>
          )}
        </div>

        <AiOutlineDelete
          className="icon-button"
          size={ICON_SIZE}
          onClick={() => deleteItem(item.id)}
          title="Delete Item"
          style={{ cursor: "pointer" }}
        />
      </div>

      {item.open && (
        <>
          <input
            placeholder="board title"
            value={item.title}
            onChange={(e) => updateItem(item.id, "title", e.target.value)}
          />

          <input
            placeholder="board eventStartYear"
            value={item.eventStartYear}
            onChange={(e) =>
              updateItem(item.id, "eventStartYear", e.target.value)
            }
          />

          <input type="file" accept=".json" onChange={handleLoadJsonToItem} />

          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleImageDragEnd}
          >
            <SortableContext
              items={item.images.map((_, i) => i.toString())}
              strategy={rectSortingStrategy}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))",
                  gap: 10,
                }}
              >
                {item.images.map((img, idx) => (
                  <SortableImage
                    key={idx}
                    id={idx.toString()}
                    img={img}
                    index={idx}
                    itemId={item.id}
                    authorListId={authorListId}
                    updateImage={updateItemImage(setData, markDirty)}
                    deleteImage={deleteImage}
                    moveImageToTop={moveImageToTop}
                    moveImageToBottom={moveImageToBottom}
                    moveImageToIndex={moveImageToIndex}
                    isDuplicate={duplicateUrls.has(
                      normalizeImageUrl(img.image),
                    )}
                    isSelected={selectedIndexes.includes(idx)}
                    onSelectImage={(imageIndex, isShiftKey) => {
                      setActiveBoardId(item.id)
                      onSelectImage(imageIndex, isShiftKey)
                    }}
                    maxIndex={item.images.length - 1}
                    analyzeImage={analyzeSingleImage}
                    isAnalyzing={!!analyzingMap[`${item.id}:${idx}`]}
                  />
                ))}
              </div>

              <datalist id={authorListId}>
                {frequentAuthors.map((author) => (
                  <option key={author} value={author} />
                ))}
              </datalist>

              <button type="button" onClick={() => addImage(item.id)}>
                Add Image
              </button>
              <button type="button" onClick={add10Images}>
                Add 10 Images
              </button>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}

const updateItemImage = (setData, markDirty) => (itemId, index, key, value) => {
  markDirty()
  setData((prev) =>
    prev.map((item) =>
      item.id !== itemId
        ? item
        : {
            ...item,
            images: item.images.map((img, i) =>
              i === index ? { ...img, [key]: value } : img,
            ),
          },
    ),
  )
}

const SortableImage = ({
  id,
  img,
  index,
  itemId,
  authorListId,
  updateImage,
  deleteImage,
  moveImageToTop,
  moveImageToBottom,
  moveImageToIndex,
  isDuplicate,
  isSelected,
  onSelectImage,
  maxIndex,
  analyzeImage,
  isAnalyzing,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id })

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [moveToIndexValue, setMoveToIndexValue] = useState("")
  const embedUrl = getYoutubeEmbedUrl(img.image)
  const mediaId = `media-${itemId}-${index}`

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      const el = document.getElementById(mediaId)
      if (!el) return

      await el.requestFullscreen()
    } catch {}
  }

  const handleGoogleImageSearch = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!img.image?.trim()) return

    window.open(
      `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(img.image)}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  const handleAnalyze = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!img.image?.trim()) {
      alert("This item has no image URL.")
      return
    }

    await analyzeImage(itemId, index, img.image, img.title, img.imageAuthor)
  }

  const handleMoveToIndexSubmit = (e) => {
    e.preventDefault()
    e.stopPropagation()

    moveImageToIndex(index, moveToIndexValue)
    setMoveToIndexValue("")
  }

  const handleCardClick = (e) => {
    if (
      e.target.closest("input") ||
      e.target.closest("textarea") ||
      e.target.closest("button") ||
      e.target.closest("iframe") ||
      e.target.closest("label")
    ) {
      return
    }

    onSelectImage(index, e.shiftKey)
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      const el = document.getElementById(mediaId)
      setIsFullscreen(document.fullscreenElement === el)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [mediaId])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: isSelected
      ? "4px solid #111"
      : isDuplicate
        ? "5px solid crimson"
        : "1px solid #00000025",
    borderRadius: 10,
    padding: 10,
    cursor: "pointer",
    userSelect: "none",
  }

  const mediaWrapperStyle = {
    width: "100%",
    cursor: "pointer",
    background: "#000",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    height: 200,
  }

  const mediaStyle = isFullscreen
    ? {
        maxWidth: "100vw",
        maxHeight: "100vh",
        width: "auto",
        height: "auto",
        objectFit: "contain",
      }
    : {
        width: "100%",
        height: 200,
        objectFit: "cover",
      }

  const iframeStyle = isFullscreen
    ? {
        width: "100vw",
        height: "100vh",
        border: "none",
      }
    : {
        width: "100%",
        height: 200,
        border: "none",
      }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-column"
      onClick={handleCardClick}
    >
      <div className="flex-between">
        <div style={{ fontWeight: "bold" }}>{index + 1}</div>

        <div
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", width: "fit-content" }}
          onClick={(e) => e.stopPropagation()}
        >
          drag
        </div>
      </div>

      {embedUrl ? (
        <div id={mediaId} onClick={toggleFullscreen} style={mediaWrapperStyle}>
          <iframe
            src={embedUrl}
            style={iframeStyle}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : img.image ? (
        <div id={mediaId} onClick={toggleFullscreen} style={mediaWrapperStyle}>
          <div
            className="flex-row"
            style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}
          >
            <IoLogoGoogle
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleGoogleImageSearch}
              title="Google"
              style={{
                cursor: "pointer",
              }}
            />
            <RiImageAiFill
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleAnalyze}
              title={isAnalyzing ? "Analyzing..." : "Analyze"}
              style={{ cursor: "pointer" }}
            />
          </div>

          <img loading="lazy" src={img.image} style={mediaStyle} />
        </div>
      ) : (
        <div
          style={{
            ...mediaWrapperStyle,
            background: "#f3f3f3",
            color: "#666",
            border: "1px solid #ddd",
          }}
        >
          <span>No image</span>
        </div>
      )}

      <input
        placeholder="image"
        value={img.image}
        onChange={(e) => updateImage(itemId, index, "image", e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />

      <textarea
        placeholder="image title"
        value={img.title}
        onChange={(e) => updateImage(itemId, index, "title", e.target.value)}
        onClick={(e) => e.stopPropagation()}
        rows={8}
        style={{
          width: "100%",
          padding: 5,
          resize: "vertical",
          border: !img.title?.trim() ? "2px solid crimson" : undefined,
        }}
      />

      <form
        onSubmit={handleMoveToIndexSubmit}
        style={{ display: "flex", gap: 10 }}
      >
        <input
          type="number"
          min="0"
          max={maxIndex}
          required
          placeholder="target index"
          value={moveToIndexValue}
          onChange={(e) => setMoveToIndexValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <button type="submit">Move To Index</button>
      </form>
      <div className="flex-row">
        <input
          list={authorListId}
          placeholder="image author"
          value={img.imageAuthor}
          onChange={(e) =>
            updateImage(itemId, index, "imageAuthor", e.target.value)
          }
          onClick={(e) => e.stopPropagation()}
          style={{
            border: !img.imageAuthor?.trim() ? "2px solid green" : undefined,
          }}
        />
        <IoMdArrowRoundUp
          className="icon-button"
          size={ICON_SIZE}
          onClick={(e) => {
            e.stopPropagation()
            moveImageToTop(index)
          }}
          title="Move To Top"
          style={{ cursor: "pointer" }}
        />
        <IoMdArrowRoundDown
          className="icon-button"
          size={ICON_SIZE}
          onClick={(e) => {
            e.stopPropagation()
            moveImageToBottom(index)
          }}
          title="Move To Bottom"
          style={{ cursor: "pointer" }}
        />
        <AiOutlineDelete
          className="icon-button"
          size={ICON_SIZE}
          onClick={(e) => {
            e.stopPropagation()
            deleteImage(itemId, index)
          }}
          title="Delete"
          style={{ cursor: "pointer" }}
        />
      </div>
    </div>
  )
}

export default Home
