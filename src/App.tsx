import "./App.css";
import { SubtitleList } from "@/features/editor/SubtitleList";
import { LoadingScreen } from "@/components/Branding";

function App() {
  return (
    <div className="w-full h-screen overflow-hidden">
      <LoadingScreen />
      <SubtitleList />
    </div>
  );
}

export default App;
