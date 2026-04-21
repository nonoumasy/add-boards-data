export const FooterComp = ({ color }) => {
  return (
    <p
      style={{
        cursor: "pointer",
        fontSize: 14,
        color: "initial",
        textTransform: "uppercase",
        letterSpacing: 3,
        color: color || "CanvasText", // auto-adjusts
        textAlign: "center",
      }}
    >
      {`© ${new Date().getFullYear()} HistoryMaps`}
    </p>
  )
}
