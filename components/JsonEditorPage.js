import { useState, useEffect, useMemo, useRef } from "react"
import { DndContext, closestCenter } from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { MdClear, MdOutlineFolder, MdSaveAlt } from "react-icons/md"
import { IoMdAdd } from "react-icons/io"
import { AiOutlineDelete } from "react-icons/ai"
import { FooterComp } from "@/components/FooterComp"
import { GoImage } from "react-icons/go"
import { PiTextAa } from "react-icons/pi"
import { FaCircleUser } from "react-icons/fa6"
import Menu from "./Menu"
import FullscreenViewer from "./FullscreenViewer"
import {
  ICON_SIZE,
  MENU_WIDTH,
  MENU_HEIGHT,
  MENU_EDGE_GAP,
  defaultImage,
  STORAGE_KEY,
  FLOATING_MENU_POSITION_KEY,
  ANALYZE_CONCURRENCY,
  saveFileHandleToDb,
  getFileHandleFromDb,
  deleteFileHandleFromDb,
  normalizeImageUrl,
  getDuplicateImageKeys,
  getDuplicateItemCount,
  getYoutubeEmbedUrl,
  createId,
  normalizeLoadedData,
  clampIndex,
  clampFloatingPosition,
  moveImageInArray,
  moveSelectedImagesToIndex,
  getInitialFloatingMenuPosition,
  getFloatingTransform,
  runWithConcurrency,
  sortBoardsByEventStartYear,
  parseOptionalYear,
} from "./utils"
import { SortableImage } from "./SortableImage"

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
  const [scrollBoardIndex, setScrollBoardIndex] = useState("")

  const [floatingMenuPosition, setFloatingMenuPosition] = useState(() =>
    getInitialFloatingMenuPosition(),
  )

  const [fullscreenViewer, setFullscreenViewer] = useState(null)
  const [isAnalyzingTitles, setIsAnalyzingTitles] = useState(false)
  const [isMenuMinimized, setIsMenuMinimized] = useState(false)

  const dragStateRef = useRef(null)
  const dragPositionRef = useRef(getInitialFloatingMenuPosition())
  const dragRafRef = useRef(null)
  const menuRef = useRef(null)
  const openBoardRef = useRef(null)
  const boardRefs = useRef({})
  const imageRefs = useRef({})

  const supportsFsAccess =
    typeof window !== "undefined" &&
    "showOpenFilePicker" in window &&
    "showSaveFilePicker" in window

  const markDirty = () => setDirty(true)

  const openBoard = useMemo(
    () => data.find((item) => item.open) || null,
    [data],
  )

  const openBoardId = openBoard?.id || null

  const sortedData = useMemo(() => sortBoardsByEventStartYear(data), [data])

  const openBoardDuplicateCount = openBoard
    ? getDuplicateItemCount(openBoard.images)
    : 0

  const openBoardMissingTitleCount = openBoard
    ? openBoard.images.filter((img) => !img.title?.trim()).length
    : 0

  const openBoardMissingAuthorCount = openBoard
    ? openBoard.images.filter((img) => !img.imageAuthor?.trim()).length
    : 0

  const activeSelectedIndexes = openBoard
    ? (selectionByBoard[openBoard.id] || []).filter(
        (idx) => idx < openBoard.images.length,
      )
    : []

  const targetBoardOptions = sortedData.filter(
    (item) => item.id !== openBoardId,
  )

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

  const applyFloatingPositionToNode = (xPercent, yPercent) => {
    const node = menuRef.current
    if (!node) return

    node.style.transform = getFloatingTransform(xPercent, yPercent)
  }

  const scrollToOpenBoardBottom = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = openBoardRef.current
        if (!el) return

        el.scrollIntoView({
          behavior: "smooth",
          block: "end",
          inline: "nearest",
        })
      })
    })
  }

  const scrollToOpenBoardImage = (imageIndex) => {
    const boardId = openBoardId

    if (!boardId || imageIndex == null) return

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetKey = `${boardId}-${imageIndex}`
        const targetNode = imageRefs.current[targetKey]

        if (!targetNode) return

        targetNode.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
      })
    })
  }

  const scrollToBoardItem = () => {
    if (!openBoard) return

    const rawValue = String(scrollBoardIndex || "").trim()
    if (!rawValue) return

    const parsedIndex = Number(rawValue)
    if (!Number.isFinite(parsedIndex)) return

    const targetIndex = clampIndex(
      Math.trunc(parsedIndex) - 1,
      openBoard.images.length - 1,
    )

    const targetKey = `${openBoard.id}-${targetIndex}`
    const targetNode = imageRefs.current[targetKey]

    if (!targetNode) return

    targetNode.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    })
  }

  const handleMenuLoadJson = async (e) => {
    if (!openBoardId) {
      e.target.value = ""
      return
    }

    const files = Array.from(e.target.files || [])
    if (!files.length) return

    try {
      const loadedImages = []

      for (const file of files) {
        const text = await file.text()
        const parsed = JSON.parse(text)

        if (!Array.isArray(parsed)) {
          alert(`${file.name} must be an array of objects.`)
          e.target.value = ""
          return
        }

        const newImages = parsed.map((img) => ({
          title: img?.title || "",
          image: img?.image || "",
          imageAuthor: img?.imageAuthor || "",
        }))

        loadedImages.push(...newImages)
      }

      if (!loadedImages.length) {
        e.target.value = ""
        return
      }

      const firstNewIndex = openBoard?.images?.length || 0

      markDirty()

      setData((prev) =>
        prev.map((item) =>
          item.id !== openBoardId
            ? item
            : {
                ...item,
                images: [...item.images, ...loadedImages],
              },
        ),
      )

      scrollToOpenBoardImage(firstNewIndex)
    } catch (err) {
      console.error(err)
      alert("Invalid JSON file.")
    }

    e.target.value = ""
  }

  const getDuplicateKeepScore = (img) => {
    const title = String(img.title || "").trim()
    const imageAuthor = String(img.imageAuthor || "").trim()

    return {
      hasTitle: title.length > 0,
      hasAuthor: imageAuthor.length > 0,
      filledValueCount: [title, imageAuthor].filter(Boolean).length,
      stringCount: title.length + imageAuthor.length,
    }
  }

  const isBetterDuplicateItem = (candidate, current) => {
    const candidateScore = getDuplicateKeepScore(candidate)
    const currentScore = getDuplicateKeepScore(current)

    if (candidateScore.hasTitle !== currentScore.hasTitle) {
      return candidateScore.hasTitle
    }

    if (candidateScore.filledValueCount !== currentScore.filledValueCount) {
      return candidateScore.filledValueCount > currentScore.filledValueCount
    }

    if (candidateScore.hasAuthor !== currentScore.hasAuthor) {
      return candidateScore.hasAuthor
    }

    if (candidateScore.stringCount !== currentScore.stringCount) {
      return candidateScore.stringCount > currentScore.stringCount
    }

    return false
  }

  const handleOpenBoardAutoDeleteDuplicates = () => {
    if (!openBoard || openBoardDuplicateCount === 0) return

    const bestIndexByKey = new Map()

    openBoard.images.forEach((img, index) => {
      const key = normalizeImageUrl(img.image)

      if (!key) return

      const currentBestIndex = bestIndexByKey.get(key)

      if (currentBestIndex == null) {
        bestIndexByKey.set(key, index)
        return
      }

      const currentBestImage = openBoard.images[currentBestIndex]

      if (isBetterDuplicateItem(img, currentBestImage)) {
        bestIndexByKey.set(key, index)
      }
    })

    const keptIndexes = new Set(bestIndexByKey.values())

    const dedupedImages = openBoard.images.filter((img, index) => {
      const key = normalizeImageUrl(img.image)

      if (!key) return true

      return keptIndexes.has(index)
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

  const analyzeSingleImageTitle = async (imageUrl) => {
    const response = await fetch("/api/gemini-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageUrl,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result?.error || "Analyze request failed")
    }

    return String(result?.title || "").trim()
  }

  const analyzeAndApplyTitles = async (boardId, indexes) => {
    if (isAnalyzingTitles) return

    const board = data.find((item) => item.id === boardId)
    const targetIndexes = [...new Set(indexes)]
      .map((idx) => Number(idx))
      .filter(
        (idx) =>
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < (board?.images?.length || 0),
      )

    if (!board || targetIndexes.length === 0) return

    const selectedPayload = targetIndexes
      .map((idx) => ({
        index: idx,
        image: board.images[idx]?.image || "",
      }))
      .filter((item) => item.image.trim())

    if (!selectedPayload.length) {
      alert("No valid image URLs.")
      return
    }

    try {
      setIsAnalyzingTitles(true)

      const results = await runWithConcurrency(
        selectedPayload,
        ANALYZE_CONCURRENCY,
        async (item) => {
          try {
            const title = await analyzeSingleImageTitle(item.image)

            return {
              index: item.index,
              ok: true,
              title,
            }
          } catch (err) {
            return {
              index: item.index,
              ok: false,
              title: "",
              error: err.message || "Analyze failed",
            }
          }
        },
      )

      const titleByIndex = new Map()
      const failed = []

      results.forEach((item) => {
        if (item?.ok && item?.title) {
          titleByIndex.set(item.index, item.title)
        } else if (item && !item.ok) {
          failed.push(item)
        }
      })

      if (!titleByIndex.size) {
        const firstError = failed[0]?.error || "No titles were generated."
        alert(firstError)
        return
      }

      markDirty()

      setData((prev) =>
        prev.map((item) =>
          item.id !== boardId
            ? item
            : {
                ...item,
                images: item.images.map((img, idx) =>
                  titleByIndex.has(idx)
                    ? { ...img, title: titleByIndex.get(idx) }
                    : img,
                ),
              },
        ),
      )

      if (failed.length > 0) {
        alert(
          `Generated ${titleByIndex.size} title(s). ${failed.length} failed.`,
        )
      }
    } catch (err) {
      console.error(err)
      alert(err.message || "Analyze failed")
    } finally {
      setIsAnalyzingTitles(false)
    }
  }

  const handleAnalyzeSingleImageTitle = async (boardId, imageIndex) => {
    await analyzeAndApplyTitles(boardId, [imageIndex])
  }

  const handleAnalyzeSelectedTitles = async () => {
    if (menuDisabled || activeSelectedIndexes.length === 0 || !openBoard) {
      return
    }

    await analyzeAndApplyTitles(openBoard.id, activeSelectedIndexes)
  }

  const handleMenuDragMove = (e) => {
    if (!dragStateRef.current) return

    const nextX = e.clientX - dragStateRef.current.offsetX
    const nextY = e.clientY - dragStateRef.current.offsetY

    const maxX = Math.max(
      window.innerWidth - dragStateRef.current.menuWidth - MENU_EDGE_GAP,
      0,
    )
    const maxY = Math.max(
      window.innerHeight - dragStateRef.current.menuHeight - MENU_EDGE_GAP,
      0,
    )

    const clampedX = clampIndex(nextX, maxX)
    const clampedY = clampIndex(nextY, maxY)

    dragPositionRef.current = {
      xPercent: (clampedX / window.innerWidth) * 100,
      yPercent: (clampedY / window.innerHeight) * 100,
    }

    if (dragRafRef.current) return

    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null

      applyFloatingPositionToNode(
        dragPositionRef.current.xPercent,
        dragPositionRef.current.yPercent,
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
      xPercent: dragPositionRef.current.xPercent,
      yPercent: dragPositionRef.current.yPercent,
    })
  }

  const handleMenuDragStart = (e) => {
    if (e.button !== 0) return

    const rect = menuRef.current?.getBoundingClientRect()

    dragStateRef.current = {
      offsetX: rect ? e.clientX - rect.left : 0,
      offsetY: rect ? e.clientY - rect.top : 0,
      menuWidth: rect?.width || MENU_WIDTH,
      menuHeight: rect?.height || MENU_HEIGHT,
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
    const clamped = clampFloatingPosition(
      floatingMenuPosition,
      menuRef.current?.getBoundingClientRect()?.width || MENU_WIDTH,
      menuRef.current?.getBoundingClientRect()?.height || MENU_HEIGHT,
    )

    dragPositionRef.current = clamped

    try {
      localStorage.setItem(FLOATING_MENU_POSITION_KEY, JSON.stringify(clamped))
    } catch (err) {
      console.error(err)
    }
  }, [floatingMenuPosition])

  useEffect(() => {
    const clamped = clampFloatingPosition(
      dragPositionRef.current,
      menuRef.current?.getBoundingClientRect()?.width || MENU_WIDTH,
      menuRef.current?.getBoundingClientRect()?.height || MENU_HEIGHT,
    )

    dragPositionRef.current = clamped
    applyFloatingPositionToNode(clamped.xPercent, clamped.yPercent)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const rect = menuRef.current?.getBoundingClientRect()

      const clamped = clampFloatingPosition(
        dragPositionRef.current,
        rect?.width || MENU_WIDTH,
        rect?.height || MENU_HEIGHT,
      )

      dragPositionRef.current = clamped
      setFloatingMenuPosition(clamped)
      applyFloatingPositionToNode(clamped.xPercent, clamped.yPercent)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
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
      setScrollBoardIndex("")
      imageRefs.current = {}
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
    const clean = sortBoardsByEventStartYear(data).map((item) => ({
      title: item.title || "",
      eventStartYear: parseOptionalYear(item.eventStartYear),
      eventEndYear: parseOptionalYear(item.eventEndYear),
      publishOn: item.publishOn ?? true,
      images: item.images || [],
    }))

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

    delete boardRefs.current[id]

    Object.keys(imageRefs.current).forEach((key) => {
      if (key.startsWith(`${id}-`)) {
        delete imageRefs.current[key]
      }
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

    setData((prev) => [
      ...prev.map((item) => ({
        ...item,
        open: false,
      })),
      {
        id: newId,
        title: "",
        eventStartYear: "",
        eventEndYear: null,
        publishOn: true,
        images: [],
        open: true,
      },
    ])

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
    if (!openBoardId || !openBoard) return

    const newImageIndex = openBoard.images.length

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

    scrollToOpenBoardImage(newImageIndex)
  }

  const add10Images = () => {
    if (!openBoardId || !openBoard) return

    const firstNewImageIndex = openBoard.images.length

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

    scrollToOpenBoardImage(firstNewImageIndex)
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

  const updateFullscreenImageTitle = (value) => {
    if (!fullscreenViewer) return

    markDirty()

    setData((prev) =>
      prev.map((item) =>
        item.id !== fullscreenViewer.boardId
          ? item
          : {
              ...item,
              images: item.images.map((img, idx) =>
                idx === fullscreenViewer.imageIndex
                  ? {
                      ...img,
                      title: value,
                    }
                  : img,
              ),
            },
      ),
    )
  }

  const updateFullscreenImageAuthor = (value) => {
    if (!fullscreenViewer) return

    markDirty()

    setData((prev) =>
      prev.map((item) =>
        item.id !== fullscreenViewer.boardId
          ? item
          : {
              ...item,
              images: item.images.map((img, idx) =>
                idx === fullscreenViewer.imageIndex
                  ? {
                      ...img,
                      imageAuthor: value,
                    }
                  : img,
              ),
            },
      ),
    )
  }

  const updateFullscreenImageUrl = (value) => {
    if (!fullscreenViewer) return

    markDirty()

    setData((prev) =>
      prev.map((item) =>
        item.id !== fullscreenViewer.boardId
          ? item
          : {
              ...item,
              images: item.images.map((img, idx) =>
                idx === fullscreenViewer.imageIndex
                  ? {
                      ...img,
                      image: value,
                    }
                  : img,
              ),
            },
      ),
    )
  }

  const moveFullscreenImageToBoard = (targetBoardId) => {
    if (!fullscreenViewer || !targetBoardId) return

    const sourceBoard = data.find(
      (item) => item.id === fullscreenViewer.boardId,
    )

    const movedImage = sourceBoard?.images?.[fullscreenViewer.imageIndex]

    if (!sourceBoard || !movedImage) return

    const currentIndex = fullscreenViewer.imageIndex
    const remainingLength = sourceBoard.images.length - 1

    markDirty()

    setData((prev) =>
      prev.map((item) => {
        if (item.id === fullscreenViewer.boardId) {
          return {
            ...item,
            images: item.images.filter((_, idx) => idx !== currentIndex),
          }
        }

        if (item.id === targetBoardId) {
          return {
            ...item,
            images: [...item.images, movedImage],
          }
        }

        return item
      }),
    )

    setSelectionByBoard((prev) => {
      const current = prev[fullscreenViewer.boardId] || []

      return {
        ...prev,
        [fullscreenViewer.boardId]: current
          .filter((idx) => idx !== currentIndex)
          .map((idx) => (idx > currentIndex ? idx - 1 : idx)),
      }
    })

    setLastSelectedByBoard((prev) => {
      const current = prev[fullscreenViewer.boardId]

      if (current == null) return prev

      return {
        ...prev,
        [fullscreenViewer.boardId]:
          current === currentIndex
            ? null
            : current > currentIndex
              ? current - 1
              : current,
      }
    })

    if (remainingLength <= 0) {
      setFullscreenViewer(null)
      return
    }

    setFullscreenViewer((prev) =>
      prev
        ? {
            ...prev,
            imageIndex: currentIndex >= remainingLength ? 0 : currentIndex,
          }
        : prev,
    )
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

    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
    if (menuDisabled || activeSelectedIndexes.length === 0) return

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
        activeSelectedIndexes.length > 0
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
          title="Save Data"
          style={{ cursor: "pointer" }}
        />

        <MdClear
          className="icon-button"
          size={ICON_SIZE}
          onClick={forgetSavedFile}
          title="Clear Board json"
          style={{ cursor: "pointer" }}
        />
      </div>

      <div>
        file: {fileName}
        {fileHandle ? " | remembered" : ""}
        {!supportsFsAccess ? " | browser does not support same-file save" : ""}
      </div>

      <div className="flex-column">
        {sortedData.map((item, index) => (
          <BoardItem
            key={item.id}
            item={item}
            index={index}
            imageRefs={imageRefs}
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
            onAnalyzeImage={handleAnalyzeSingleImageTitle}
            isAnalyzingTitles={isAnalyzingTitles}
            boardRef={(node) => {
              if (node) {
                boardRefs.current[item.id] = node
              } else {
                delete boardRefs.current[item.id]
              }

              if (item.id === openBoardId) {
                openBoardRef.current = node
              }
            }}
          />
        ))}
      </div>

      <Menu
        menuRef={menuRef}
        floatingMenuPosition={floatingMenuPosition}
        isMenuMinimized={isMenuMinimized}
        setIsMenuMinimized={setIsMenuMinimized}
        handleMenuDragStart={handleMenuDragStart}
        openBoard={openBoard}
        openBoardDuplicateCount={openBoardDuplicateCount}
        openBoardMissingTitleCount={openBoardMissingTitleCount}
        openBoardMissingAuthorCount={openBoardMissingAuthorCount}
        activeSelectedIndexes={activeSelectedIndexes}
        menuDisabled={menuDisabled}
        scrollBoardIndex={scrollBoardIndex}
        setScrollBoardIndex={setScrollBoardIndex}
        scrollToBoardItem={scrollToBoardItem}
        createItem={createItem}
        closeOpenBoard={closeOpenBoard}
        addImage={addImage}
        add10Images={add10Images}
        handleOpenBoardAutoDeleteDuplicates={
          handleOpenBoardAutoDeleteDuplicates
        }
        handleMenuLoadJson={handleMenuLoadJson}
        bulkMoveBoardId={bulkMoveBoardId}
        setBulkMoveBoardId={setBulkMoveBoardId}
        targetBoardOptions={targetBoardOptions}
        handleCopySelectedToBoard={handleCopySelectedToBoard}
        handleMoveSelectedToBoard={handleMoveSelectedToBoard}
        bulkTitle={bulkTitle}
        setBulkTitle={setBulkTitle}
        handleBulkApplyTitle={handleBulkApplyTitle}
        activeAuthorListId={activeAuthorListId}
        bulkAuthor={bulkAuthor}
        setBulkAuthor={setBulkAuthor}
        handleBulkApplyAuthor={handleBulkApplyAuthor}
        bulkMoveIndex={bulkMoveIndex}
        setBulkMoveIndex={setBulkMoveIndex}
        handleBulkMoveSubmit={handleBulkMoveSubmit}
        selectAllImagesForActiveBoard={selectAllImagesForActiveBoard}
        clearOpenBoardSelection={clearOpenBoardSelection}
        handleBulkMoveToTop={handleBulkMoveToTop}
        handleBulkMoveToBottom={handleBulkMoveToBottom}
        handleBulkDelete={handleBulkDelete}
        activeFrequentAuthors={activeFrequentAuthors}
        handleAnalyzeSelectedTitles={handleAnalyzeSelectedTitles}
        isAnalyzingTitles={isAnalyzingTitles}
      />

      {fullscreenViewer && (
        <FullscreenViewer
          fullscreenViewer={fullscreenViewer}
          data={sortedData}
          markDirty={markDirty}
          setData={setData}
          setSelectionByBoard={setSelectionByBoard}
          setLastSelectedByBoard={setLastSelectedByBoard}
          setFullscreenViewer={setFullscreenViewer}
          closeFullscreenViewer={closeFullscreenViewer}
          moveFullscreenImageToBoard={moveFullscreenImageToBoard}
          updateFullscreenImageUrl={updateFullscreenImageUrl}
          updateFullscreenImageAuthor={updateFullscreenImageAuthor}
          updateFullscreenImageTitle={updateFullscreenImageTitle}
          onAnalyzeImage={handleAnalyzeSingleImageTitle}
          isAnalyzingTitles={isAnalyzingTitles}
        />
      )}

      <div style={{ height: 10 }} />

      <FooterComp />
    </main>
  )
}

const BoardItem = ({
  item,
  index,
  imageRefs,
  toggleItem,
  updateItem,
  deleteItem,
  deleteImage,
  setData,
  markDirty,
  selectedIndexes,
  onSelectImage,
  onOpenFullscreen,
  onAnalyzeImage,
  isAnalyzingTitles,
  boardRef,
}) => {
  const missingTitleCount = item.images.filter(
    (img) => !img.title?.trim(),
  ).length

  const missingAuthorCount = item.images.filter(
    (img) => !img.imageAuthor?.trim(),
  ).length

  const duplicateCount = getDuplicateItemCount(item.images)

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
          <span
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>
              {index + 1}. {item.title || "Untitled"} ({item.eventStartYear}) |
            </span>

            <span className="flex-row" style={{ gap: 5 }}>
              {item.images.length}
              <GoImage />
            </span>

            <span>|</span>

            <span className="flex-row" style={{ gap: 5 }}>
              {missingTitleCount}
              <PiTextAa />
            </span>

            <span>|</span>

            <span className="flex-row" style={{ gap: 5 }}>
              {missingAuthorCount}
              <FaCircleUser />
            </span>

            {selectedIndexes.length > 0 && (
              <>
                <span>|</span>
                <span>{selectedIndexes.length} selected</span>
              </>
            )}
          </span>
          {duplicateCount > 0 && (
            <>
              <span>|</span>
              <span
                className="flex-row"
                style={{
                  gap: 5,
                  color: "crimson",
                }}
              >
                {duplicateCount} duplicates
              </span>
            </>
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
            type="number"
            placeholder="board eventStartYear"
            value={item.eventStartYear ?? ""}
            onChange={(e) =>
              updateItem(
                item.id,
                "eventStartYear",
                parseOptionalYear(e.target.value),
              )
            }
          />

          <input
            type="number"
            placeholder="board eventEndYear"
            value={item.eventEndYear ?? ""}
            onChange={(e) =>
              updateItem(
                item.id,
                "eventEndYear",
                parseOptionalYear(e.target.value),
              )
            }
          />
          <label
            className="flex-row"
            style={{
              cursor: "pointer",
              width: "fit-content",
              alignItems: "center",
              gap: 8,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={item.publishOn ?? true}
              onChange={(e) =>
                updateItem(item.id, "publishOn", e.target.checked)
              }
              style={{
                width: 20,
                height: 20,
                minWidth: 20,
                padding: 0,
                margin: 0,
                borderRadius: 5,
                flex: "0 0 auto",
              }}
            />
            <span>Publish on</span>
          </label>

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
                {item.images.map((img, idx) => {
                  const imageRef = (node) => {
                    const key = `${item.id}-${idx}`

                    if (node) {
                      imageRefs.current[key] = node
                    } else {
                      delete imageRefs.current[key]
                    }
                  }

                  return (
                    <SortableImage
                      key={idx}
                      id={idx.toString()}
                      img={img}
                      index={idx}
                      imageRef={imageRef}
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
                      onAnalyzeImage={(imageIndex) =>
                        onAnalyzeImage(item.id, imageIndex)
                      }
                      isAnalyzingImage={isAnalyzingTitles}
                      maxIndex={item.images.length - 1}
                    />
                  )
                })}
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

export default JsonEditorPage
