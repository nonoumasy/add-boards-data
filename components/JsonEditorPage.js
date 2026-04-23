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
  MdDragIndicator,
  MdCheck,
  MdClose,
  MdContentCopy,
  MdOutlineDragIndicator,
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
import { TbLayoutBottombarCollapse, TbNumber10Small } from "react-icons/tb"
import { FooterComp } from "@/components/FooterComp"
import { HiPlusSm } from "react-icons/hi"

const ICON_SIZE = 24
const defaultImage =
  "https://i.pinimg.com/1200x/27/ff/37/27ff3733ece0a0d09d76d1288f2dbef4.jpg"

const STORAGE_KEY = "json-editor-data"
const FILE_HANDLE_DB = "json-editor-file-db"
const FILE_HANDLE_STORE = "handles"
const FILE_HANDLE_KEY = "active-json-file"
const FLOATING_MENU_POSITION_KEY = "json-editor-floating-menu-position-v1"

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

// ---------- HELPERS ----------
const normalizeImageUrl = (url) => {
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

const getDuplicateImageKeys = (images) => {
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

const getDuplicateItemCount = (images) => {
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

const getFloatingTransform = (x, y) => `translate3d(${x}px, ${y}px, 0)`

const closeAllBoards = (items) =>
  items.map((item) => ({
    ...item,
    open: false,
  }))

const JsonEditorPage = () => {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch (err) {
      console.error(err)
      return []
    }
  })

  const [fileName, setFileName] = useState("boardsData")

  const [dirty, setDirty] = useState(() => {
    try {
      return !!localStorage.getItem(STORAGE_KEY)
    } catch (err) {
      console.error(err)
      return false
    }
  })

  const [fileHandle, setFileHandle] = useState(null)

  const [selectionByBoard, setSelectionByBoard] = useState({})
  const [lastSelectedByBoard, setLastSelectedByBoard] = useState({})

  const [bulkMoveIndex, setBulkMoveIndex] = useState("")
  const [bulkMoveBoardId, setBulkMoveBoardId] = useState("")
  const [bulkTitle, setBulkTitle] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")

  const [floatingMenuPosition, setFloatingMenuPosition] = useState(() =>
    getInitialFloatingMenuPosition(),
  )

  const [fullscreenViewer, setFullscreenViewer] = useState(null)

  const dragStateRef = useRef(null)
  const dragPositionRef = useRef(getInitialFloatingMenuPosition())
  const dragRafRef = useRef(null)
  const menuRef = useRef(null)
  const openBoardRef = useRef(null)

  const supportsFsAccess =
    "showOpenFilePicker" in window && "showSaveFilePicker" in window

  const markDirty = () => setDirty(true)

  const openBoard = useMemo(
    () => data.find((item) => item.open) || null,
    [data],
  )

  const openBoardId = openBoard?.id || null

  const openBoardDuplicateCount = openBoard
    ? getDuplicateItemCount(openBoard.images)
    : 0

  const activeSelectedIndexes = openBoard
    ? (selectionByBoard[openBoard.id] || []).filter(
        (idx) => idx < openBoard.images.length,
      )
    : []

  const targetBoardOptions = data.filter((item) => item.id !== openBoardId)

  const activeAuthorListId = openBoard
    ? `image-author-options-${openBoard.id}`
    : "image-author-options-global"

  const activeFrequentAuthors = openBoard
    ? Object.entries(
        (openBoard.images || [])
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

  const previewImage =
    openBoard?.images.find(
      (img) => img.image?.trim() && !getYoutubeEmbedUrl(img.image),
    )?.image || defaultImage

  const menuDisabled = !openBoard

  const applyFloatingPositionToNode = (x, y) => {
    const node = menuRef.current
    if (!node) return
    node.style.transform = getFloatingTransform(x, y)
  }

  const scrollToOpenBoardBottom = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = openBoardRef.current
        if (!el) return

        el.scrollIntoView({
          behavior: "smooth",
          block: "end",
        })

        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        })
      })
    })
  }

  const handleMenuLoadJson = async (e) => {
    if (!openBoardId) {
      e.target.value = ""
      return
    }

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
        prev.map((item) =>
          item.id !== openBoardId
            ? item
            : {
                ...item,
                images: [...item.images, ...newImages],
              },
        ),
      )

      scrollToOpenBoardBottom()
    } catch {
      alert("Invalid JSON file.")
    }

    e.target.value = ""
  }

  const handleOpenBoardAutoDeleteDuplicates = () => {
    if (!openBoard || openBoardDuplicateCount === 0) return

    const seen = new Set()

    const dedupedImages = openBoard.images.filter((img) => {
      const key = normalizeImageUrl(img.image)

      if (!key) return true
      if (seen.has(key)) return false

      seen.add(key)
      return true
    })

    markDirty()

    setData((prev) =>
      prev.map((item) =>
        item.id === openBoard.id ? { ...item, images: dedupedImages } : item,
      ),
    )

    setSelectionByBoard((prev) => ({
      ...prev,
      [openBoard.id]: [],
    }))

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [openBoard.id]: null,
    }))

    setBulkMoveIndex("")
    setBulkMoveBoardId("")

    if (fullscreenViewer?.boardId === openBoard.id) {
      setFullscreenViewer(null)
    }
  }

  const handleMoveSelectedToBoard = () => {
    if (
      menuDisabled ||
      !bulkMoveBoardId ||
      activeSelectedIndexes.length === 0
    ) {
      return
    }

    const selectedSet = new Set(activeSelectedIndexes)
    const movedImages = openBoard.images.filter((_, idx) =>
      selectedSet.has(idx),
    )

    if (!movedImages.length) return

    markDirty()

    setData((prev) =>
      prev.map((item) => {
        if (item.id === openBoard.id) {
          return {
            ...item,
            images: item.images.filter((_, idx) => !selectedSet.has(idx)),
          }
        }

        if (item.id === bulkMoveBoardId) {
          return {
            ...item,
            images: [...item.images, ...movedImages],
          }
        }

        return item
      }),
    )

    setSelectionByBoard((prev) => ({
      ...prev,
      [openBoard.id]: [],
    }))

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [openBoard.id]: null,
    }))

    setBulkMoveBoardId("")
    setBulkMoveIndex("")

    if (
      fullscreenViewer?.boardId === openBoard.id &&
      selectedSet.has(fullscreenViewer.imageIndex)
    ) {
      setFullscreenViewer(null)
    }
  }

  const handleCopySelectedToBoard = () => {
    if (
      menuDisabled ||
      !bulkMoveBoardId ||
      activeSelectedIndexes.length === 0
    ) {
      return
    }

    const selectedSet = new Set(activeSelectedIndexes)
    const copiedImages = openBoard.images
      .filter((_, idx) => selectedSet.has(idx))
      .map((img) => ({
        title: img.title || "",
        image: img.image || "",
        imageAuthor: img.imageAuthor || "",
      }))

    if (!copiedImages.length) return

    markDirty()

    setData((prev) =>
      prev.map((item) =>
        item.id === bulkMoveBoardId
          ? {
              ...item,
              images: [...item.images, ...copiedImages],
            }
          : item,
      ),
    )

    setBulkMoveBoardId("")
  }

  const handleMenuDragMove = (e) => {
    if (!dragStateRef.current) return

    const nextX = e.clientX - dragStateRef.current.offsetX
    const nextY = e.clientY - dragStateRef.current.offsetY

    const maxX = Math.max(
      window.innerWidth - dragStateRef.current.menuWidth - 8,
      0,
    )
    const maxY = Math.max(
      window.innerHeight - dragStateRef.current.menuHeight - 8,
      0,
    )

    dragPositionRef.current = {
      x: clampIndex(nextX, maxX),
      y: clampIndex(nextY, maxY),
    }

    if (dragRafRef.current) return

    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      applyFloatingPositionToNode(
        dragPositionRef.current.x,
        dragPositionRef.current.y,
      )
    })
  }

  const handleMenuDragEnd = () => {
    if (!dragStateRef.current) return

    dragStateRef.current = null
    window.removeEventListener("mousemove", handleMenuDragMove)
    window.removeEventListener("mouseup", handleMenuDragEnd)

    if (dragRafRef.current) {
      window.cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }

    setFloatingMenuPosition({
      x: dragPositionRef.current.x,
      y: dragPositionRef.current.y,
    })
  }

  const handleMenuDragStart = (e) => {
    if (e.button !== 0) return

    dragStateRef.current = {
      offsetX: e.clientX - dragPositionRef.current.x,
      offsetY: e.clientY - dragPositionRef.current.y,
      menuWidth: 300,
      menuHeight: 470,
    }

    window.addEventListener("mousemove", handleMenuDragMove, { passive: true })
    window.addEventListener("mouseup", handleMenuDragEnd)
  }

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (!data.length) return

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    dragPositionRef.current = floatingMenuPosition

    try {
      localStorage.setItem(
        FLOATING_MENU_POSITION_KEY,
        JSON.stringify(floatingMenuPosition),
      )
    } catch (err) {
      console.error(err)
    }
  }, [floatingMenuPosition])

  useEffect(() => {
    applyFloatingPositionToNode(
      dragPositionRef.current.x,
      dragPositionRef.current.y,
    )
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    return () => {
      if (dragRafRef.current) {
        window.cancelAnimationFrame(dragRafRef.current)
      }

      window.removeEventListener("mousemove", handleMenuDragMove)
      window.removeEventListener("mouseup", handleMenuDragEnd)
    }
  }, [])

  const handleOpenBoard = (boardId) => {
    const clickedBoard = data.find((item) => item.id === boardId)
    const willOpen = clickedBoard ? !clickedBoard.open : false

    setData((prev) =>
      prev.map((item) => ({
        ...item,
        open: item.id === boardId ? willOpen : false,
      })),
    )

    setSelectionByBoard((prev) => {
      const next = {}
      if (willOpen) {
        next[boardId] = prev[boardId] || []
      }
      return next
    })

    setLastSelectedByBoard((prev) => {
      const next = {}
      if (willOpen) {
        next[boardId] = prev[boardId] ?? null
      }
      return next
    })

    setBulkMoveIndex("")
    setBulkMoveBoardId("")
    setBulkTitle("")
    setBulkAuthor("")
  }

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
      setFullscreenViewer(null)
      setBulkMoveIndex("")
      setBulkMoveBoardId("")
      setBulkTitle("")
      setBulkAuthor("")
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

  const collapseAllBoards = () => {
    setData((prev) => closeAllBoards(prev))
    setSelectionByBoard({})
    setLastSelectedByBoard({})
    setBulkMoveIndex("")
    setBulkMoveBoardId("")
    setBulkTitle("")
    setBulkAuthor("")
  }

  const closeOpenBoard = () => {
    if (!openBoardId) return

    setData((prev) =>
      prev.map((item) => ({
        ...item,
        open: false,
      })),
    )

    setSelectionByBoard({})
    setLastSelectedByBoard({})
    setBulkMoveIndex("")
    setBulkMoveBoardId("")
    setBulkTitle("")
    setBulkAuthor("")
  }

  const deleteItem = (id) => {
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

    if (fullscreenViewer?.boardId === id) {
      setFullscreenViewer(null)
    }

    if (openBoardId === id) {
      setBulkMoveIndex("")
      setBulkMoveBoardId("")
      setBulkTitle("")
      setBulkAuthor("")
    }
  }

  const createItem = () => {
    const newId = createId()

    markDirty()
    setData((prev) =>
      closeAllBoards([
        ...prev,
        {
          id: newId,
          title: "",
          eventStartYear: "",
          images: [],
          open: true,
        },
      ]),
    )

    setSelectionByBoard({
      [newId]: [],
    })

    setLastSelectedByBoard({
      [newId]: null,
    })

    setBulkMoveIndex("")
    setBulkMoveBoardId("")
    setBulkTitle("")
    setBulkAuthor("")
  }

  const addImage = () => {
    if (!openBoardId) return

    markDirty()
    setData((prev) =>
      prev.map((item) =>
        item.id !== openBoardId
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

    scrollToOpenBoardBottom()
  }

  const add10Images = () => {
    if (!openBoardId) return

    const newImages = Array.from({ length: 10 }).map(() => ({
      title: "",
      image: "",
      imageAuthor: "",
    }))

    markDirty()
    setData((prev) =>
      prev.map((item) =>
        item.id !== openBoardId
          ? item
          : {
              ...item,
              images: [...item.images, ...newImages],
            },
      ),
    )

    scrollToOpenBoardBottom()
  }

  const handleSelectImage = (idx, isShiftKey, imageCount) => {
    if (!openBoardId) return

    const lastSelectedIndex = lastSelectedByBoard[openBoardId]

    setSelectionByBoard((prev) => {
      const current = (prev[openBoardId] || []).filter(
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
          [openBoardId]: [...nextSet].sort((a, b) => a - b),
        }
      }

      if (current.includes(idx)) {
        return {
          ...prev,
          [openBoardId]: current.filter((value) => value !== idx),
        }
      }

      return {
        ...prev,
        [openBoardId]: [...current, idx].sort((a, b) => a - b),
      }
    })

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [openBoardId]: idx,
    }))
  }

  const clearOpenBoardSelection = () => {
    if (!openBoardId) return

    setSelectionByBoard((prev) => ({
      ...prev,
      [openBoardId]: [],
    }))
    setLastSelectedByBoard((prev) => ({
      ...prev,
      [openBoardId]: null,
    }))
  }

  const selectAllImagesForActiveBoard = () => {
    if (!openBoard) return

    const indexes = openBoard.images.map((_, idx) => idx)

    setSelectionByBoard((prev) => ({
      ...prev,
      [openBoard.id]: indexes,
    }))

    setLastSelectedByBoard((prev) => ({
      ...prev,
      [openBoard.id]: openBoard.images.length
        ? openBoard.images.length - 1
        : null,
    }))
  }

  const openFullscreenViewer = (imageIndex) => {
    if (!openBoardId) return
    setFullscreenViewer({ boardId: openBoardId, imageIndex })
  }

  const closeFullscreenViewer = () => {
    setFullscreenViewer(null)
  }

  const goToPrevFullscreenItem = () => {
    setFullscreenViewer((prev) => {
      if (!prev) return prev

      const board = data.find((item) => item.id === prev.boardId)
      if (!board || !board.images.length) return null

      const nextIndex =
        prev.imageIndex <= 0 ? board.images.length - 1 : prev.imageIndex - 1

      return {
        ...prev,
        imageIndex: nextIndex,
      }
    })
  }

  const goToNextFullscreenItem = () => {
    setFullscreenViewer((prev) => {
      if (!prev) return prev

      const board = data.find((item) => item.id === prev.boardId)
      if (!board || !board.images.length) return null

      const nextIndex =
        prev.imageIndex >= board.images.length - 1 ? 0 : prev.imageIndex + 1

      return {
        ...prev,
        imageIndex: nextIndex,
      }
    })
  }

  const deleteImageAtIndex = (itemId, index) => {
    const board = data.find((item) => item.id === itemId)
    if (!board) return

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

    if (
      fullscreenViewer &&
      fullscreenViewer.boardId === itemId &&
      fullscreenViewer.imageIndex === index
    ) {
      const remainingLength = board.images.length - 1

      if (remainingLength <= 0) {
        setFullscreenViewer(null)
      } else {
        setFullscreenViewer({
          boardId: itemId,
          imageIndex: Math.min(index, remainingLength - 1),
        })
      }
    } else if (
      fullscreenViewer &&
      fullscreenViewer.boardId === itemId &&
      fullscreenViewer.imageIndex > index
    ) {
      setFullscreenViewer((prev) =>
        prev
          ? {
              ...prev,
              imageIndex: prev.imageIndex - 1,
            }
          : prev,
      )
    }
  }

  const deleteImage = (index) => {
    if (!openBoardId) return
    deleteImageAtIndex(openBoardId, index)
  }

  const handleBulkMoveSubmit = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    const targetIndex = clampIndex(bulkMoveIndex, openBoard.images.length)

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== openBoard.id) return it

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

    clearOpenBoardSelection()
    setBulkMoveIndex("")
  }

  const handleBulkApplyTitle = () => {
    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== openBoard.id
          ? it
          : {
              ...it,
              images: it.images.map((img, idx) =>
                selectedSet.has(idx) ? { ...img, title: bulkTitle } : img,
              ),
            },
      ),
    )

    clearOpenBoardSelection()
    setBulkTitle("")
  }

  const handleBulkApplyAuthor = () => {
    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== openBoard.id
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

    clearOpenBoardSelection()
    setBulkAuthor("")
  }

  const handleBulkMoveToTop = () => {
    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== openBoard.id) return it
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

    clearOpenBoardSelection()
  }

  const handleBulkMoveToBottom = () => {
    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== openBoard.id) return it
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

    clearOpenBoardSelection()
  }

  const handleBulkDelete = () => {
    if (menuDisabled || activeSelectedIndexes.length <= 1) return

    if (!confirm(`Delete ${activeSelectedIndexes.length} selected image(s)?`)) {
      return
    }

    const selectedSet = new Set(activeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== openBoard.id
          ? it
          : {
              ...it,
              images: it.images.filter((_, idx) => !selectedSet.has(idx)),
            },
      ),
    )

    clearOpenBoardSelection()
    setBulkMoveIndex("")
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tagName = e.target?.tagName?.toLowerCase()
      const isTypingTarget =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        e.target?.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSave()
        return
      }

      if (isTypingTarget) return

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        activeSelectedIndexes.length > 1
      ) {
        e.preventDefault()
        handleBulkDelete()
        return
      }

      if (fullscreenViewer) {
        if (e.key === "ArrowLeft") {
          e.preventDefault()
          goToPrevFullscreenItem()
          return
        }

        if (e.key === "ArrowRight") {
          e.preventDefault()
          goToNextFullscreenItem()
          return
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault()
          deleteImageAtIndex(
            fullscreenViewer.boardId,
            fullscreenViewer.imageIndex,
          )
          return
        }

        if (e.key === "Escape") {
          e.preventDefault()
          closeFullscreenViewer()
          return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    data,
    fileName,
    fileHandle,
    supportsFsAccess,
    fullscreenViewer,
    activeSelectedIndexes,
  ])

  return (
    <main className="flex-column" style={{ padding: 20 }}>
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

      <div style={{ fontSize: 12 }}>
        file: {fileName}
        {fileHandle ? " | remembered" : ""}
        {!supportsFsAccess ? " | browser does not support same-file save" : ""}
      </div>

      {/* GRID */}
      <div className="flex-column">
        {data.map((item, index) => (
          <BoardItem
            key={item.id}
            item={item}
            index={index}
            toggleItem={handleOpenBoard}
            updateItem={updateItem}
            deleteItem={deleteItem}
            deleteImage={deleteImage}
            setData={setData}
            markDirty={markDirty}
            selectedIndexes={
              item.id === openBoardId
                ? (selectionByBoard[item.id] || []).filter(
                    (selectedIndex) => selectedIndex < item.images.length,
                  )
                : []
            }
            onSelectImage={(idx, isShiftKey) =>
              item.id === openBoardId &&
              handleSelectImage(idx, isShiftKey, item.images.length)
            }
            onOpenFullscreen={(imageIndex) =>
              item.id === openBoardId && openFullscreenViewer(imageIndex)
            }
            boardRef={item.id === openBoardId ? openBoardRef : null}
          />
        ))}
      </div>

      {/* MENU */}
      <div
        ref={menuRef}
        className="flex-column"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          transform: getFloatingTransform(
            floatingMenuPosition.x,
            floatingMenuPosition.y,
          ),
          width: 300,
          borderRadius: 10,
          backgroundColor: "Canvas",
          padding: 20,
          zIndex: 9999,
          boxShadow: "0 5px 10px rgba(0,0,0,0.5)",
          gap: 10,
          willChange: "transform",
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
          <MdDragIndicator size={20} />
          <div />
        </div>

        <div style={{ height: 5 }} />

        <div
          className="flex-row"
          style={{
            flexWrap: "nowrap",
            alignItems: "center",
          }}
        >
          <img
            src={previewImage}
            alt=""
            style={{
              width: 60,
              height: 40,
              objectFit: "cover",
            }}
          />
          <p>
            {openBoard
              ? `${openBoard.title || "Untitled"} ${activeSelectedIndexes.length}/${openBoard.images.length} | ${openBoardDuplicateCount} duplicates`
              : "No open board"}
          </p>
        </div>

        <div className="flex-row">
          <HiPlusSm
            onClick={addImage}
            className="icon-button"
            title="Add Item"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <TbNumber10Small
            onClick={add10Images}
            className="icon-button"
            title="Add 10 Items"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <MdClose
            onClick={closeOpenBoard}
            className="icon-button"
            title="Close Open Board"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <AiOutlineDelete
            onClick={handleOpenBoardAutoDeleteDuplicates}
            className="icon-button"
            title="Delete Duplicates"
            size={ICON_SIZE}
            style={{
              cursor:
                menuDisabled || openBoardDuplicateCount === 0
                  ? "default"
                  : "pointer",
              opacity: menuDisabled || openBoardDuplicateCount === 0 ? 0.4 : 1,
            }}
          />
        </div>

        <input
          type="file"
          accept=".json"
          onChange={handleMenuLoadJson}
          disabled={menuDisabled}
        />

        <div style={{ position: "relative" }}>
          <select
            disabled={menuDisabled}
            value={bulkMoveBoardId}
            onChange={(e) => setBulkMoveBoardId(e.target.value)}
            style={{ width: "100%", paddingRight: 70 }}
          >
            <option value="">move/copy selected to board</option>
            {targetBoardOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || "Untitled"}
              </option>
            ))}
          </select>

          <MdContentCopy
            className="icon-button"
            title="Copy Selected To Board"
            size={18}
            onClick={handleCopySelectedToBoard}
            style={{
              width: 20,
              height: 20,
              padding: 2,
              position: "absolute",
              right: 34,
              top: "50%",
              transform: "translateY(-50%)",
              cursor:
                menuDisabled ||
                !bulkMoveBoardId ||
                activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled ||
                !bulkMoveBoardId ||
                activeSelectedIndexes.length === 0
                  ? 0.4
                  : 1,
            }}
          />

          <IoMdArrowUp
            className="icon-button"
            title="Move Selected To Board"
            size={ICON_SIZE}
            onClick={handleMoveSelectedToBoard}
            style={{
              width: 20,
              height: 20,
              padding: 3,
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              cursor:
                menuDisabled ||
                !bulkMoveBoardId ||
                activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled ||
                !bulkMoveBoardId ||
                activeSelectedIndexes.length === 0
                  ? 0.4
                  : 1,
            }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <input
            disabled={menuDisabled}
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
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
        </div>

        <div style={{ position: "relative" }}>
          <input
            disabled={menuDisabled}
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
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            disabled={menuDisabled}
            type="number"
            min="0"
            max={openBoard?.images.length || 0}
            required
            placeholder="target index"
            value={bulkMoveIndex}
            onChange={(e) => setBulkMoveIndex(e.target.value)}
          />
          <button
            onClick={handleBulkMoveSubmit}
            title="Move Selected"
            disabled={menuDisabled}
          >
            Move
          </button>
        </div>

        <div style={{ height: 5 }} />

        <div className="flex-row">
          <MdCheck
            className="icon-button"
            size={ICON_SIZE}
            onClick={selectAllImagesForActiveBoard}
            title="Select All In Board"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <IoMdClose
            className="icon-button"
            size={ICON_SIZE}
            onClick={clearOpenBoardSelection}
            title="Deselect Board"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <IoMdArrowRoundUp
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkMoveToTop}
            title="Move Selected To Top"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <IoMdArrowRoundDown
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkMoveToBottom}
            title="Move Selected To Bottom"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
          <AiOutlineDelete
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkDelete}
            title="Delete Selected"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.4 : 1,
            }}
          />
        </div>

        <datalist id={activeAuthorListId}>
          {activeFrequentAuthors.map((author) => (
            <option key={author} value={author} />
          ))}
        </datalist>
      </div>

      {fullscreenViewer &&
        (() => {
          const board = data.find(
            (item) => item.id === fullscreenViewer.boardId,
          )
          const activeImage = board?.images?.[fullscreenViewer.imageIndex]

          if (!board || !activeImage) return null

          const embedUrl = getYoutubeEmbedUrl(activeImage.image)

          return (
            <div
              onClick={closeFullscreenViewer}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "rgba(0,0,0,0.92)",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 20,
                  left: 20,
                  right: 20,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#fff",
                  zIndex: 2,
                  gap: 20,
                }}
              >
                <div style={{ fontSize: 14 }}>
                  {(board.title || "Untitled") +
                    ` | ${fullscreenViewer.imageIndex + 1}/${board.images.length}`}
                </div>

                <div
                  className="flex-row"
                  style={{ gap: 10, alignItems: "center" }}
                >
                  <IoMdArrowRoundUp
                    className="icon-button"
                    size={ICON_SIZE}
                    onClick={(e) => {
                      e.stopPropagation()

                      const current = fullscreenViewer?.imageIndex
                      const currentBoard = data.find(
                        (item) => item.id === fullscreenViewer?.boardId,
                      )
                      if (current == null || !currentBoard) return
                      if (current <= 0) return

                      setData((prev) =>
                        prev.map((item) => {
                          if (item.id !== fullscreenViewer.boardId) return item
                          return {
                            ...item,
                            images: moveImageInArray(item.images, current, 0),
                          }
                        }),
                      )

                      setSelectionByBoard((prev) => {
                        const selected = prev[fullscreenViewer.boardId] || []
                        return {
                          ...prev,
                          [fullscreenViewer.boardId]: selected.map((idx) => {
                            if (idx === current) return 0
                            if (idx < current) return idx + 1
                            return idx
                          }),
                        }
                      })

                      setLastSelectedByBoard((prev) => {
                        const currentLast = prev[fullscreenViewer.boardId]
                        return {
                          ...prev,
                          [fullscreenViewer.boardId]:
                            currentLast === current
                              ? 0
                              : currentLast != null && currentLast < current
                                ? currentLast + 1
                                : currentLast,
                        }
                      })

                      setFullscreenViewer((prev) =>
                        prev
                          ? {
                              ...prev,
                              imageIndex: current,
                            }
                          : prev,
                      )
                    }}
                    title="Move To Top"
                    style={{
                      cursor: "pointer",
                    }}
                  />

                  <IoMdArrowRoundDown
                    className="icon-button"
                    size={ICON_SIZE}
                    onClick={(e) => {
                      e.stopPropagation()

                      const current = fullscreenViewer?.imageIndex
                      const currentBoard = data.find(
                        (item) => item.id === fullscreenViewer?.boardId,
                      )
                      if (current == null || !currentBoard) return

                      const lastIndex = currentBoard.images.length - 1
                      if (current >= lastIndex) return

                      setData((prev) =>
                        prev.map((item) => {
                          if (item.id !== fullscreenViewer.boardId) return item
                          return {
                            ...item,
                            images: moveImageInArray(
                              item.images,
                              current,
                              lastIndex,
                            ),
                          }
                        }),
                      )

                      setSelectionByBoard((prev) => {
                        const selected = prev[fullscreenViewer.boardId] || []
                        return {
                          ...prev,
                          [fullscreenViewer.boardId]: selected.map((idx) => {
                            if (idx === current) return lastIndex
                            if (idx > current) return idx - 1
                            return idx
                          }),
                        }
                      })

                      setLastSelectedByBoard((prev) => {
                        const currentLast = prev[fullscreenViewer.boardId]
                        return {
                          ...prev,
                          [fullscreenViewer.boardId]:
                            currentLast === current
                              ? lastIndex
                              : currentLast != null && currentLast > current
                                ? currentLast - 1
                                : currentLast,
                        }
                      })

                      setFullscreenViewer((prev) =>
                        prev
                          ? {
                              ...prev,
                              imageIndex: current,
                            }
                          : prev,
                      )
                    }}
                    title="Move To Bottom"
                    style={{
                      cursor: "pointer",
                    }}
                  />

                  <MdClose
                    className="icon-button"
                    size={ICON_SIZE}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation()
                      closeFullscreenViewer()
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                <div
                  style={{
                    minHeight: "100vh",
                    width: "100%",
                    display: "grid",
                    placeItems: "center",
                    padding: "72px 20px 20px",
                    boxSizing: "border-box",
                  }}
                >
                  {embedUrl ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <iframe
                        src={embedUrl}
                        style={{
                          width: "min(1600px, 100%)",
                          height: "min(900px, 100%)",
                          border: "none",
                          display: "block",
                        }}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  ) : activeImage.image ? (
                    <img
                      src={activeImage.image}
                      alt=""
                      style={{
                        display: "block",
                        maxWidth: "100%",
                        width: "auto",
                        height: "auto",
                        borderRadius: 30,
                        margin: "0 auto",
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )
        })()}
      <div style={{ height: 10 }} />
      <FooterComp />
    </main>
  )
}

