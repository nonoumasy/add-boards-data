import { useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AiOutlineDelete } from "react-icons/ai"
import {
  IoLogoGoogle,
  IoMdArrowRoundDown,
  IoMdArrowRoundUp,
} from "react-icons/io"
import { MdOutlineDragIndicator } from "react-icons/md"
import { getYoutubeEmbedUrl, ICON_SIZE } from "./utils"

export const SortableImage = ({
  id,
  img,
  index,
  imageRef,
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
    const target = e.target instanceof Element ? e.target : null

    if (
      target?.closest("input") ||
      target?.closest("textarea") ||
      target?.closest("button") ||
      target?.closest("iframe") ||
      target?.closest("label") ||
      target?.closest("svg")
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
      ref={(node) => {
        setNodeRef(node)
        imageRef?.(node)
      }}
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
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 2,
            }}
          >
            <IoLogoGoogle
              className="icon-button"
              size={ICON_SIZE}
              onClick={handleGoogleImageSearch}
              title="Google"
              style={{ cursor: "pointer" }}
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

        <button type="submit" onClick={(e) => e.stopPropagation()}>
          Move
        </button>
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
