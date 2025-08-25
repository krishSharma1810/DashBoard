import { useEffect, useState } from "react";
import "./App.css"
// import LiveFeed from "../../my-project/src/Components/LivePositionsREST"
import TestBoard2 from "./Components/TestBoard2";
import TestBoard3 from "./Components/TestBoard3";

function App() {
  
  return (
    <div className="bg-white text-black flex w-screen">
      {/* <LiveFeed/> */}
      {/* <TestBoard2/> */}
      <TestBoard3/>
    </div>
  );
}

export default App;
