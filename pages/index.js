import dynamic from "next/dynamic"

const JsonEditorPage = dynamic(() => import("@/components/JsonEditorPage"), {
  ssr: false,
})

const Home = () => {
  return <JsonEditorPage />
}

export default Home
