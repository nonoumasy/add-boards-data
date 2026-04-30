import {
  MdAutoAwesome,
  MdCheck,
  MdClose,
  MdContentCopy,
  MdDragIndicator,
  MdRemove,
} from "react-icons/md"
import {
  IoMdAdd,
  IoMdArrowRoundDown,
  IoMdArrowRoundUp,
  IoMdArrowUp,
} from "react-icons/io"
import { AiOutlineDelete } from "react-icons/ai"
import { TbNumber10Small, TbPhotoMinus } from "react-icons/tb"
import { HiPlusSm } from "react-icons/hi"
import { GoCircleSlash, GoImage } from "react-icons/go"
import { PiTextAa } from "react-icons/pi"
import { FaCircleUser } from "react-icons/fa6"
import { IoImagesOutline } from "react-icons/io5"
import { ICON_SIZE, MENU_WIDTH, getFloatingTransform } from "./utils"

const Menu = ({
  menuRef,
  floatingMenuPosition,
  isMenuMinimized,
  setIsMenuMinimized,
  handleMenuDragStart,
  openBoard,
  openBoardDuplicateCount,
  openBoardMissingTitleCount,
  openBoardMissingAuthorCount,
  activeSelectedIndexes,
  menuDisabled,
  scrollBoardIndex,
  setScrollBoardIndex,
  scrollToBoardItem,
  createItem,
  closeOpenBoard,
  addImage,
  add10Images,
  handleOpenBoardAutoDeleteDuplicates,
  handleMenuLoadJson,
  bulkMoveBoardId,
  setBulkMoveBoardId,
  targetBoardOptions,
  handleCopySelectedToBoard,
  handleMoveSelectedToBoard,
  bulkTitle,
  setBulkTitle,
  handleBulkApplyTitle,
  activeAuthorListId,
  bulkAuthor,
  setBulkAuthor,
  handleBulkApplyAuthor,
  bulkMoveIndex,
  setBulkMoveIndex,
  handleBulkMoveSubmit,
  selectAllImagesForActiveBoard,
  clearOpenBoardSelection,
  handleBulkMoveToTop,
  handleBulkMoveToBottom,
  handleBulkDelete,
  activeFrequentAuthors,
  handleAnalyzeSelectedTitles,
  isAnalyzingTitles,
}) => (
  <div
    ref={menuRef}
    className="flex-column"
    style={{
      position: "fixed",
      left: 0,
      top: 0,
      transform: getFloatingTransform(
        floatingMenuPosition.xPercent,
        floatingMenuPosition.yPercent,
      ),
      width: MENU_WIDTH,
      maxWidth: "calc(100vw - 16px)",
      borderRadius: 10,
      border: "1px solid white",
      backgroundColor: "Canvas",
      padding: 20,
      zIndex: 9999,
      boxShadow: "0 1px 2px rgba(0,0,0,0.5), 0 5px 10px rgba(0,0,0,0.25)",
      gap: isMenuMinimized ? 0 : 10,
      willChange: "transform",
    }}
  >
    <div
      className="flex-column"
      onMouseDown={handleMenuDragStart}
      style={{ cursor: "grab", gap: isMenuMinimized ? 0 : 20 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          userSelect: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: "0 0 auto",
          }}
        >
          <MdDragIndicator
            size={20}
            title="Drag menu"
            style={{
              flex: "0 0 auto",
            }}
          />

          <IoMdAdd
            className="icon-button"
            size={ICON_SIZE}
            onClick={(e) => {
              e.stopPropagation()
              createItem()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Create Board"
            style={{
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          />
          <MdClose
            onClick={(e) => {
              e.stopPropagation()
              closeOpenBoard()
            }}
            className="icon-button"
            title="Close Open Board"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.5 : 1,
              flex: "0 0 auto",
            }}
          />
        </div>

        <div
          className="flex-row"
          style={{
            gap: 5,
            flex: "0 0 auto",
          }}
        >
          <input
            min="1"
            max={openBoard?.images.length || 1}
            value={scrollBoardIndex}
            onChange={(e) => setScrollBoardIndex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              scrollToBoardItem()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              textAlign: "right",
              width: 60,
              height: 30,
            }}
          />

          {isMenuMinimized ? (
            <IoMdAdd
              onClick={(e) => {
                e.stopPropagation()
                setIsMenuMinimized(false)
              }}
              className="icon-button"
              title="Expand Menu"
              size={ICON_SIZE}
              style={{
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            />
          ) : (
            <MdRemove
              onClick={(e) => {
                e.stopPropagation()
                setIsMenuMinimized(true)
              }}
              className="icon-button"
              title="Minimize Menu"
              size={ICON_SIZE}
              style={{
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            />
          )}
        </div>
      </div>

      {!isMenuMinimized && (
        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <p>
            {openBoard ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span>{openBoard.title || "Untitled"}</span>

                <span className="flex-row" style={{ gap: 5 }}>
                  {activeSelectedIndexes.length}/{openBoard.images.length}
                  <GoImage />
                </span>

                <span>|</span>

                <span className="flex-row" style={{ gap: 5 }}>
                  {openBoardMissingTitleCount}
                  <PiTextAa />
                </span>

                <span>|</span>

                <span className="flex-row" style={{ gap: 5 }}>
                  {openBoardMissingAuthorCount}
                  <FaCircleUser />
                </span>

                <span>|</span>

                <span className="flex-row" style={{ gap: 5 }}>
                  {openBoardDuplicateCount}
                  <IoImagesOutline />
                </span>
              </span>
            ) : (
              "No open board"
            )}
          </p>
        </div>
      )}
    </div>

    {!isMenuMinimized && (
      <>
        <div className="flex-row">
          <HiPlusSm
            onClick={addImage}
            className="icon-button"
            title="Add Item"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.5 : 1,
            }}
          />

          <TbNumber10Small
            onClick={add10Images}
            className="icon-button"
            title="Add 10 Items"
            size={ICON_SIZE}
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.5 : 1,
            }}
          />

          <TbPhotoMinus
            onClick={handleOpenBoardAutoDeleteDuplicates}
            className="icon-button"
            title="Delete Duplicates"
            size={ICON_SIZE}
            style={{
              cursor:
                menuDisabled || openBoardDuplicateCount === 0
                  ? "default"
                  : "pointer",
              opacity: menuDisabled || openBoardDuplicateCount === 0 ? 0.5 : 1,
            }}
          />
        </div>

        <input
          type="file"
          accept=".json"
          multiple
          onChange={handleMenuLoadJson}
          disabled={menuDisabled}
          style={{ border: "1px solid" }}
        />

        <div style={{ position: "relative" }}>
          <select
            disabled={menuDisabled}
            value={bulkMoveBoardId}
            onChange={(e) => setBulkMoveBoardId(e.target.value)}
            style={{
              width: "100%",
              paddingRight: 70,
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              backgroundImage: "none",
            }}
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
                  ? 0.5
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
                  ? 0.5
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
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
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
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="number"
            min="0"
            max={openBoard?.images.length || 0}
            required
            placeholder="target index"
            value={bulkMoveIndex}
            onChange={(e) => setBulkMoveIndex(e.target.value)}
          />

          <button onClick={handleBulkMoveSubmit} title="Move Selected">
            Move
          </button>
        </div>

        <div className="flex-row">
          <MdCheck
            className="icon-button"
            size={ICON_SIZE}
            onClick={selectAllImagesForActiveBoard}
            title="Select All In Board"
            style={{
              cursor: menuDisabled ? "default" : "pointer",
              opacity: menuDisabled ? 0.5 : 1,
            }}
          />

          <GoCircleSlash
            className="icon-button"
            size={ICON_SIZE}
            onClick={clearOpenBoardSelection}
            title="Deselect All"
            style={{
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
            }}
          />

          <MdAutoAwesome
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleAnalyzeSelectedTitles}
            title="Analyze Selected"
            style={{
              cursor:
                menuDisabled ||
                activeSelectedIndexes.length === 0 ||
                isAnalyzingTitles
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled ||
                activeSelectedIndexes.length === 0 ||
                isAnalyzingTitles
                  ? 0.5
                  : 1,
            }}
          />

          <IoMdArrowRoundUp
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkMoveToTop}
            title="Move Selected To Top"
            style={{
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
            }}
          />

          <IoMdArrowRoundDown
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkMoveToBottom}
            title="Move Selected To Bottom"
            style={{
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
            }}
          />

          <AiOutlineDelete
            className="icon-button"
            size={ICON_SIZE}
            onClick={handleBulkDelete}
            title="Delete Selected"
            style={{
              cursor:
                menuDisabled || activeSelectedIndexes.length === 0
                  ? "default"
                  : "pointer",
              opacity:
                menuDisabled || activeSelectedIndexes.length === 0 ? 0.5 : 1,
            }}
          />
        </div>

        <datalist id={activeAuthorListId}>
          {activeFrequentAuthors.map((author) => (
            <option key={author} value={author} />
          ))}
        </datalist>
      </>
    )}
  </div>
)

export default Menu
