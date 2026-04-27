import { MdClose } from "react-icons/md"
import {
  IoLogoGoogle,
  IoMdArrowRoundDown,
  IoMdArrowRoundUp,
} from "react-icons/io"
import { ICON_SIZE, getYoutubeEmbedUrl, moveImageInArray } from "./utils"

const FullscreenViewer = ({
  fullscreenViewer,
  data,
  markDirty,
  setData,
  setSelectionByBoard,
  setLastSelectedByBoard,
  setFullscreenViewer,
  closeFullscreenViewer,
  moveFullscreenImageToBoard,
  updateFullscreenImageUrl,
  updateFullscreenImageAuthor,
  updateFullscreenImageTitle,
}) => {
  const board = data.find((item) => item.id === fullscreenViewer.boardId)
  const activeImage = board?.images?.[fullscreenViewer.imageIndex]

  if (!board || !activeImage) return null

  const embedUrl = getYoutubeEmbedUrl(activeImage.image)
  const fullscreenTargetBoardOptions = data.filter(
    (item) => item.id !== board.id,
  )

  const handleFullscreenGoogleImageSearch = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!activeImage.image?.trim()) return

    window.open(
      `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(
        activeImage.image,
      )}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  const moveActiveImageToTop = (e) => {
    e.stopPropagation()

    const current = fullscreenViewer?.imageIndex
    const currentBoard = data.find(
      (item) => item.id === fullscreenViewer?.boardId,
    )

    if (current == null || !currentBoard) return
    if (current <= 0) return

    markDirty()

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
            imageIndex: 0,
          }
        : prev,
    )
  }

  const moveActiveImageToBottom = (e) => {
    e.stopPropagation()

    const current = fullscreenViewer?.imageIndex
    const currentBoard = data.find(
      (item) => item.id === fullscreenViewer?.boardId,
    )

    if (current == null || !currentBoard) return

    const lastIndex = currentBoard.images.length - 1
    if (current >= lastIndex) return

    markDirty()

    setData((prev) =>
      prev.map((item) => {
        if (item.id !== fullscreenViewer.boardId) return item

        return {
          ...item,
          images: moveImageInArray(item.images, current, lastIndex),
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
            imageIndex: lastIndex,
          }
        : prev,
    )
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#222",
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
          zIndex: 3,
          gap: 20,
        }}
      >
        <div style={{ flex: "0 0 auto" }}>
          {`${fullscreenViewer.imageIndex + 1} / ${board.images.length}`}
        </div>

        <div className="flex-row" style={{ gap: 10, alignItems: "center" }}>
          <IoLogoGoogle
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleFullscreenGoogleImageSearch}
            title="Google"
            style={{
              cursor: activeImage.image?.trim() ? "pointer" : "default",
              opacity: activeImage.image?.trim() ? 1 : 0.5,
            }}
          />

          <IoMdArrowRoundUp
            className="icon-button"
            size={ICON_SIZE}
            onClick={moveActiveImageToTop}
            title="Move To Top"
            style={{ cursor: "pointer" }}
          />

          <IoMdArrowRoundDown
            className="icon-button"
            size={ICON_SIZE}
            onClick={moveActiveImageToBottom}
            title="Move To Bottom"
            style={{ cursor: "pointer" }}
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
            padding: "72px 20px 72px",
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

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          padding: 10,
          zIndex: 3,
          display: "flex",
          justifyContent: "flex-end",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 300,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            pointerEvents: "auto",
          }}
        >
          <select
            value=""
            onChange={(e) => {
              moveFullscreenImageToBoard(e.target.value)
              e.target.value = ""
            }}
            style={{
              boxSizing: "border-box",
              color: "#fff",
              background: "rgba(0,0,0,0.75)",
            }}
          >
            <option value="">move this item to board</option>
            {fullscreenTargetBoardOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || "Untitled"}
              </option>
            ))}
          </select>
          <input
            value={activeImage.image || ""}
            onChange={(e) => updateFullscreenImageUrl(e.target.value)}
            placeholder="Image URL"
            style={{
              boxSizing: "border-box",
              color: "#fff",
              background: "rgba(0,0,0,0.75)",
            }}
          />
          <input
            value={activeImage.imageAuthor || ""}
            onChange={(e) => updateFullscreenImageAuthor(e.target.value)}
            placeholder="Author"
            style={{
              boxSizing: "border-box",
              color: "#fff",
              background: "rgba(0,0,0,0.75)",
            }}
          />

          <textarea
            rows={20}
            value={activeImage.title || ""}
            onChange={(e) => updateFullscreenImageTitle(e.target.value)}
            placeholder="Title"
            style={{
              boxSizing: "border-box",
              color: "#fff",
              background: "rgba(0,0,0,0.75)",
              resize: "vertical",
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default FullscreenViewer
