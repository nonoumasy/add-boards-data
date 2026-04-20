import { useState, useEffect } from "react"
import { DndContext, closestCenter } from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

const STORAGE_KEY = "json-editor-data"
const FILE_HANDLE_DB = "json-editor-file-db"
const FILE_HANDLE_STORE = "handles"
const FILE_HANDLE_KEY = "active-json-file"

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

const Home = () => {
  const [data, setData] = useState([])
  const [fileName, setFileName] = useState("boardsData")
  const [dirty, setDirty] = useState(false)
  const [fileHandle, setFileHandle] = useState(null)
  const [supportsFsAccess, setSupportsFsAccess] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  const markDirty = () => setDirty(true)

  useEffect(() => {
    setIsMounted(true)

    const browserSupportsFsAccess =
      typeof window !== "undefined" &&
      "showOpenFilePicker" in window &&
      "showSaveFilePicker" in window

    setSupportsFsAccess(browserSupportsFsAccess)

    try {
      const saved = localStorage.getItem(STORAGE_KEY)

      if (!saved) return

      setData(JSON.parse(saved))
      setDirty(true)
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

    const handleBeforeUnload = (e) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty, isMounted])

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

  const deleteItem = (id) => {
    if (!confirm("Delete this item?")) return
    markDirty()
    setData((prev) => prev.filter((item) => item.id !== id))
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
  }

  useEffect(() => {
    if (!isMounted) return

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [data, fileName, fileHandle, supportsFsAccess, isMounted])

  return (
    <main className="flex-column" style={{ padding: 20 }}>
      <button onClick={handleUpload}>Load JSON</button>
      <button onClick={createItem}>Create Item</button>
      <button onClick={handleSave}>Save</button>
      <button onClick={forgetSavedFile}>Forget Saved File</button>

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
            />
          ))}
      </div>
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
}) => {
  const duplicateUrls = getDuplicateImages(item.images)
  const missingTitleCount = item.images.filter(
    (img) => !img.title?.trim(),
  ).length
  const missingAuthorCount = item.images.filter(
    (img) => !img.imageAuthor?.trim(),
  ).length

  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null)
  const [bulkMoveIndex, setBulkMoveIndex] = useState("")
  const [bulkTitle, setBulkTitle] = useState("")
  const [bulkAuthor, setBulkAuthor] = useState("")

  const safeSelectedIndexes = selectedIndexes.filter(
    (selectedIndex) => selectedIndex < item.images.length,
  )

  const safeLastSelectedIndex =
    lastSelectedIndex != null && lastSelectedIndex < item.images.length
      ? lastSelectedIndex
      : null

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

  const handleSelectImage = (idx, isShiftKey) => {
    setSelectedIndexes((prev) => {
      const current = prev.filter(
        (selectedIndex) => selectedIndex < item.images.length,
      )

      if (isShiftKey && safeLastSelectedIndex != null) {
        const start = Math.min(safeLastSelectedIndex, idx)
        const end = Math.max(safeLastSelectedIndex, idx)
        const range = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        )
        const nextSet = new Set(current)

        range.forEach((value) => {
          nextSet.add(value)
        })

        return [...nextSet].sort((a, b) => a - b)
      }

      if (current.includes(idx)) {
        return current.filter((value) => value !== idx)
      }

      return [...current, idx].sort((a, b) => a - b)
    })

    setLastSelectedIndex(idx)
  }

  const selectAllImages = () => {
    setSelectedIndexes(item.images.map((_, idx) => idx))
    setLastSelectedIndex(item.images.length ? item.images.length - 1 : null)
  }

  const clearSelectedImages = () => {
    setSelectedIndexes([])
    setLastSelectedIndex(null)
  }

  useEffect(() => {
    if (!item.open) return

    const handleKeyDown = (e) => {
      if (e.key !== "Escape") return

      const tagName = e.target?.tagName?.toLowerCase()
      const isTypingTarget =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        e.target?.isContentEditable

      if (isTypingTarget) return
      if (!safeSelectedIndexes.length) return

      e.preventDefault()
      setSelectedIndexes([])
      setLastSelectedIndex(null)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [item.open, safeSelectedIndexes.length])

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

  const handleBulkMoveToTop = () => {
    if (safeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveSelectedImagesToIndex(it.images, safeSelectedIndexes, 0),
        }
      }),
    )

    setSelectedIndexes([])
    setLastSelectedIndex(null)
  }

  const handleBulkMoveToBottom = () => {
    if (safeSelectedIndexes.length <= 1) return

    markDirty()
    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveSelectedImagesToIndex(
            it.images,
            safeSelectedIndexes,
            it.images.length,
          ),
        }
      }),
    )

    setSelectedIndexes([])
    setLastSelectedIndex(null)
  }

  const handleBulkDelete = () => {
    if (safeSelectedIndexes.length <= 1) return
    if (!confirm(`Delete ${safeSelectedIndexes.length} selected image(s)?`)) {
      return
    }

    const selectedSet = new Set(safeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== item.id
          ? it
          : {
              ...it,
              images: it.images.filter((_, idx) => !selectedSet.has(idx)),
            },
      ),
    )

    setSelectedIndexes([])
    setLastSelectedIndex(null)
    setBulkMoveIndex("")
  }

  const handleBulkMoveSubmit = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (safeSelectedIndexes.length <= 1) return

    const targetIndex = clampIndex(bulkMoveIndex, item.images.length)
    markDirty()

    setData((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it
        return {
          ...it,
          images: moveSelectedImagesToIndex(
            it.images,
            safeSelectedIndexes,
            targetIndex,
          ),
        }
      }),
    )

    setSelectedIndexes([])
    setLastSelectedIndex(null)
    setBulkMoveIndex("")
  }

  const handleBulkApplyTitle = () => {
    if (safeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(safeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== item.id
          ? it
          : {
              ...it,
              images: it.images.map((img, idx) =>
                selectedSet.has(idx) ? { ...img, title: bulkTitle } : img,
              ),
            },
      ),
    )

    setSelectedIndexes([])
    setLastSelectedIndex(null)
    setBulkTitle("")
  }

  const handleBulkApplyAuthor = () => {
    if (safeSelectedIndexes.length <= 1) return

    const selectedSet = new Set(safeSelectedIndexes)

    markDirty()
    setData((prev) =>
      prev.map((it) =>
        it.id !== item.id
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

    setSelectedIndexes([])
    setLastSelectedIndex(null)
    setBulkAuthor("")
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

    setSelectedIndexes([])
    setLastSelectedIndex(null)
    setBulkMoveIndex("")
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

  const showBulkActions = safeSelectedIndexes.length > 1

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

        <button
          style={{ width: "fit-content" }}
          onClick={() => deleteItem(item.id)}
        >
          Delete Item
        </button>
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

          {showBulkActions && (
            <div
              className="flex-column"
              style={{
                position: "fixed",
                right: 20,
                bottom: 20,
                width: 360,
                border: "1px solid #ddd",
                background: "#fff",
                padding: 10,
                zIndex: 9999,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              <div
                className="flex-row"
                style={{
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: "bold" }}>
                  Selected: {safeSelectedIndexes.length}
                </div>

                <button
                  type="button"
                  style={{ width: "fit-content" }}
                  onClick={clearSelectedImages}
                >
                  Deselect All
                </button>

                <button
                  type="button"
                  onClick={selectAllImages}
                  style={{ width: "fit-content" }}
                >
                  Select All
                </button>
              </div>

              <form
                onSubmit={handleBulkMoveSubmit}
                className="flex-between"
                style={{
                  gap: 10,
                  flexWrap: "nowrap",
                }}
              >
                <input
                  type="number"
                  min="0"
                  max={item.images.length}
                  required
                  placeholder="move selected to index"
                  value={bulkMoveIndex}
                  onChange={(e) => setBulkMoveIndex(e.target.value)}
                />
                <button type="submit">Move Selected</button>
              </form>

              <div
                className="flex-between"
                style={{
                  gap: 10,
                  flexWrap: "nowrap",
                }}
              >
                <input
                  placeholder="apply same title to selected"
                  value={bulkTitle}
                  onChange={(e) => setBulkTitle(e.target.value)}
                />
                <button type="button" onClick={handleBulkApplyTitle}>
                  Apply Title
                </button>
              </div>

              <div
                className="flex-between"
                style={{
                  gap: 10,
                  flexWrap: "nowrap",
                }}
              >
                <input
                  list={authorListId}
                  placeholder="apply same author to selected"
                  value={bulkAuthor}
                  onChange={(e) => setBulkAuthor(e.target.value)}
                />
                <button type="button" onClick={handleBulkApplyAuthor}>
                  Apply Author
                </button>
              </div>

              <button type="button" onClick={handleBulkMoveToTop}>
                Move Selected To Top
              </button>

              <button type="button" onClick={handleBulkMoveToBottom}>
                Move Selected To Bottom
              </button>

              <button type="button" onClick={handleBulkDelete}>
                Delete Selected
              </button>
            </div>
          )}

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
                    isSelected={safeSelectedIndexes.includes(idx)}
                    onSelectImage={handleSelectImage}
                    maxIndex={item.images.length - 1}
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
        : "1px solid #ddd",
    padding: 8,
    cursor: "pointer",
    userSelect: "none",
  }

  const mediaWrapperStyle = {
    width: "100%",
    cursor: "pointer",
    background: "#000",
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
          <button
            type="button"
            onClick={handleGoogleImageSearch}
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              zIndex: 2,
              width: "fit-content",
              backgroundColor: "#222",
              color: "white",
              textDecoration: "none",
              border: "none",
              borderRadius: 5,
            }}
          >
            Google
          </button>

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

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          moveImageToTop(index)
        }}
      >
        Move to Top
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          moveImageToBottom(index)
        }}
      >
        Move to Bottom
      </button>

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

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          deleteImage(itemId, index)
        }}
      >
        Delete
      </button>
    </div>
  )
}

export default Home
