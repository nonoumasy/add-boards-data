export const DividerComp = ({ height = 1, type = "solid", opacity = 0.5 }) => {
  return (
    <div
      style={{
        borderBottom: `${height}px ${type}`,
        margin: "10px 0",
        opacity,
      }}
    ></div>
  )
}