const BoardItem = ({
  item,
  index,
  toggleItem,
  updateItem,
  deleteItem,
  deleteImage,
  setData,
  markDirty,
  selectedIndexes,
  onSelectImage,
  onOpenFullscreen,
  boardRef,
}) => {
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

  const duplicateImageKeys = useMemo(
    () => getDuplicateImageKeys(item.images),
    [item.images],
  )

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
      ref={boardRef}
      className="flex-column"
      style={{
        border: "1px solid",
        borderRadius: 10,
        padding: 20,
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
            {selectedIndexes.length > 0
              ? ` | ${selectedIndexes.length} selected`
              : ""}
          </span>
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
                    isDuplicate={duplicateImageKeys.has(
                      normalizeImageUrl(img.image),
                    )}
                    isSelected={selectedIndexes.includes(idx)}
                    onSelectImage={onSelectImage}
                    onOpenFullscreen={onOpenFullscreen}
                    maxIndex={item.images.length - 1}
                  />
                ))}
              </div>

              <datalist id={authorListId}>
                {frequentAuthors.map((author) => (
                  <option key={author} value={author} />
                ))}
              </datalist>
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
  onOpenFullscreen,
  maxIndex,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id })

  const [moveToIndexValue, setMoveToIndexValue] = useState("")
  const embedUrl = getYoutubeEmbedUrl(img.image)

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    outline: isSelected
      ? "4px solid dodgerblue"
      : isDuplicate
        ? "5px solid crimson"
        : "1px solid",
    borderRadius: 10,
    padding: 10,
    cursor: "pointer",
    userSelect: "none",
    backgroundColor: "Canvas",
  }

  const mediaWrapperStyle = {
    width: "100%",
    cursor: "pointer",
    background: "#000",
    border: "1px solid",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    height: 200,
  }

  const iframeStyle = {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
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
        <MdOutlineDragIndicator
          size={ICON_SIZE}
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", width: "fit-content" }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {embedUrl ? (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onOpenFullscreen(index)
          }}
          style={mediaWrapperStyle}
        >
          <iframe
            src={embedUrl}
            style={iframeStyle}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : img.image ? (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onOpenFullscreen(index)
          }}
          style={mediaWrapperStyle}
        >
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
          </div>

          <img
            loading="lazy"
            src={img.image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            alt=""
          />
        </div>
      ) : (
        <div
          style={{
            ...mediaWrapperStyle,
            background: "#222",
            border: "1px solid",
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
        <button type="submit">Move</button>
      </form>

      <div className="flex-row">
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
            deleteImage(index)
          }}
          title="Delete"
          style={{ cursor: "pointer" }}
        />
      </div>
    </div>
  )
}

export default JsonEditorPage
